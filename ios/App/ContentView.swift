import Combine
import SwiftUI

struct ContentView: View {
    @EnvironmentObject var floater: FloatController
    @EnvironmentObject var focus: FocusController
    @Environment(\.scenePhase) private var scenePhase
    @State private var askFocus = false
    @State private var web = WebBridge()

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            PocketWebView(bridge: web) { command in
                switch command {
                case "float": floater.toggle()
                case "focus": askFocus = true
                default: break
                }
            }
            .ignoresSafeArea()

            // The floating window plays from this little player. iOS needs it on screen, so it sits
            // tucked in the corner, practically invisible.
            PlayerView(layer: floater.layer)
                .frame(width: 40, height: 40)
                .opacity(0.01)
                .allowsHitTesting(false)
        }
        .confirmationDialog("🍅 Focus timer", isPresented: $askFocus, titleVisibility: .visible) {
            ForEach([10, 25, 45], id: \.self) { m in
                Button("\(m) minutes") {
                    focus.start(minutes: m)
                    web.say("Focus time! \(m) minutes. I'll be in the Dynamic Island 🍅")
                }
            }
            if focus.running {
                Button("Stop the timer", role: .destructive) {
                    focus.stop()
                    web.say("Timer stopped. Good job anyway! 💛")
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                focus.refresh()
                if floater.floating { floater.stop() }
            }
        }
        .onReceive(floater.$message.compactMap { $0 }) { text in web.say(text) }
    }
}
