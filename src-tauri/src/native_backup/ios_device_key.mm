#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import <LocalAuthentication/LocalAuthentication.h>
#include <string.h>

// Called only from a Rust blocking worker. Secrets never enter WKWebView.
extern "C" int groot_ios_device_key(const char *scope_utf8, unsigned char *output,
                                      size_t capacity, bool create) {
  if (scope_utf8 == nullptr || output == nullptr || capacity != 32 || NSThread.isMainThread)
    return -1;
  memset(output, 0, capacity);
  @autoreleasepool {
    NSString *scope = [NSString stringWithUTF8String:scope_utf8];
    if (scope == nil || scope.length > 128) return -1;
    NSFileManager *files = NSFileManager.defaultManager;
    NSURL *support = [files URLsForDirectory:NSApplicationSupportDirectory
                                 inDomains:NSUserDomainMask].firstObject;
    if (support == nil) return -1;
    NSURL *marker = [support URLByAppendingPathComponent:@"groot-device-installation-v1"];
    // Serialised by the Rust key-store mutex, including the first creation.
    NSData *encoded = [NSData dataWithContentsOfURL:marker];
    NSString *installation = encoded == nil ? nil : [[NSString alloc] initWithData:encoded
                                                                         encoding:NSUTF8StringEncoding];
    if (installation == nil) {
      if (!create || [files fileExistsAtPath:marker.path]) return -1;
      if (![files createDirectoryAtURL:support withIntermediateDirectories:YES attributes:nil error:nil])
        return -1;
      installation = NSUUID.UUID.UUIDString;
      if (![[installation dataUsingEncoding:NSUTF8StringEncoding] writeToURL:marker
                                                                   options:NSDataWritingAtomic error:nil])
        return -1;
    }
    if ([[NSUUID alloc] initWithUUIDString:installation] == nil) return -1;
    if (![marker setResourceValue:@YES forKey:NSURLIsExcludedFromBackupKey error:nil]) return -1;
    NSString *service = [NSBundle.mainBundle.bundleIdentifier stringByAppendingString:@".device-keys.v1"];
    if (service == nil) return -1;
    NSString *account = [NSString stringWithFormat:@"%@.%@", installation, scope];
    LAContext *authentication = [[LAContext alloc] init];
    authentication.localizedReason = @"Authorize access to this Groot wallet";
    NSMutableDictionary *query = [@{
      (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
      (__bridge id)kSecAttrService: service,
      (__bridge id)kSecAttrAccount: account,
      (__bridge id)kSecAttrSynchronizable: @NO,
      (__bridge id)kSecReturnData: @YES,
      (__bridge id)kSecMatchLimit: (__bridge id)kSecMatchLimitOne,
      (__bridge id)kSecUseAuthenticationContext: authentication
    } mutableCopy];
    CFTypeRef found = nullptr;
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &found);
    if (status == errSecItemNotFound && create) {
      unsigned char random[32];
      if (SecRandomCopyBytes(kSecRandomDefault, sizeof random, random) != errSecSuccess) return -1;
      SecAccessControlRef access = SecAccessControlCreateWithFlags(kCFAllocatorDefault,
          kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, kSecAccessControlUserPresence, nullptr);
      if (access == nullptr) { memset(random, 0, sizeof random); return -1; }
      NSDictionary *item = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrService: service,
        (__bridge id)kSecAttrAccount: account,
        (__bridge id)kSecAttrSynchronizable: @NO,
        (__bridge id)kSecAttrAccessControl: (__bridge id)access,
        (__bridge id)kSecValueData: [NSData dataWithBytes:random length:sizeof random]
      };
      status = SecItemAdd((__bridge CFDictionaryRef)item, nullptr);
      CFRelease(access);
      memset(random, 0, sizeof random);
      if (status != errSecSuccess) return -1;
      // Authorize a real read before acknowledging successful storage.
      status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &found);
    }
    if (status != errSecSuccess || found == nullptr) {
      if (found != nullptr) CFRelease(found);
      return status == errSecUserCanceled || status == errSecAuthFailed ? 1 : -1;
    }
    NSData *data = CFBridgingRelease(found);
    if (data.length != capacity) return -1;
    memcpy(output, data.bytes, capacity);
    return 0;
  }
}
