import SwiftUI

@main
struct BbokariApp: App {
    @StateObject private var floater = FloatController()
    @StateObject private var focus = FocusController()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(floater)
                .environmentObject(focus)
        }
    }
}
