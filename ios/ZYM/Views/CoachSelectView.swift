import SwiftUI

struct CoachSelectView: View {
    @EnvironmentObject var appState: AppState
    @State private var localCoach: String = "zj"
    @State private var isSubmitting = false
    @State private var showContent = false
    @State private var errorText = ""

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.zymBackground, Color.white],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            Circle()
                .fill(Color.zymPrimary.opacity(0.18))
                .frame(width: 180, height: 180)
                .blur(radius: 8)
                .offset(x: -130, y: -300)

            Circle()
                .fill(Color.zymPrimary.opacity(0.12))
                .frame(width: 120, height: 120)
                .blur(radius: 7)
                .offset(x: 140, y: 310)

            VStack(spacing: 24) {
                VStack(spacing: 10) {
                    Text("Choose your coach")
                        .font(.custom("Syne", size: 38))
                        .foregroundColor(Color.zymText)

                    Text("You can switch coach style anytime in Profile.")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Color.zymSubtext)
                }
                .zymAppear(delay: 0.04)

                HStack(spacing: 12) {
                    CoachSelectionCard(
                        tag: "ZJ",
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
                        tag: "LC",
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
            .background(Color.white.opacity(0.84))
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

        URLSession.shared.dataTask(with: request) { data, response, _ in
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
    let tag: String
    let title: String
    let subtitle: String
    let highlight: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [Color.zymPrimary, Color.zymPrimaryDark],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 52, height: 52)
                    Text(tag)
                        .font(.custom("Syne", size: 22))
                        .foregroundColor(.white)
                }

                Text(title)
                    .font(.custom("Syne", size: 22))
                    .foregroundColor(Color.zymText)

                Text(subtitle)
                    .font(.system(size: 13))
                    .foregroundColor(Color.zymSubtext)
                    .fixedSize(horizontal: false, vertical: true)

                Text(highlight)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color.zymPrimaryDark)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(selected ? Color.zymSurfaceSoft : Color.white)
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(selected ? Color.zymPrimary : Color.zymLine, lineWidth: selected ? 2 : 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .scaleEffect(selected ? 1 : 0.985)
            .animation(.zymSpring, value: selected)
        }
        .buttonStyle(.plain)
    }
}
