import ActivityKit
import Foundation

/// The focus timer shown on the Lock Screen and in the Dynamic Island (shared by the app and the widget).
struct FocusAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var end: Date
    }

    var minutes: Int
}
