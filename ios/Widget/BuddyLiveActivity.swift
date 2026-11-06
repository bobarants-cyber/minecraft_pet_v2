import ActivityKit
import SwiftUI
import WidgetKit

/// Little Bbokari in the Dynamic Island (and on the Lock Screen), in the same scenes as on the Mac.
struct BuddyLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BuddyAttributes.self) { context in
            let mode = BuddyMode.of(context.state.mode)
            HStack(spacing: 12) {
                Image(mode.image).resizable().scaledToFit().frame(width: 64, height: 64)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Bbokari · \(mode.title)").font(.headline)
                    Text(mode.line).font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
            .padding()
            .activityBackgroundTint(Color(red: 0.86, green: 0.95, blue: 1))
            .activitySystemActionForegroundColor(.black)
        } dynamicIsland: { context in
            let mode = BuddyMode.of(context.state.mode)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(mode.image).resizable().scaledToFit().frame(width: 70, height: 70)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(mode.emoji).font(.largeTitle)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(mode.title).font(.headline)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(mode.line).font(.callout).foregroundStyle(.secondary)
                }
            } compactLeading: {
                Image(mode.image).resizable().scaledToFit().frame(width: 30, height: 30)
            } compactTrailing: {
                Text(mode.emoji)
            } minimal: {
                Image(mode.image).resizable().scaledToFit()
            }
        }
    }
}
