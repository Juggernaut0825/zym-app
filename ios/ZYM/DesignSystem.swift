import SwiftUI

struct ConversationBubbleThemePreset: Identifiable, Equatable {
    let id: String
    let label: String
    let outgoingFill: Color
    let outgoingText: Color
    let incomingFill: Color
    let incomingText: Color
}

let conversationBubbleThemePresets: [ConversationBubbleThemePreset] = [
    ConversationBubbleThemePreset(id: "sand", label: "Sand", outgoingFill: Color(red: 0.952, green: 0.914, blue: 0.820), outgoingText: .zymPrimaryDark, incomingFill: Color(red: 0.982, green: 0.974, blue: 0.952), incomingText: .zymText),
    ConversationBubbleThemePreset(id: "ink", label: "Ink", outgoingFill: Color(red: 0.196, green: 0.220, blue: 0.275), outgoingText: .white, incomingFill: Color(red: 0.955, green: 0.959, blue: 0.975), incomingText: .zymText),
    ConversationBubbleThemePreset(id: "sage", label: "Sage", outgoingFill: Color(red: 0.850, green: 0.902, blue: 0.863), outgoingText: Color(red: 0.160, green: 0.254, blue: 0.196), incomingFill: Color(red: 0.967, green: 0.981, blue: 0.969), incomingText: .zymText),
    ConversationBubbleThemePreset(id: "sky", label: "Sky", outgoingFill: Color(red: 0.836, green: 0.901, blue: 0.985), outgoingText: Color(red: 0.136, green: 0.219, blue: 0.360), incomingFill: Color(red: 0.962, green: 0.978, blue: 0.996), incomingText: .zymText),
    ConversationBubbleThemePreset(id: "peach", label: "Peach", outgoingFill: Color(red: 0.992, green: 0.878, blue: 0.814), outgoingText: Color(red: 0.422, green: 0.215, blue: 0.145), incomingFill: Color(red: 0.995, green: 0.966, blue: 0.945), incomingText: .zymText),
    ConversationBubbleThemePreset(id: "lavender", label: "Lavender", outgoingFill: Color(red: 0.890, green: 0.862, blue: 0.984), outgoingText: Color(red: 0.236, green: 0.181, blue: 0.422), incomingFill: Color(red: 0.974, green: 0.968, blue: 0.996), incomingText: .zymText),
    ConversationBubbleThemePreset(id: "rose", label: "Rose", outgoingFill: Color(red: 0.984, green: 0.852, blue: 0.902), outgoingText: Color(red: 0.412, green: 0.151, blue: 0.283), incomingFill: Color(red: 0.996, green: 0.958, blue: 0.973), incomingText: .zymText),
    ConversationBubbleThemePreset(id: "midnight", label: "Midnight", outgoingFill: Color(red: 0.118, green: 0.153, blue: 0.255), outgoingText: .white, incomingFill: Color(red: 0.936, green: 0.944, blue: 0.978), incomingText: .zymText),
]

func conversationBubbleThemePreset(id: String?) -> ConversationBubbleThemePreset {
    let resolvedId = String(id ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    return conversationBubbleThemePresets.first(where: { $0.id == resolvedId }) ?? conversationBubbleThemePresets[0]
}

struct ConversationBubbleThemePreview: View {
    let preset: ConversationBubbleThemePreset

    var body: some View {
        HStack(spacing: 6) {
            Capsule()
                .fill(preset.incomingFill)
                .frame(width: 28, height: 12)
                .overlay(
                    Capsule()
                        .fill(preset.incomingText.opacity(0.8))
                        .frame(width: 12, height: 3)
                )
            Capsule()
                .fill(preset.outgoingFill)
                .frame(width: 34, height: 12)
                .overlay(
                    Capsule()
                        .fill(preset.outgoingText.opacity(0.8))
                        .frame(width: 14, height: 3)
                )
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color.zymSurfaceSoft.opacity(0.82))
        .clipShape(Capsule())
    }
}

struct ConversationBubbleThemeChip: View {
    let preset: ConversationBubbleThemePreset
    let selected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(preset.label)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Color.zymText)
                    HStack(spacing: 6) {
                        Capsule()
                            .fill(preset.incomingFill)
                            .frame(width: 24, height: 10)
                            .overlay(
                                Capsule()
                                    .fill(preset.incomingText.opacity(0.82))
                                    .frame(width: 10, height: 3)
                            )
                        Capsule()
                            .fill(preset.outgoingFill)
                            .frame(width: 24, height: 10)
                            .overlay(
                                Capsule()
                                    .fill(preset.outgoingText.opacity(0.82))
                                    .frame(width: 10, height: 3)
                            )
                    }
                }

                Spacer(minLength: 8)

                if selected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Color.zymPrimaryDark)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
            .background(Color.white.opacity(selected ? 0.92 : 0.76))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

extension Color {
    static let zymBackground = Color.white
    static let zymBackgroundSoft = Color.white
    static let zymSurface = Color.white
    static let zymSurfaceSoft = Color(red: 0.972, green: 0.964, blue: 0.942)
    static let zymLine = Color(red: 0.914, green: 0.902, blue: 0.876)
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
                Color.white.opacity(0.68)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

struct ZYMFieldModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(12)
            .background(Color.zymSurfaceSoft.opacity(0.72))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
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

    func zymFieldStyle() -> some View {
        modifier(ZYMFieldModifier())
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
            .background(Color.zymPrimaryDark.opacity(configuration.isPressed ? 0.84 : 1))
            .clipShape(Capsule())
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
            .clipShape(Capsule())
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
