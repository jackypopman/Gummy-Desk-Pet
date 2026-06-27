#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface DesktopPetPanel : NSPanel
@end

@implementation DesktopPetPanel
- (BOOL)canBecomeKeyWindow { return YES; }
- (BOOL)canBecomeMainWindow { return NO; }
@end

@interface AppDelegate : NSObject <NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler>
@property(nonatomic, strong) DesktopPetPanel *window;
@property(nonatomic, strong) WKWebView *webView;
@property(nonatomic, strong) NSStatusItem *statusItem;
@property(nonatomic) NSPoint dragMouseOffset;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    [self createWindow];
    [self createStatusItem];
    [self resetPosition:nil];
}

- (void)createWindow {
    NSSize size = NSMakeSize(240, 300);
    NSRect screen = NSScreen.mainScreen.visibleFrame;
    NSPoint origin = NSMakePoint(NSMaxX(screen) - size.width - 22, NSMinY(screen) + 18);

    self.window = [[DesktopPetPanel alloc]
        initWithContentRect:NSMakeRect(origin.x, origin.y, size.width, size.height)
        styleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel
        backing:NSBackingStoreBuffered
        defer:NO];
    self.window.level = NSFloatingWindowLevel;
    self.window.opaque = NO;
    self.window.backgroundColor = NSColor.clearColor;
    self.window.hasShadow = NO;
    self.window.collectionBehavior =
        NSWindowCollectionBehaviorCanJoinAllSpaces |
        NSWindowCollectionBehaviorFullScreenAuxiliary |
        NSWindowCollectionBehaviorStationary;
    self.window.hidesOnDeactivate = NO;
    self.window.movableByWindowBackground = NO;

    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    [configuration.preferences setValue:@YES forKey:@"allowFileAccessFromFileURLs"];
    WKUserScript *nativeMode = [[WKUserScript alloc]
        initWithSource:@"document.documentElement.dataset.nativeDesktop='1';"
        injectionTime:WKUserScriptInjectionTimeAtDocumentStart
        forMainFrameOnly:YES];
    [configuration.userContentController addUserScript:nativeMode];
    [configuration.userContentController addScriptMessageHandler:self name:@"petWindow"];

    self.webView = [[WKWebView alloc] initWithFrame:NSMakeRect(0, 0, size.width, size.height)
                                     configuration:configuration];
    self.webView.navigationDelegate = self;
    [self.webView setValue:@NO forKey:@"drawsBackground"];
    self.webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    self.window.contentView = self.webView;

    NSURL *resourceURL = [NSBundle.mainBundle.resourceURL URLByAppendingPathComponent:@"Web/index.html"];
    if (!resourceURL) {
        [self showBuildError:@"找不到桌宠界面资源。"];
        return;
    }

    [self.webView loadFileURL:resourceURL allowingReadAccessToURL:resourceURL.URLByDeletingLastPathComponent];
}

- (void)createStatusItem {
    self.statusItem = [NSStatusBar.systemStatusBar statusItemWithLength:NSSquareStatusItemLength];
    self.statusItem.button.title = @"ฅ";
    self.statusItem.button.toolTip = @"软糖桌宠";

    NSMenu *menu = [[NSMenu alloc] init];
    [menu addItem:[self menuItem:@"显示桌宠" action:@selector(showPet:)]];
    [menu addItem:[self menuItem:@"隐藏桌宠" action:@selector(hidePet:)]];
    [menu addItem:NSMenuItem.separatorItem];
    [menu addItem:[self menuItem:@"回到屏幕右下角" action:@selector(resetPosition:)]];
    [menu addItem:NSMenuItem.separatorItem];
    NSMenuItem *quit = [self menuItem:@"退出软糖桌宠" action:@selector(quitApp:)];
    quit.keyEquivalent = @"q";
    [menu addItem:quit];
    self.statusItem.menu = menu;
}

