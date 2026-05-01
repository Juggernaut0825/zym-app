import SwiftUI

struct MainTabView: View {
    @Environment(\.scenePhase) private var scenePhase
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var notificationManager: AppNotificationManager
    @State private var selectedTab = 0
    @State private var showCoachWelcome = false
    @State private var hasPresentedWelcomeThisSession = false
    @State private var showNotificationSettingsPrompt = false
    @State private var hasPromptedForNotificationsThisEntry = false

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
            notificationManager.registerForRemoteNotificationsIfAuthorized()
            notificationManager.submitDeviceTokenIfPossible(appState: appState)
            presentCoachWelcomeIfNeeded()
            promptForNotificationSettingsIfNeeded()
        }
        .onChange(of: appState.isLoggedIn) { _, isLoggedIn in
            if isLoggedIn {
                notificationManager.requestAuthorizationIfNeeded()
                notificationManager.registerForRemoteNotificationsIfAuthorized()
                notificationManager.submitDeviceTokenIfPossible(appState: appState)
                presentCoachWelcomeIfNeeded(force: true)
                promptForNotificationSettingsIfNeeded(resetForEntry: true)
            } else {
                showCoachWelcome = false
                hasPresentedWelcomeThisSession = false
                showNotificationSettingsPrompt = false
                hasPromptedForNotificationsThisEntry = false
            }
        }
        .onChange(of: notificationManager.remoteDeviceToken) { _, _ in
            notificationManager.submitDeviceTokenIfPossible(appState: appState)
        }
        .onChange(of: appState.selectedCoach) { _, nextCoach in
            if let nextCoach, !nextCoach.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                hasPresentedWelcomeThisSession = true
                withAnimation(.zymSoft) {
                    showCoachWelcome = false
                }
            }
        }
        .onChange(of: appState.requestedTabIndex) { _, nextTab in
            guard let nextTab else { return }
            selectedTab = nextTab
            DispatchQueue.main.async {
                appState.requestedTabIndex = nil
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                promptForNotificationSettingsIfNeeded(resetForEntry: true)
            } else if phase == .background {
                hasPromptedForNotificationsThisEntry = false
            }
        }
        .alert("Notifications are off", isPresented: $showNotificationSettingsPrompt) {
            Button("Open Settings") {
                notificationManager.openSystemSettings()
            }
            Button("Later", role: .cancel) {}
        } message: {
            Text("Turn notifications on in Apple Settings so new messages and coach replies can alert you.")
        }
    }

    private func presentCoachWelcomeIfNeeded(force: Bool = false) {
        guard appState.isLoggedIn else { return }
        guard needsCoachWelcome else {
            hasPresentedWelcomeThisSession = true
            showCoachWelcome = false
            return
        }
        if force {
            hasPresentedWelcomeThisSession = false
        }
        guard !hasPresentedWelcomeThisSession else { return }
        hasPresentedWelcomeThisSession = true
        withAnimation(.zymSoft) {
            showCoachWelcome = true
        }
    }

    private var needsCoachWelcome: Bool {
        guard let selectedCoach = appState.selectedCoach else { return true }
        return selectedCoach.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func promptForNotificationSettingsIfNeeded(resetForEntry: Bool = false) {
        guard appState.isLoggedIn else { return }
        if resetForEntry {
            hasPromptedForNotificationsThisEntry = false
        }
        guard !hasPromptedForNotificationsThisEntry else { return }

        notificationManager.refreshAuthorizationStatus()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            guard appState.isLoggedIn,
                  !hasPromptedForNotificationsThisEntry,
                  notificationManager.shouldPromptToOpenSettings else { return }
            hasPromptedForNotificationsThisEntry = true
            showNotificationSettingsPrompt = true
        }
    }
}
