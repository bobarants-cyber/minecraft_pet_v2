import SwiftUI
import WebKit

/// Lets native code make Bbokari talk on the page.
final class WebBridge {
    weak var webView: WKWebView?

    func say(_ text: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: [text]),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.pocketSay && window.pocketSay(\(json)[0])")
    }

    /// Calls window.<name>(...args) on the page.
    func call(_ name: String, _ args: [Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: args),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.\(name) && window.\(name)(...\(json))")
    }
}

/// Pocket Bbokari (the same page as the claude.ai version) running inside the app.
struct PocketWebView: UIViewRepresentable {
    let bridge: WebBridge
    let onCommand: ([String: Any]) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onCommand: onCommand) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(context.coordinator, name: "bbokari")
        // Tell the page what the app can do (before the page's own code runs).
        let caps = "window.__nativeCaps = { chat: \(ChatBrain.available), share: true };"
        config.userContentController.addUserScript(WKUserScript(source: caps, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        if let url = Bundle.main.url(forResource: "pocket", withExtension: "html") {
            web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
        bridge.webView = web
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKScriptMessageHandler {
        let onCommand: ([String: Any]) -> Void
        init(onCommand: @escaping ([String: Any]) -> Void) { self.onCommand = onCommand }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            if let body = message.body as? [String: Any] {
                onCommand(body)
            }
        }
    }
}
