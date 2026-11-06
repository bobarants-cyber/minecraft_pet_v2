import SwiftUI
import WidgetKit

@main
struct BbokariWidgetBundle: WidgetBundle {
    var body: some Widget {
        BbokariWidget()
        FocusLiveActivity()
        BuddyLiveActivity()
    }
}
