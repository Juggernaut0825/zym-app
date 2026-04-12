import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedTab = 0
    @State private var showCoachWelcome = false
    @State private var hasPresentedWelcomeThisSession = false

    var body: some View {
        ZStack {
            TabView(selection: $selectedTab) {
                InboxView()
                    .transition(.opacity.combined(with: .move(edge: .trailing)))
                    .tag(0)
                    .tabItem {
                        Image(systemName: "bubble.left.and.bubble.right.fill")
                            .symbolEffect(.bounce, value: selectedTab)
                        Text("Chats")
                    }

                FeedView()
                    .transition(.opacity.combined(with: .move(edge: .trailing)))
                    .tag(1)
                    .tabItem {
                        Image(systemName: "sparkles.rectangle.stack.fill")
                            .symbolEffect(.bounce, value: selectedTab)
                        Text("Feed")
                    }

                CalendarView()
                    .transition(.opacity.combined(with: .move(edge: .trailing)))
                    .tag(2)
                    .tabItem {
                        Image(systemName: "calendar")
                            .symbolEffect(.bounce, value: selectedTab)
                        Text("Calendar")
                    }

                ProfileView()
                    .transition(.opacity.combined(with: .move(edge: .trailing)))
                    .tag(3)
                    .tabItem {
                        Image(systemName: "person.crop.circle.fill")
                            .symbolEffect(.bounce, value: selectedTab)
                        Text("Profile")
                    }
            }
            .animation(.zymSpring, value: selectedTab)
            .tint(Color.zymPrimary)
            .background(Color.zymBackground)

            if showCoachWelcome, appState.isLoggedIn {
                CoachWelcomeFlowView(isPresented: $showCoachWelcome, onComplete: nil)
                    .environmentObject(appState)
                    .transition(.opacity.combined(with: .scale(scale: 0.98)))
                    .zIndex(10)
            }
        }
        .onAppear {
            presentCoachWelcomeIfNeeded()
        }
        .onChange(of: appState.isLoggedIn) { _, isLoggedIn in
            if isLoggedIn {
                presentCoachWelcomeIfNeeded(force: true)
            } else {
                showCoachWelcome = false
                hasPresentedWelcomeThisSession = false
            }
        }
    }

    private func presentCoachWelcomeIfNeeded(force: Bool = false) {
        guard appState.isLoggedIn else { return }
        if force {
            hasPresentedWelcomeThisSession = false
        }
        guard !hasPresentedWelcomeThisSession else { return }
        hasPresentedWelcomeThisSession = true
        withAnimation(.zymSoft) {
            showCoachWelcome = true
        }
    }
}
