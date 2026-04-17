import SwiftUI

extension Color {
    static let zymBackground = Color.white
    static let zymBackgroundSoft = Color.white
    static let zymSurface = Color.white
    static let zymSurfaceSoft = Color(red: 0.965, green: 0.949, blue: 0.918)
    static let zymLine = Color(red: 0.867, green: 0.847, blue: 0.812)
    static let zymPrimary = Color(red: 0.353, green: 0.396, blue: 0.475)
    static let zymPrimaryDark = Color(red: 0.157, green: 0.184, blue: 0.231)
    static let zymSecondary = Color(red: 0.949, green: 0.541, blue: 0.227)
    static let zymSecondaryDark = Color(red: 0.694, green: 0.388, blue: 0.133)
    static let zymText = Color(red: 0.122, green: 0.122, blue: 0.122)
    static let zymSubtext = Color(red: 0.439, green: 0.415, blue: 0.388)
    static let zymBubbleDark = Color(red: 0.294, green: 0.333, blue: 0.388)
    static let zymCoachBlue = Color(red: 0.424, green: 0.486, blue: 0.965)
    static let zymCoachBlueDark = Color(red: 0.290, green: 0.341, blue: 0.788)

    static func zymCoachAccent(_ coach: String?) -> Color {
        coach == "lc" ? .zymSecondary : .zymCoachBlue
    }

    static func zymCoachAccentDark(_ coach: String?) -> Color {
        coach == "lc" ? .zymSecondaryDark : .zymCoachBlueDark
    }

    static func zymCoachSoft(_ coach: String?) -> Color {
        coach == "lc"
            ? Color(red: 0.988, green: 0.941, blue: 0.890)
            : Color(red: 0.933, green: 0.945, blue: 1.0)
    }

    static func zymCoachInk(_ coach: String?) -> Color {
        coach == "lc" ? .zymSecondaryDark : .zymPrimaryDark
    }
}

extension Animation {
    static let zymSpring = Animation.spring(response: 0.42, dampingFraction: 0.84, blendDuration: 0.2)
    static let zymQuick = Animation.easeOut(duration: 0.22)
    static let zymSoft = Animation.easeInOut(duration: 0.32)
}

struct ZYMCard: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(12)
            .background(
                Color.white.opacity(0.9)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .shadow(color: Color.black.opacity(0.035), radius: 12, x: 0, y: 5)
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
            .shadow(color: Color.zymPrimaryDark.opacity(configuration.isPressed ? 0.16 : 0.22), radius: 14, x: 0, y: 8)
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
            .background(Color.zymSurfaceSoft.opacity(configuration.isPressed ? 0.94 : 0.82))
            .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
    }
}

struct ZYMCoachButtonStyle: ButtonStyle {
    let coach: String
    let selected: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(selected ? .white : Color.zymCoachInk(coach))
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background {
                if selected {
                    LinearGradient(
                        colors: [Color.zymCoachAccent(coach), Color.zymCoachAccentDark(coach)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                } else {
                    Color.zymCoachSoft(coach).opacity(configuration.isPressed ? 0.92 : 0.72)
                }
            }
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(selected ? Color.white.opacity(0.16) : Color.zymCoachAccent(coach).opacity(0.18), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .shadow(color: selected ? Color.zymCoachAccent(coach).opacity(0.2) : .clear, radius: 12, x: 0, y: 8)
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
    }
}

struct ZYMBackgroundLayer: View {
    var body: some View {
        Color.white
    }
}
