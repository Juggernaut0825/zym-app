import SwiftUI

struct CoachSelectionView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedCoach: String?

    var body: some View {
        ZStack {
            Color.white.ignoresSafeArea()

            VStack(spacing: 40) {
                Text("Choose Your Coach")
                    .font(.custom("Syne", size: 32))
                    .fontWeight(.bold)
                    .foregroundColor(Color(red: 0.1, green: 0.1, blue: 0.1))

                HStack(spacing: 20) {
                    CoachCard(
                        name: "ZJ",
                        description: "Gentle & Encouraging",
                        isSelected: selectedCoach == "zj",
                        action: { selectedCoach = "zj" }
                    )

                    CoachCard(
                        name: "LC",
                        description: "Strict & Direct",
                        isSelected: selectedCoach == "lc",
                        action: { selectedCoach = "lc" }
                    )
                }

                Button(action: saveCoach) {
                    Text("Start Training")
                        .font(.custom("Syne", size: 18))
                        .fontWeight(.semibold)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color(red: 0.37, green: 0.43, blue: 0.37))
                        .cornerRadius(12)
                }
                .padding(.horizontal)
                .disabled(selectedCoach == nil)
            }
        }
    }

    func saveCoach() {
        guard let coach = selectedCoach,
              let userId = appState.userId,
              let url = apiURL("/coach/select") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        let body = ["userId": userId, "coach": coach] as [String: Any]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        authorizedDataTask(appState: appState, request: request) { _, _, _ in
            DispatchQueue.main.async {
                appState.selectedCoach = coach
            }
        }.resume()
    }
}

struct CoachCard: View {
    let name: String
    let description: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack {
                Circle()
                    .fill(Color(red: 0.37, green: 0.43, blue: 0.37))
                    .frame(width: 80, height: 80)
                    .overlay(
                        Image(systemName: "figure.strengthtraining.traditional")
                            .font(.system(size: 32, weight: .semibold))
                            .foregroundColor(.white)
                    )
                Text(name)
                    .font(.custom("Syne", size: 24))
                    .fontWeight(.bold)
                    .foregroundColor(Color(red: 0.1, green: 0.1, blue: 0.1))
                Text(description)
                    .font(.caption)
                    .foregroundColor(Color(red: 0.6, green: 0.6, blue: 0.6))
            }
            .padding()
            .background(isSelected ? Color(red: 0.37, green: 0.43, blue: 0.37).opacity(0.1) : Color.white)
            .cornerRadius(16)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(isSelected ? Color(red: 0.37, green: 0.43, blue: 0.37) : Color(red: 0.9, green: 0.9, blue: 0.9), lineWidth: 2)
            )
        }
    }
}
