import UIKit
import UserNotifications

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

    /// One question, one answer (flashcards, translations): no chat history, no "Bbokari:" prompt.
    static func once(rules: String, prompt: String) async -> String? {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            let session = LanguageModelSession(instructions: rules)
            do {
                return try await session.respond(to: prompt).content
            } catch {
                return nil
            }
        }
        #endif
        return nil
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

/// Bbokari's reminders and timers as real iPhone notifications (they ring even when the app is closed).
final class Notifier: NSObject, UNUserNotificationCenterDelegate {
    static let shared = Notifier()
    private let center = UNUserNotificationCenter.current()

    /// Show the banner even while the app is open.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    /// `at` is milliseconds since 1970. `repeatDays` (0 = Sunday) repeats every week on those days at that time.
    func schedule(id: String, at: Double, title: String, body: String, repeatDays: [Int]?) {
        center.delegate = self
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            let date = Date(timeIntervalSince1970: at / 1000)
            let calendar = Calendar.current
            if let days = repeatDays, !days.isEmpty {
                let time = calendar.dateComponents([.hour, .minute], from: date)
                for day in days {
                    var when = DateComponents()
                    when.weekday = day + 1 // Calendar: 1 = Sunday
                    when.hour = time.hour
                    when.minute = time.minute
                    let trigger = UNCalendarNotificationTrigger(dateMatching: when, repeats: true)
                    self.center.add(UNNotificationRequest(identifier: "\(id)-\(day)", content: content, trigger: trigger))
                }
            } else {
                let seconds = max(1, date.timeIntervalSinceNow)
                let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
                self.center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
            }
        }
    }

    func cancel(ids: [String]) {
        let all = ids + ids.flatMap { id in (0...6).map { "\(id)-\($0)" } }
        center.removePendingNotificationRequests(withIdentifiers: all)
    }
}

/// Opens Spotify (or another app link); if that app isn't installed, opens the web page instead.
enum Opener {
    static func open(_ link: String, fallback: String?) {
        guard let url = URL(string: link) else { return }
        UIApplication.shared.open(url) { ok in
            if !ok, let f = fallback, let web = URL(string: f) { UIApplication.shared.open(web) }
        }
    }
}
