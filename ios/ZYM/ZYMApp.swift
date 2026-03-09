import SwiftUI

@main
struct ZYMApp: App {
    @StateObject private var appState = AppState()
    @State private var showLaunchSplash = true

    var body: some Scene {
        WindowGroup {
            ZStack {
                if appState.isLoggedIn {
                    if appState.selectedCoach == nil {
                        CoachSelectView()
                            .environmentObject(appState)
                    } else {
                        MainTabView()
                            .environmentObject(appState)
                    }
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
            LinearGradient(
                colors: [Color.zymBackground, Color.white],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            Circle()
                .fill(Color.zymPrimary.opacity(0.16))
                .frame(width: 180, height: 180)
                .blur(radius: 8)
                .offset(x: animate ? -40 : 40, y: animate ? -120 : -90)

            Circle()
                .fill(Color.zymPrimary.opacity(0.13))
                .frame(width: 130, height: 130)
                .blur(radius: 6)
                .offset(x: animate ? 58 : 20, y: animate ? 100 : 76)

            VStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [Color.zymPrimary, Color.zymPrimaryDark],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 86, height: 86)
                        .shadow(color: Color.zymPrimary.opacity(0.3), radius: 18, x: 0, y: 10)
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
