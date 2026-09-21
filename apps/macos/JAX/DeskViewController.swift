import Cocoa
import WebKit

final class DeskViewController: NSViewController, WKNavigationDelegate {
  private var web: WKWebView!

  override func loadView() {
    let config = WKWebViewConfiguration()
    web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1100, height: 760), configuration: config)
    web.navigationDelegate = self
    view = web
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    let url = URL(string: "https://ledger-futuret3ch.vercel.app/app")!
    web.load(URLRequest(url: url))
  }
}
