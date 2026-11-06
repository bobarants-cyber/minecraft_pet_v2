import ActivityKit
import SwiftUI
import WidgetKit

/// Now until the end (never backwards, which would crash once the timer is over).
private func remaining(_ end: Date) -> ClosedRange<Date> {
    let now = Date()
    return now...max(now, end)
}

/// The 🍅 focus timer with Bbokari, on the Lock Screen and in the Dynamic Island.
struct FocusLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FocusAttributes.self) { context in
            HStack(spacing: 12) {
                Image("Bbokari").resizable().scaledToFit().frame(width: 52, height: 52)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Focus time 🍅").font(.headline)
                    Text("Bbokari is cheering you on").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Text(timerInterval: remaining(context.state.end), countsDown: true)
                    .font(.title2.monospacedDigit().bold())
                    .multilineTextAlignment(.trailing)
                    .frame(width: 80)
            }
            .padding()
            .activityBackgroundTint(Color(red: 1, green: 0.97, blue: 0.85))
            .activitySystemActionForegroundColor(.black)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image("Bbokari").resizable().scaledToFit().frame(width: 44, height: 44)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: remaining(context.state.end), countsDown: true)
                        .font(.title2.monospacedDigit().bold())
                        .frame(width: 80)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("Focus time 🍅 You got this!").font(.callout)
                }
            } compactLeading: {
                Image("Bbokari").resizable().scaledToFit().frame(width: 22, height: 22).clipShape(Circle())
            } compactTrailing: {
                Text(timerInterval: remaining(context.state.end), countsDown: true)
                    .monospacedDigit()
                    .frame(width: 44)
            } minimal: {
                Image("Bbokari").resizable().scaledToFit().clipShape(Circle())
            }
        }
    }
}
