import ActivityKit
import AppIntents
import Foundation

/// Puts Bbokari in the Dynamic Island, changes what he's doing, or hides him.
enum BuddyIsland {
    private static let hiddenKey = "islandHidden"

    /// The user hid him from the Dynamic Island on purpose (then the app doesn't bring him back by itself).
    static var hiddenByUser: Bool {
        get { UserDefaults.standard.bool(forKey: hiddenKey) }
        set { UserDefaults.standard.set(newValue, forKey: hiddenKey) }
    }

    static var isShowing: Bool { Activity<BuddyAttributes>.activities.contains { $0.activityState == .active } }

    static func show(_ mode: String) async {
        hiddenByUser = false
        let content = ActivityContent(state: BuddyAttributes.ContentState(mode: mode), staleDate: nil)
        let live = Activity<BuddyAttributes>.activities.filter { $0.activityState == .active || $0.activityState == .stale }
        if let current = live.first {
            await current.update(content)
            for extra in live.dropFirst() { await extra.end(nil, dismissalPolicy: .immediate) }
        } else if ActivityAuthorizationInfo().areActivitiesEnabled {
            _ = try? Activity.request(attributes: BuddyAttributes(), content: content)
        }
    }

    static func hide() async {
        hiddenByUser = true
        for activity in Activity<BuddyAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }

    /// When the app opens: bring him back if iOS took him away (it does after about 8 hours).
    static func ensureShowing() async {
        if !hiddenByUser && !isShowing { await show("idle") }
    }
}

// MARK: - Shortcuts actions ("When YouTube is opened → Set Bbokari's activity: Movie time")

enum BuddyModeOption: String, AppEnum {
    case idle, video, music, writing, gaming, coding, reading, drawing, meeting, sleep

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Bbokari activity"
    static var caseDisplayRepresentations: [BuddyModeOption: DisplayRepresentation] = [
        .idle: "Hanging out 🐥",
        .video: "Movie time 🍿",
        .music: "Listening to music 🎵",
        .writing: "Writing ✏️",
        .gaming: "Gaming 🎮",
        .coding: "Working 💻",
        .reading: "Reading 📖",
        .drawing: "Drawing 🎨",
        .meeting: "On a call 🎧",
        .sleep: "Sleeping 💤",
    ]
}

struct SetBbokariActivity: LiveActivityIntent {
    static var title: LocalizedStringResource = "Set Bbokari's activity"
    static var description = IntentDescription("Shows Bbokari in the Dynamic Island doing something, like eating popcorn while you watch videos.")

    @Parameter(title: "Activity", default: .idle)
    var activity: BuddyModeOption

    init() {}
    init(activity: BuddyModeOption) { self.activity = activity }

    func perform() async throws -> some IntentResult {
        await BuddyIsland.show(activity.rawValue)
        return .result()
    }
}

struct HideBbokariFromIsland: LiveActivityIntent {
    static var title: LocalizedStringResource = "Hide Bbokari from the Dynamic Island"

    func perform() async throws -> some IntentResult {
        await BuddyIsland.hide()
        return .result()
    }
}

struct BbokariShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: SetBbokariActivity(), phrases: ["Set \(.applicationName) activity"],
                    shortTitle: "Bbokari activity", systemImageName: "bird")
        AppShortcut(intent: HideBbokariFromIsland(), phrases: ["Hide \(.applicationName) from the island"],
                    shortTitle: "Hide Bbokari", systemImageName: "eye.slash")
    }
}
