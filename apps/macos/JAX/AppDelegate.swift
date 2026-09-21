import Cocoa

@main
class AppDelegate: NSObject, NSApplicationDelegate {
  var window: NSWindow?

  func applicationDidFinishLaunching(_ notification: Notification) {
    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1100, height: 760),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.title = "JAX"
    window.center()
    window.contentViewController = DeskViewController()
    window.makeKeyAndOrderFront(nil)
    self.window = window
  }
}
