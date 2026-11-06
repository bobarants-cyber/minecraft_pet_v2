import SwiftUI
import WidgetKit

/// Bbokari on your Home Screen and Lock Screen, saying something new every half hour.
struct BbokariEntry: TimelineEntry {
    let date: Date
    let line: String
}

enum Lines {
    static let morning = ["Good morning! ☀️", "Breakfast time? 🍓", "Let's have a great day! 💛"]
    static let day = ["Drink some water! 💧", "You got this! 💪", "Bbok bbok! 🐥", "Take a little stretch 🙆", "I'm proud of you 💛", "Tap me to play! 🎮"]
    static let evening = ["Good evening! 🌆", "How was your day? 💬", "Almost done! 🌙"]
    static let night = ["Time to sleep… 💤", "Good night! 🌙", "Zzz… 😴"]

    static func pick(for date: Date) -> String {
        let hour = Calendar.current.component(.hour, from: date)
        let list = hour < 5 || hour >= 22 ? night : hour < 11 ? morning : hour < 18 ? day : evening
        // Same line for the same half hour, different ones through the day.
        let slot = Int(date.timeIntervalSince1970 / 1800)
        return list[slot % list.count]
    }
}

struct BbokariProvider: TimelineProvider {
    func placeholder(in context: Context) -> BbokariEntry { BbokariEntry(date: .now, line: "Bbok bbok! 🐥") }

    func getSnapshot(in context: Context, completion: @escaping (BbokariEntry) -> Void) {
        completion(BbokariEntry(date: .now, line: Lines.pick(for: .now)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BbokariEntry>) -> Void) {
        let start = Date(timeIntervalSince1970: floor(Date().timeIntervalSince1970 / 1800) * 1800)
        let entries = (0..<24).map { i -> BbokariEntry in
            let date = i == 0 ? Date() : start.addingTimeInterval(Double(i) * 1800)
            return BbokariEntry(date: date, line: Lines.pick(for: date))
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

/// Bbokari's picture. With the tinted or clear Home Screen style, iOS paints full-colour widget images as a solid
/// white shape unless told otherwise; this keeps the picture visible (tinted to match) in those styles.
struct BbokariPicture: View {
    var body: some View {
        if #available(iOS 18.0, *) {
            Image("Bbokari").resizable().widgetAccentedRenderingMode(.accentedDesaturated)
        } else {
            Image("Bbokari").resizable()
        }
    }
}

struct BbokariWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: BbokariEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Text("🐥").font(.system(size: 30))
            }
        case .accessoryRectangular:
            HStack(spacing: 6) {
                Text("🐥").font(.title2)
                Text(entry.line).font(.headline).lineLimit(2).minimumScaleFactor(0.7)
            }
        case .systemMedium:
            HStack(spacing: 12) {
                BbokariPicture().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 18))
                VStack(alignment: .leading, spacing: 6) {
                    Text("Bbokari").font(.headline).foregroundStyle(.secondary)
                    Text(entry.line).font(.title3.bold()).lineLimit(3).minimumScaleFactor(0.7)
                }
                Spacer(minLength: 0)
            }
        default:
            ZStack(alignment: .bottom) {
                BbokariPicture().scaledToFill()
                Text(entry.line)
                    .font(.caption.bold())
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 8).padding(.vertical, 5)
                    .background(.white.opacity(0.9), in: Capsule())
                    .foregroundStyle(.black)
                    .padding(8)
            }
        }
    }
}

struct BbokariWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BbokariWidget", provider: BbokariProvider()) { entry in
            BbokariWidgetView(entry: entry)
                .containerBackground(for: .widget) {
                    LinearGradient(colors: [Color(red: 0.56, green: 0.83, blue: 1), Color(red: 0.9, green: 0.96, blue: 1)],
                                   startPoint: .top, endPoint: .bottom)
                }
        }
        .configurationDisplayName("Bbokari")
        .description("Bbokari keeps you company and cheers you on.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
        .contentMarginsDisabled()
    }
}
