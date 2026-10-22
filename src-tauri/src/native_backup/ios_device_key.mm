#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import <LocalAuthentication/LocalAuthentication.h>
#include <string.h>

// Called only from Rust blocking workers. No key bytes enter WKWebView.
static NSDictionary *deviceQuery(const char *scope_utf8, bool create) {
  NSString *scope = [NSString stringWithUTF8String:scope_utf8];
  if (scope == nil || scope.length > 128) return nil;
  NSFileManager *files = NSFileManager.defaultManager;
  NSURL *support = [files URLsForDirectory:NSApplicationSupportDirectory
                               inDomains:NSUserDomainMask].firstObject;
  if (support == nil) return nil;
  NSURL *marker = [support URLByAppendingPathComponent:@"groot-device-installation-v1"];
  NSData *encoded = [NSData dataWithContentsOfURL:marker];
  NSString *installation = encoded == nil ? nil : [[NSString alloc] initWithData:encoded encoding:NSUTF8StringEncoding];
  if (installation == nil) {
    if (!create || [files fileExistsAtPath:marker.path]) return nil;
    if (![files createDirectoryAtURL:support withIntermediateDirectories:YES attributes:nil error:nil]) return nil;
    installation = NSUUID.UUID.UUIDString;
    if (![[installation dataUsingEncoding:NSUTF8StringEncoding] writeToURL:marker options:NSDataWritingAtomic error:nil]) return nil;
  }
  if ([[NSUUID alloc] initWithUUIDString:installation] == nil ||
      ![marker setResourceValue:@YES forKey:NSURLIsExcludedFromBackupKey error:nil]) return nil;
  NSString *service = [NSBundle.mainBundle.bundleIdentifier stringByAppendingString:@".device-keys.v1"];
  if (service == nil) return nil;
  return @{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: service,
    (__bridge id)kSecAttrAccount: [NSString stringWithFormat:@"%@.%@", installation, scope],
    (__bridge id)kSecAttrSynchronizable: @NO
  };
}

static NSMutableDictionary *credentialQuery(NSDictionary *base) {
  NSMutableDictionary *query = [base mutableCopy];
  query[(__bridge id)kSecAttrAccount] = [base[(__bridge id)kSecAttrAccount] stringByAppendingString:@".credential.v1"];
  return query;
}

// Add a separate item; never delete or replace the old user-presence item.
// Existing ciphertext and older app versions therefore remain recoverable.
static OSStatus rememberKey(NSDictionary *base, const unsigned char *key, size_t capacity) {
  NSMutableDictionary *item = credentialQuery(base);
  item[(__bridge id)kSecAttrAccessible] = (__bridge id)kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly;
  item[(__bridge id)kSecValueData] = [NSData dataWithBytes:key length:capacity];
  OSStatus status = SecItemAdd((__bridge CFDictionaryRef)item, nullptr);
  if (status != errSecSuccess && status != errSecDuplicateItem) return status;
  NSMutableDictionary *query = credentialQuery(base);
  query[(__bridge id)kSecReturnData] = @YES;
  query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
  LAContext *silent = [[LAContext alloc] init];
  silent.interactionNotAllowed = YES;
  query[(__bridge id)kSecUseAuthenticationContext] = silent;
  CFTypeRef found = nullptr;
  status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &found);
  if (status != errSecSuccess || found == nullptr) {
    if (found != nullptr) CFRelease(found);
    return status == errSecSuccess ? errSecDecode : status;
  }
  NSData *data = CFBridgingRelease(found);
  if (data.length != capacity) return errSecDecode;
  unsigned char mismatch = 0;
  const unsigned char *bytes = (const unsigned char *)data.bytes;
  for (size_t i = 0; i < capacity; ++i) mismatch |= key[i] ^ bytes[i];
  return mismatch == 0 ? errSecSuccess : errSecDecode;
}

extern "C" int groot_ios_device_key(const char *scope_utf8, unsigned char *output,
                                     size_t capacity, bool create) {
  if (scope_utf8 == nullptr || output == nullptr || capacity != 32 || NSThread.isMainThread) return -1;
  memset(output, 0, capacity);
  @autoreleasepool {
    NSDictionary *base = deviceQuery(scope_utf8, create);
    if (base == nil) return -1;
    NSMutableDictionary *query = credentialQuery(base);
    query[(__bridge id)kSecReturnData] = @YES;
    query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
    LAContext *silent = [[LAContext alloc] init];
  silent.interactionNotAllowed = YES;
  query[(__bridge id)kSecUseAuthenticationContext] = silent;
    CFTypeRef found = nullptr;
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &found);
    if (status == errSecItemNotFound) {
      // Legacy RC2–RC5 keys require one final owner approval. Rust only copies
      // them into the new policy after successful Groot credential validation.
      query = [base mutableCopy];
      query[(__bridge id)kSecReturnData] = @YES;
      query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
      LAContext *authentication = [[LAContext alloc] init];
      authentication.localizedReason = @"Update this wallet to use only its Groot credential";
      query[(__bridge id)kSecUseAuthenticationContext] = authentication;
      status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &found);
    }
    if (status == errSecItemNotFound && create) {
      unsigned char random[32];
      if (SecRandomCopyBytes(kSecRandomDefault, sizeof random, random) != errSecSuccess) return -1;
      status = rememberKey(base, random, sizeof random);
      if (status == errSecSuccess) memcpy(output, random, sizeof random);
      memset(random, 0, sizeof random);
      return status == errSecSuccess ? 0 : -1;
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

extern "C" int groot_ios_remember_device_key(const char *scope_utf8,
                                              const unsigned char *key, size_t capacity) {
  if (scope_utf8 == nullptr || key == nullptr || capacity != 32 || NSThread.isMainThread) return -1;
  @autoreleasepool {
    NSDictionary *base = deviceQuery(scope_utf8, false);
    return base != nil && rememberKey(base, key, capacity) == errSecSuccess ? 0 : -1;
  }
}
