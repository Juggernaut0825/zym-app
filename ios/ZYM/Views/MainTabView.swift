import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var notificationManager: AppNotificationManager
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
                        Text("Community")
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
            notificationManager.requestAuthorizationIfNeeded()
            presentCoachWelcomeIfNeeded()
        }
        .onChange(of: appState.isLoggedIn) { _, isLoggedIn in
            if isLoggedIn {
                notificationManager.requestAuthorizationIfNeeded()
                presentCoachWelcomeIfNeeded(force: true)
            } else {
                showCoachWelcome = false
                hasPresentedWelcomeThisSession = false
            }
        }
        .onChange(of: appState.requestedTabIndex) { _, nextTab in
            guard let nextTab else { return }
            selectedTab = nextTab
            DispatchQueue.main.async {
                appState.requestedTabIndex = nil
            }
        }
        .safeAreaInset(edge: .top) {
            if appState.isLoggedIn && notificationManager.shouldPromptToOpenSettings {
                NotificationPermissionBanner {
                    notificationManager.openSystemSettings()
                }
                .padding(.horizontal, 12)
                .padding(.top, 6)
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

private struct NotificationPermissionBanner: View {
    let onOpenSettings: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "bell.badge.slash.fill")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(Color.zymPrimaryDark)

            VStack(alignment: .leading, spacing: 4) {
                Text("Notifications are off")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color.zymText)
                Text("Turn them back on in Apple Settings so new messages and coach replies can alert you.")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color.zymSubtext)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 8)

            Button("Open") {
                onOpenSettings()
            }
            .buttonStyle(ZYMGhostButton())
        }
        .padding(12)
        .background(Color.white.opacity(0.96))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.zymLine, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: Color.black.opacity(0.06), radius: 12, x: 0, y: 8)
    }
}
