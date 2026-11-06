import ActivityKit
import Foundation

/// Bbokari living in the Dynamic Island. The state is just what he's doing right now.
struct BuddyAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var mode: String
    }
}

/// What Bbokari can be doing in the Dynamic Island. The pictures (pose-<id>) are the same scenes as on the Mac.
struct BuddyMode {
    let id: String
    let title: String
    let emoji: String
    let line: String

    var image: String { "pose-\(id)" }

    static let all: [BuddyMode] = [
        BuddyMode(id: "idle", title: "Hanging out", emoji: "🐥", line: "Bbok bbok! I'm right here 💛"),
        BuddyMode(id: "video", title: "Movie time", emoji: "🍿", line: "Popcorn ready! Let's watch 🍿"),
        BuddyMode(id: "music", title: "Listening", emoji: "🎵", line: "Vibing with you 🎶"),
        BuddyMode(id: "writing", title: "Writing", emoji: "✏️", line: "Taking notes with you ✏️"),
        BuddyMode(id: "gaming", title: "Gaming", emoji: "🎮", line: "Game on! You got this 🎮"),
        BuddyMode(id: "coding", title: "Working", emoji: "💻", line: "Working hard together 💻"),
        BuddyMode(id: "reading", title: "Reading", emoji: "📖", line: "Story time 📖"),
        BuddyMode(id: "drawing", title: "Drawing", emoji: "🎨", line: "Making art 🎨"),
        BuddyMode(id: "meeting", title: "On a call", emoji: "🎧", line: "Shh, I'm listening 🎧"),
        BuddyMode(id: "sleep", title: "Sleeping", emoji: "💤", line: "Zzz… good night 🌙"),
    ]

    static func of(_ id: String) -> BuddyMode { all.first { $0.id == id } ?? all[0] }
}
