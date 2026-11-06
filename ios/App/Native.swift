import UIKit

#if canImport(FoundationModels)
import FoundationModels
#endif

/// Little taps you can feel when you pet Bbokari, win a game, etc.
enum Haptics {
    static func play(_ style: String) {
        switch style {
        case "success": UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "heavy": UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        case "medium": UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        case "soft": UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        default: UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }
}

/// The iPhone share sheet for a photo of Bbokari (Save Image, Messages, AirDrop…).
enum Share {
    static func image(dataURL: String) {
        guard let comma = dataURL.firstIndex(of: ","),
              let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...])),
              let image = UIImage(data: data) else { return }
        let window = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first
        guard var top = window?.rootViewController else { return }
        while let presented = top.presentedViewController { top = presented }
        let sheet = UIActivityViewController(activityItems: [image], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = top.view
        top.present(sheet, animated: true)
    }
}

/// Chat with Bbokari using Apple's on-device AI (Apple Intelligence). Free, private, works offline.
enum ChatBrain {
    static var available: Bool {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            if case .available = SystemLanguageModel.default.availability { return true }
        }
        #endif
        return false
    }

    static func reply(rules: String, history: [[String: String]]) async -> String? {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            let conversation = history
                .map { ($0["role"] == "user" ? "Friend: " : "Bbokari: ") + ($0["content"] ?? "") }
                .joined(separator: "\n")
            let session = LanguageModelSession(instructions: rules)
            do {
                return try await session.respond(to: conversation + "\nBbokari:").content
            } catch {
                return nil
            }
        }
        #endif
        return nil
    }
}
