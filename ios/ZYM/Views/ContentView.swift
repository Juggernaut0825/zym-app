import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            CoachChatView()
                .tabItem {
                    Label("Coach", systemImage: "message.fill")
                }

            FeedView()
                .tabItem {
                    Label("Feed", systemImage: "house.fill")
                }

            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person.fill")
                }
        }
    }
}

enum Coach: String {
    case zj = "zj"
    case lc = "lc"
}
