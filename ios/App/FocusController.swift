import ActivityKit
import Foundation
import UserNotifications

/// The 🍅 focus timer: a countdown with Bbokari on the Lock Screen and in the Dynamic Island,
/// plus a notification when it's done.
@MainActor
final class FocusController: ObservableObject {
    @Published private(set) var running = false

    init() { refresh() }

    func start(minutes: Int) {
        stop()
        let end = Date().addingTimeInterval(TimeInterval(minutes * 60))
        if ActivityAuthorizationInfo().areActivitiesEnabled {
            let content = ActivityContent(state: FocusAttributes.ContentState(end: end), staleDate: end)
            _ = try? Activity.request(attributes: FocusAttributes(minutes: minutes), content: content)
        }
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { return }
            let note = UNMutableNotificationContent()
            note.title = "Bbokari 🐥"
            note.body = "Focus time is over! Great job 🎉 Take a little break."
            note.sound = .default
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(minutes * 60), repeats: false)
            center.add(UNNotificationRequest(identifier: "focus", content: note, trigger: trigger))
        }
        running = true
    }

    func stop() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["focus"])
        for activity in Activity<FocusAttributes>.activities {
            Task { await activity.end(nil, dismissalPolicy: .immediate) }
        }
        running = false
    }

    /// Clears finished timers (called when the app opens).
    func refresh() {
        var any = false
        for activity in Activity<FocusAttributes>.activities {
            if activity.content.state.end <= Date() {
                Task { await activity.end(nil, dismissalPolicy: .immediate) }
            } else {
                any = true
            }
        }
        running = any
    }
}
