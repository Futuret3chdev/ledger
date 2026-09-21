import UIKit
import WebKit

final class DeskViewController: UIViewController, WKNavigationDelegate {
  private var web: WKWebView!

  override func loadView() {
    let config = WKWebViewConfiguration()
    config.allowsInlineMediaPlayback = true
    config.websiteDataStore = .default()
    web = WKWebView(frame: .zero, configuration: config)
    web.navigationDelegate = self
    web.scrollView.contentInsetAdjustmentBehavior = .never
    view = web
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    let url = URL(string: "https://ledger-futuret3ch.vercel.app/app")!
    web.load(URLRequest(url: url))
  }
}
