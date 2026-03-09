import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            InboxView()
                .transition(.opacity.combined(with: .move(edge: .trailing)))
                .tag(0)
                .tabItem {
                    Image(systemName: "bubble.left.and.bubble.right.fill")
                        .symbolEffect(.bounce, value: selectedTab)
                    Text("Chats")
                }

            FriendsView()
                .transition(.opacity.combined(with: .move(edge: .trailing)))
                .tag(1)
                .tabItem {
                    Image(systemName: "person.2.crop.square.stack.fill")
                        .symbolEffect(.bounce, value: selectedTab)
                    Text("Friends")
                }

            FeedView()
                .transition(.opacity.combined(with: .move(edge: .trailing)))
                .tag(2)
                .tabItem {
                    Image(systemName: "sparkles.rectangle.stack.fill")
                        .symbolEffect(.bounce, value: selectedTab)
                    Text("Feed")
                }

            LeaderboardView()
                .transition(.opacity.combined(with: .move(edge: .trailing)))
                .tag(3)
                .tabItem {
                    Image(systemName: "trophy.fill")
                        .symbolEffect(.bounce, value: selectedTab)
                    Text("Rank")
                }

            ProfileView()
                .transition(.opacity.combined(with: .move(edge: .trailing)))
                .tag(4)
                .tabItem {
                    Image(systemName: "person.crop.circle.fill")
                        .symbolEffect(.bounce, value: selectedTab)
                    Text("Profile")
                }
        }
        .animation(.zymSpring, value: selectedTab)
        .tint(Color.zymPrimary)
        .background(Color.zymBackground)
    }
}
