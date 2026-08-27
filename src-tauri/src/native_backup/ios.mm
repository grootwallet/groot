#import <UIKit/UIKit.h>

typedef void (^GrootRecoveryCompletion)(BOOL confirmed);

@interface GrootRecoveryViewController : UIViewController
@property(nonatomic, copy) NSArray<NSString *> *words;
@property(nonatomic, copy) GrootRecoveryCompletion completion;
@end

@implementation GrootRecoveryViewController

- (void)viewDidLoad {
  [super viewDidLoad];
  self.view.backgroundColor = UIColor.systemBackgroundColor;
  self.modalInPresentation = YES;

  UILabel *title = [[UILabel alloc] init];
  title.text = @"Groot recovery words";
  title.font = [UIFont preferredFontForTextStyle:UIFontTextStyleTitle2];
  title.adjustsFontForContentSizeCategory = YES;

  UILabel *instruction = [[UILabel alloc] init];
  instruction.text = @"Write these 24 words down in order. Keep them offline.";
  instruction.font = [UIFont preferredFontForTextStyle:UIFontTextStyleSubheadline];
  instruction.textColor = UIColor.secondaryLabelColor;
  instruction.adjustsFontForContentSizeCategory = YES;
  instruction.numberOfLines = 2;

  UIStackView *(^makeColumn)(NSInteger) = ^UIStackView *(NSInteger start) {
    UIStackView *column = [[UIStackView alloc] init];
    column.axis = UILayoutConstraintAxisVertical;
    column.alignment = UIStackViewAlignmentFill;
    column.distribution = UIStackViewDistributionFillEqually;
    column.spacing = 3.0;
    for (NSInteger offset = 0; offset < 12; offset++) {
      NSInteger index = start + offset;
      UILabel *word = [[UILabel alloc] init];
      word.text = [NSString stringWithFormat:@"%2ld. %@", (long)index + 1, self.words[index]];
      word.font = [UIFont monospacedSystemFontOfSize:16.0 weight:UIFontWeightRegular];
      word.adjustsFontSizeToFitWidth = YES;
      word.minimumScaleFactor = 0.82;
      word.accessibilityLabel =
          [NSString stringWithFormat:@"Word %ld, %@", (long)index + 1, self.words[index]];
      [column addArrangedSubview:word];
    }
    return column;
  };

  UIStackView *grid =
      [[UIStackView alloc] initWithArrangedSubviews:@[ makeColumn(0), makeColumn(12) ]];
  grid.axis = UILayoutConstraintAxisHorizontal;
  grid.alignment = UIStackViewAlignmentFill;
  grid.distribution = UIStackViewDistributionFillEqually;
  grid.spacing = 18.0;

  UILabel *warning = [[UILabel alloc] init];
  warning.text = @"Groot cannot recover these words for you.";
  warning.font = [UIFont preferredFontForTextStyle:UIFontTextStyleFootnote];
  warning.textColor = UIColor.secondaryLabelColor;
  warning.adjustsFontForContentSizeCategory = YES;
  warning.numberOfLines = 2;

  UIButton *cancel = [UIButton buttonWithType:UIButtonTypeSystem];
  [cancel setTitle:@"Cancel" forState:UIControlStateNormal];
  [cancel addTarget:self
                action:@selector(cancelBackup)
      forControlEvents:UIControlEventTouchUpInside];
  cancel.titleLabel.font = [UIFont preferredFontForTextStyle:UIFontTextStyleHeadline];
  cancel.layer.cornerRadius = 12.0;
  cancel.backgroundColor = UIColor.secondarySystemBackgroundColor;

  UIButton *confirm = [UIButton buttonWithType:UIButtonTypeSystem];
  [confirm setTitle:@"I wrote them down" forState:UIControlStateNormal];
  [confirm addTarget:self
                action:@selector(confirmBackup)
      forControlEvents:UIControlEventTouchUpInside];
  confirm.titleLabel.font = [UIFont preferredFontForTextStyle:UIFontTextStyleHeadline];
  confirm.layer.cornerRadius = 12.0;
  confirm.backgroundColor = UIColor.systemBlueColor;
  [confirm setTitleColor:UIColor.whiteColor forState:UIControlStateNormal];

  UIStackView *actions = [[UIStackView alloc] initWithArrangedSubviews:@[ cancel, confirm ]];
  actions.axis = UILayoutConstraintAxisVertical;
  actions.distribution = UIStackViewDistributionFillEqually;
  actions.spacing = 10.0;

  UIStackView *content = [[UIStackView alloc]
      initWithArrangedSubviews:@[ title, instruction, grid, warning, actions ]];
  content.translatesAutoresizingMaskIntoConstraints = NO;
  content.axis = UILayoutConstraintAxisVertical;
  content.alignment = UIStackViewAlignmentFill;
  content.spacing = 14.0;
  [self.view addSubview:content];

  UILayoutGuide *safe = self.view.safeAreaLayoutGuide;
  [NSLayoutConstraint activateConstraints:@[
    [content.leadingAnchor constraintEqualToAnchor:safe.leadingAnchor constant:24.0],
    [content.trailingAnchor constraintEqualToAnchor:safe.trailingAnchor constant:-24.0],
    [content.topAnchor constraintGreaterThanOrEqualToAnchor:safe.topAnchor constant:20.0],
    [content.bottomAnchor constraintLessThanOrEqualToAnchor:safe.bottomAnchor constant:-20.0],
    [content.centerYAnchor constraintEqualToAnchor:safe.centerYAnchor],
    [grid.heightAnchor constraintEqualToConstant:294.0],
    [cancel.heightAnchor constraintEqualToConstant:48.0],
    [confirm.heightAnchor constraintEqualToConstant:48.0]
  ]];
}

