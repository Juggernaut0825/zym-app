import SwiftUI

extension Color {
    static let zymBackground = Color(red: 0.97, green: 0.985, blue: 0.975)
    static let zymSurface = Color.white
    static let zymSurfaceSoft = Color(red: 0.95, green: 0.97, blue: 0.955)
    static let zymLine = Color(red: 0.84, green: 0.89, blue: 0.86)
    static let zymPrimary = Color(red: 0.37, green: 0.43, blue: 0.37)
    static let zymPrimaryDark = Color(red: 0.30, green: 0.36, blue: 0.30)
    static let zymText = Color(red: 0.10, green: 0.14, blue: 0.12)
    static let zymSubtext = Color(red: 0.40, green: 0.46, blue: 0.42)
}

extension Animation {
    static let zymSpring = Animation.spring(response: 0.42, dampingFraction: 0.84, blendDuration: 0.2)
    static let zymQuick = Animation.easeOut(duration: 0.22)
    static let zymSoft = Animation.easeInOut(duration: 0.32)
}

struct ZYMCard: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(14)
            .background(Color.zymSurface)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.zymLine, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .shadow(color: Color.black.opacity(0.06), radius: 16, x: 0, y: 8)
            .shadow(color: Color.zymPrimary.opacity(0.04), radius: 1, x: 0, y: 0)
    }
}

struct ZYMAppearModifier: ViewModifier {
    let delay: Double
    @State private var visible = false

    func body(content: Content) -> some View {
        content
            .opacity(visible ? 1 : 0)
            .offset(y: visible ? 0 : 14)
            .scaleEffect(visible ? 1 : 0.985)
            .onAppear {
                withAnimation(.zymSpring.delay(delay)) {
                    visible = true
                }
            }
    }
}

extension View {
    func zymCard() -> some View {
        modifier(ZYMCard())
    }

    func zymAppear(delay: Double = 0) -> some View {
        modifier(ZYMAppearModifier(delay: delay))
    }
}

struct ZYMPrimaryButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .foregroundColor(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(
                LinearGradient(
                    colors: [Color.zymPrimary, Color.zymPrimaryDark],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .opacity(configuration.isPressed ? 0.82 : 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

struct ZYMGhostButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(Color.zymText)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(Color.zymSurfaceSoft.opacity(configuration.isPressed ? 0.8 : 1))
            .overlay(
                RoundedRectangle(cornerRadius: 11)
                    .stroke(Color.zymLine, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
    }
}
