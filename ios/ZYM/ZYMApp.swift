import SwiftUI
import UIKit
import AVFoundation

final class ZYMAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        configurePlaybackAudioSession()
        return true
    }

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

    private func configurePlaybackAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback, options: [.mixWithOthers])
        } catch {
            // Video playback still works without this; the category only allows sound while the mute switch is on.
        }
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
            .preferredColorScheme(.light)
            .onAppear {
                applyLightModeToAllWindows()
                notificationManager.refreshAuthorizationStatus()
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.05) {
                    withAnimation(.zymSoft) {
                        showLaunchSplash = false
                    }
                }
            }
            .onChange(of: scenePhase) { _, newPhase in
                if newPhase == .active {
                    applyLightModeToAllWindows()
                    notificationManager.refreshAuthorizationStatus()
                }
            }
            .zymInstallKeyboardDismissal()
        }
    }
}

private func applyLightModeToAllWindows() {
    for scene in UIApplication.shared.connectedScenes {
        if let windowScene = scene as? UIWindowScene {
            for window in windowScene.windows {
                window.overrideUserInterfaceStyle = .light
            }
        }
    }
}

private final class ZYMKeyboardDismissCoordinator: NSObject, UIGestureRecognizerDelegate {
    @objc func dismissKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        var current = touch.view
        while let view = current {
            if view is UIControl || view is UITextField || view is UITextView {
                return false
            }
            current = view.superview
        }
        return true
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        true
    }
}

private struct ZYMKeyboardDismissInstaller: UIViewRepresentable {
    func makeCoordinator() -> ZYMKeyboardDismissCoordinator {
        ZYMKeyboardDismissCoordinator()
    }

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.isUserInteractionEnabled = false
        DispatchQueue.main.async {
            installGestures(from: view, coordinator: context.coordinator)
        }
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        DispatchQueue.main.async {
            installGestures(from: uiView, coordinator: context.coordinator)
        }
    }

    private func installGestures(from view: UIView, coordinator: ZYMKeyboardDismissCoordinator) {
        guard let window = view.window else { return }
        let existingNames = Set((window.gestureRecognizers ?? []).compactMap(\.name))

        if !existingNames.contains("zym.keyboard.dismiss.tap") {
            let tap = UITapGestureRecognizer(target: coordinator, action: #selector(ZYMKeyboardDismissCoordinator.dismissKeyboard))
            tap.name = "zym.keyboard.dismiss.tap"
            tap.cancelsTouchesInView = false
            tap.delegate = coordinator
            window.addGestureRecognizer(tap)
        }

        if !existingNames.contains("zym.keyboard.dismiss.pan") {
            let pan = UIPanGestureRecognizer(target: coordinator, action: #selector(ZYMKeyboardDismissCoordinator.dismissKeyboard))
            pan.name = "zym.keyboard.dismiss.pan"
            pan.cancelsTouchesInView = false
            pan.delegate = coordinator
            window.addGestureRecognizer(pan)
        }
    }
}

private extension View {
    func zymInstallKeyboardDismissal() -> some View {
        background(ZYMKeyboardDismissInstaller().frame(width: 0, height: 0))
    }
}

private struct ZYMLaunchSplashView: View {
    @State private var animate = false

    var body: some View {
        ZStack {
            Color.white.opacity(0.88)
                .background(.ultraThinMaterial)
                .ignoresSafeArea()

            Image("BrandLogo")
                .resizable()
                .scaledToFill()
                .frame(width: 132, height: 132)
                .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
                .shadow(color: Color.black.opacity(0.18), radius: 22, x: 0, y: 12)
                .opacity(animate ? 1 : 0.4)
                .scaleEffect(animate ? 1 : 0.94)
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.55)) {
                animate = true
            }
        }
    }
}