- (void)finish:(BOOL)confirmed {
  GrootRecoveryCompletion completion = self.completion;
  [self dismissViewControllerAnimated:YES
                           completion:^{
                             if (completion != nil) completion(confirmed);
                           }];
}

- (void)cancelBackup {
  [self finish:NO];
}

- (void)confirmBackup {
  [self finish:YES];
}

@end

static UIViewController *GrootTopViewController(void) {
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:UIWindowScene.class] ||
        scene.activationState == UISceneActivationStateUnattached)
      continue;
    for (UIWindow *window in ((UIWindowScene *)scene).windows) {
      if (!window.isKeyWindow || window.rootViewController == nil) continue;
      UIViewController *controller = window.rootViewController;
      while (controller.presentedViewController != nil)
        controller = controller.presentedViewController;
      return controller;
    }
  }
  return nil;
}

extern "C" int groot_present_ios_recovery_words(const char *words_utf8) {
  if (words_utf8 == nullptr || NSThread.isMainThread) return -1;
  NSString *payload = [NSString stringWithUTF8String:words_utf8];
  if (payload == nil) return -1;
  NSArray<NSString *> *words =
      [payload componentsSeparatedByCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
  words = [words filteredArrayUsingPredicate:
                     [NSPredicate predicateWithBlock:^BOOL(NSString *word,
                                                           NSDictionary<NSString *, id> *_) {
                       return word.length > 0;
                     }]];
  if (words.count != 24) return -1;

  dispatch_semaphore_t finished = dispatch_semaphore_create(0);
  __block int result = -1;
  dispatch_async(dispatch_get_main_queue(), ^{
    UIViewController *presenter = GrootTopViewController();
    if (presenter == nil) {
      dispatch_semaphore_signal(finished);
      return;
    }

    UIAlertController *privacy = [UIAlertController
        alertControllerWithTitle:@"Check your surroundings"
                         message:@"Only continue in a private place. Make sure no person, camera, or screen sharing can see your recovery words."
                  preferredStyle:UIAlertControllerStyleAlert];
    [privacy addAction:
                 [UIAlertAction actionWithTitle:@"Cancel"
                                          style:UIAlertActionStyleCancel
                                        handler:^(__unused UIAlertAction *action) {
                                          result = 0;
                                          dispatch_semaphore_signal(finished);
                                        }]];
    [privacy addAction:
                 [UIAlertAction actionWithTitle:@"I'm private — reveal words"
                                          style:UIAlertActionStyleDefault
                                        handler:^(__unused UIAlertAction *action) {
                                          dispatch_async(dispatch_get_main_queue(), ^{
                                            UIViewController *top = GrootTopViewController();
                                            if (top == nil) {
                                              dispatch_semaphore_signal(finished);
                                              return;
                                            }
                                            GrootRecoveryViewController *backup =
                                                [[GrootRecoveryViewController alloc] init];
                                            backup.words = words;
                                            backup.modalPresentationStyle =
                                                UIModalPresentationPageSheet;
                                            backup.completion = ^(BOOL confirmed) {
                                              result = confirmed ? 1 : 0;
                                              dispatch_semaphore_signal(finished);
                                            };
                                            [top presentViewController:backup
                                                              animated:YES
                                                            completion:nil];
                                          });
                                        }]];
    [presenter presentViewController:privacy animated:YES completion:nil];
  });
  dispatch_semaphore_wait(finished, DISPATCH_TIME_FOREVER);
  return result;
}
