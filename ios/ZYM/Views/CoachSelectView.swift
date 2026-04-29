import SwiftUI

struct CoachSelectView: View {
    @EnvironmentObject var appState: AppState
    @State private var localCoach: String = "zj"
    @State private var isSubmitting = false
    @State private var showContent = false
    @State private var errorText = ""

    var body: some View {
        ZStack {
            ZYMBackgroundLayer()
                .ignoresSafeArea()

            VStack(spacing: 24) {
                VStack(spacing: 10) {
                    HStack(spacing: 8) {
                        Circle()
                            .fill(Color.zymPrimary)
                            .frame(width: 9, height: 9)
                        Text("TWO COACHING PERSONALITIES")
                            .font(.system(size: 11, weight: .bold))
                            .tracking(1.8)
                            .foregroundColor(Color.zymSubtext)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color.white.opacity(0.72))
                    .overlay(
                        Capsule()
                            .stroke(Color.zymLine, lineWidth: 1)
                    )
                    .clipShape(Capsule())

                    Text("Choose your coach")
                        .font(.custom("Syne", size: 38))
                        .foregroundColor(Color.zymText)

                    Text("You can switch coach style anytime in Profile. ZJ keeps things warm and encouraging. LC stays direct and tougher.")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Color.zymSubtext)
                        .multilineTextAlignment(.center)
                }
                .zymAppear(delay: 0.04)

                HStack(spacing: 12) {
                    CoachSelectionCard(
                        coach: "zj",
                        tag: "ZJ",
                        badge: "Gentle encouragement",
                        title: "Encouraging",
                        subtitle: "Supportive coaching focused on sustainable habits.",
                        highlight: "\"Let's complete your easiest win today first.\"",
                        selected: localCoach == "zj"
                    ) {
                        withAnimation(.zymSpring) {
                            localCoach = "zj"
                        }
                    }

                    CoachSelectionCard(
                        coach: "lc",
                        tag: "LC",
                        badge: "Tough accountability",
                        title: "Strict",
                        subtitle: "Direct accountability with execution-first feedback.",
                        highlight: "\"No excuses. Finish your training first.\"",
                        selected: localCoach == "lc"
                    ) {
                        withAnimation(.zymSpring) {
                            localCoach = "lc"
                        }
                    }
                }
                .zymAppear(delay: 0.14)

                if !errorText.isEmpty {
                    Text(errorText)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.red.opacity(0.8))
                        .zymAppear(delay: 0.02)
                }

                Button(action: selectCoach) {
                    HStack(spacing: 8) {
                        if isSubmitting {
                            ProgressView()
                                .tint(.white)
                        }
                        Text(isSubmitting ? "Starting..." : "Start with \(localCoach.uppercased())")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(ZYMPrimaryButton())
                .disabled(isSubmitting)
                .zymAppear(delay: 0.2)
            }
            .padding(22)
            .background(Color.white.opacity(0.82))
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(Color.zymLine, lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.08), radius: 20, x: 0, y: 10)
            .padding(.horizontal, 18)
            .opacity(showContent ? 1 : 0)
            .scaleEffect(showContent ? 1 : 0.97)
        }
        .onAppear {
            localCoach = appState.selectedCoach ?? "zj"
            withAnimation(.zymSpring) {
                showContent = true
            }
        }
    }

    private func selectCoach() {
        guard let url = apiURL("/coach/select"),
              let userId = appState.userId else { return }

        isSubmitting = true
        errorText = ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        let body = ["userId": userId, "coach": localCoach] as [String : Any]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            DispatchQueue.main.async {
                isSubmitting = false
                if status >= 200 && status < 300 {
                    appState.selectedCoach = localCoach
                    return
                }
                if let data = data,
                   let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let message = payload["error"] as? String {
                    errorText = message
                } else {
                    errorText = "Failed to select coach."
                }
            }
        }.resume()
    }
}

private struct CoachSelectionCard: View {
    let coach: String
    let tag: String
    let badge: String
    let title: String
    let subtitle: String
    let highlight: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                Text(badge.uppercased())
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1.4)
                    .foregroundColor(Color.zymCoachInk(coach))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Color.white.opacity(0.72))
                    .overlay(
                        Capsule()
                            .stroke(Color.zymCoachAccent(coach).opacity(0.18), lineWidth: 1)
                    )
                    .clipShape(Capsule())

                CoachAvatar(coach: coach, state: selected ? .selected : .idle, size: 56)
                    .frame(width: 56, height: 56)

                Text(title)
                    .font(.custom("Syne", size: 22))
                    .foregroundColor(Color.zymText)

                Text(subtitle)
                    .font(.system(size: 13))
                    .foregroundColor(Color.zymSubtext)
                    .fixedSize(horizontal: false, vertical: true)

                Text(highlight)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color.zymCoachInk(coach))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(
                LinearGradient(
                    colors: [
                        Color.white.opacity(selected ? 0.98 : 0.92),
                        Color.zymCoachSoft(coach).opacity(selected ? 0.84 : 0.56)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(selected ? Color.zymCoachAccent(coach) : Color.zymLine, lineWidth: selected ? 2 : 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .scaleEffect(selected ? 1 : 0.985)
            .shadow(color: selected ? Color.zymCoachAccent(coach).opacity(0.16) : .clear, radius: 12, x: 0, y: 8)
            .animation(.zymSpring, value: selected)
        }
        .buttonStyle(.plain)
    }
}