- (NSMenuItem *)menuItem:(NSString *)title action:(SEL)action {
    NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:title action:action keyEquivalent:@""];
    item.target = self;
    return item;
}

- (void)showPet:(id)sender {
    [self.window orderFrontRegardless];
    [self.window makeKeyWindow];
}

- (void)hidePet:(id)sender {
    [self.window orderOut:nil];
}

- (void)resetPosition:(id)sender {
    NSRect screen = self.window.screen ? self.window.screen.visibleFrame : NSScreen.mainScreen.visibleFrame;
    NSRect frame = self.window.frame;
    [self.window setFrameOrigin:NSMakePoint(NSMaxX(screen) - frame.size.width - 22, NSMinY(screen) + 18)];
    [self showPet:nil];
}

- (void)resizeWindowTo:(NSSize)size {
    NSRect oldFrame = self.window.frame;
    NSRect screen = self.window.screen ? self.window.screen.visibleFrame : NSScreen.mainScreen.visibleFrame;
    CGFloat petAnchorX = NSMidX(oldFrame);
    CGFloat newX = petAnchorX - size.width / 2.0;
    CGFloat newY = MAX(NSMinY(screen), NSMinY(oldFrame));
    newX = MAX(NSMinX(screen), MIN(newX, NSMaxX(screen) - size.width));
    [self.window setFrame:NSMakeRect(newX, newY, size.width, size.height) display:YES animate:NO];
}

- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.name isEqualToString:@"petWindow"] || ![message.body isKindOfClass:NSDictionary.class]) return;
    NSDictionary *body = (NSDictionary *)message.body;
    NSString *type = body[@"type"];

    if ([type isEqualToString:@"compact"]) {
        [self resizeWindowTo:NSMakeSize(240, 300)];
    } else if ([type isEqualToString:@"panel"]) {
        [self resizeWindowTo:NSMakeSize(420, 440)];
    } else if ([type isEqualToString:@"focus"]) {
        [self resizeWindowTo:NSMakeSize(340, 400)];
    } else if ([type isEqualToString:@"drawer"]) {
        [self resizeWindowTo:NSMakeSize(370, 540)];
    } else if ([type isEqualToString:@"dragStart"]) {
        NSPoint mouse = NSEvent.mouseLocation;
        NSPoint origin = self.window.frame.origin;
        self.dragMouseOffset = NSMakePoint(mouse.x - origin.x, mouse.y - origin.y);
    } else if ([type isEqualToString:@"dragMove"]) {
        NSPoint mouse = NSEvent.mouseLocation;
        NSRect screen = self.window.screen ? self.window.screen.visibleFrame : NSScreen.mainScreen.visibleFrame;
        NSSize size = self.window.frame.size;
        CGFloat x = mouse.x - self.dragMouseOffset.x;
        CGFloat y = mouse.y - self.dragMouseOffset.y;
        x = MAX(NSMinX(screen), MIN(x, NSMaxX(screen) - size.width));
        y = MAX(NSMinY(screen), MIN(y, NSMaxY(screen) - size.height));
        [self.window setFrameOrigin:NSMakePoint(x, y)];
    }
}

- (void)quitApp:(id)sender {
    [NSApp terminate:nil];
}

- (void)showBuildError:(NSString *)message {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"软糖桌宠无法启动";
    alert.informativeText = message;
    [alert runModal];
    [NSApp terminate:nil];
}

- (void)webView:(WKWebView *)webView
didFailNavigation:(WKNavigation *)navigation
      withError:(NSError *)error {
    [self showBuildError:error.localizedDescription];
}

- (void)webView:(WKWebView *)webView
didFailProvisionalNavigation:(WKNavigation *)navigation
      withError:(NSError *)error {
    [self showBuildError:error.localizedDescription];
}

@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *app = NSApplication.sharedApplication;
        AppDelegate *delegate = [[AppDelegate alloc] init];
        app.delegate = delegate;
        [app run];
    }
    return 0;
}
