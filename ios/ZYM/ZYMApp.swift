import SwiftUI
import UIKit

final class ZYMAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        AppNotificationManager.shared.handleRemoteDeviceToken(deviceToken)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        AppNotificationManager.shared.refreshAuthorizationStatus()
    }
}

@main
struct ZYMApp: App {
    @UIApplicationDelegateAdaptor(ZYMAppDelegate.self) private var appDelegate
    @StateObject private var appState = AppState()
    @StateObject private var notificationManager = AppNotificationManager.shared
    @State private var showLaunchSplash = true
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ZStack {
                if appState.isLoggedIn {
                    MainTabView()
                        .environmentObject(appState)
                        .environmentObject(notificationManager)
                } else {
                    NavigationView {
                        LoginView()
                            .environmentObject(appState)
                            .environmentObject(notificationManager)
                    }
                }

                if showLaunchSplash {
                    ZYMLaunchSplashView()
                        .transition(.opacity.combined(with: .scale(scale: 0.96)))
                }
            }
            .onAppear {
                notificationManager.refreshAuthorizationStatus()
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.05) {
                    withAnimation(.zymSoft) {
                        showLaunchSplash = false
                    }
                }
            }
            .onChange(of: scenePhase) { _, newPhase in
                if newPhase == .active {
                    notificationManager.refreshAuthorizationStatus()
                }
            }
        }
    }
}

private struct ZYMLaunchSplashView: View {
    @State private var animate = false

    var body: some View {
        ZStack {
            ZYMBackgroundLayer()
                .ignoresSafeArea()

            VStack(spacing: 12) {
                Image("BrandLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 96, height: 96)
                    .shadow(color: Color.zymSecondary.opacity(0.24), radius: 18, x: 0, y: 10)
                    .scaleEffect(animate ? 1 : 0.92)

                Text("ZYM")
                    .font(.custom("Syne", size: 30))
                    .foregroundColor(Color.zymText)

                Text("Community + AI Coach")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color.zymSubtext)
            }
            .opacity(animate ? 1 : 0.3)
            .offset(y: animate ? 0 : 12)
        }
        .onAppear {
            withAnimation(.zymSpring) {
                animate = true
            }
        }
    }
}
