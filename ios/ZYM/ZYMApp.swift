import SwiftUI

@main
struct ZYMApp: App {
    @StateObject private var appState = AppState()
    @State private var showLaunchSplash = true

    var body: some Scene {
        WindowGroup {
            ZStack {
                if appState.isLoggedIn {
                    MainTabView()
                        .environmentObject(appState)
                } else {
                    NavigationView {
                        LoginView()
                            .environmentObject(appState)
                    }
                }

                if showLaunchSplash {
                    ZYMLaunchSplashView()
                        .transition(.opacity.combined(with: .scale(scale: 0.96)))
                }
            }
            .onAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.05) {
                    withAnimation(.zymSoft) {
                        showLaunchSplash = false
                    }
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
                ZStack {
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [Color.zymSecondary, Color.zymPrimaryDark],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 86, height: 86)
                        .shadow(color: Color.zymSecondary.opacity(0.28), radius: 18, x: 0, y: 10)
                    Text("Z")
                        .font(.custom("Syne", size: 42))
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                }
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
