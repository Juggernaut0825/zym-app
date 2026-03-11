import SwiftUI

struct CreateGroupView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var appState: AppState
    @State private var groupName = ""
    @State private var coachEnabled = true
    let onCreate: () -> Void

    var body: some View {
        NavigationView {
            ZStack {
                Color.zymBackground.ignoresSafeArea()

                VStack(spacing: 12) {
                    TextField("Group Name", text: $groupName)
                        .padding(12)
                        .background(Color.zymSurface)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.zymLine, lineWidth: 1)
                        )
                        .cornerRadius(12)

                    Toggle("Enable AI Coach", isOn: $coachEnabled)
                        .padding(12)
                        .background(Color.zymSurface)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.zymLine, lineWidth: 1)
                        )
                        .cornerRadius(12)

                    Spacer()
                }
                .padding(18)
            }
            .navigationTitle("Create Group")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(Color.zymSubtext)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Create") { createGroup() }
                        .foregroundColor(Color.zymPrimary)
                }
            }
        }
    }

    func createGroup() {
        guard let userId = appState.userId,
              let url = apiURL("/groups/create") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)

        let body = [
            "name": groupName,
            "ownerId": userId,
            "coachEnabled": coachEnabled ? (appState.selectedCoach ?? "zj") : "none"
        ] as [String : Any]

        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        authorizedDataTask(appState: appState, request: request) { _, _, _ in
            DispatchQueue.main.async {
                onCreate()
                dismiss()
            }
        }.resume()
    }
}

struct Group: Identifiable, Codable {
    let id: Int
    let name: String
    let coach_enabled: String?
}

struct GroupsResponse: Codable {
    let groups: [Group]
}
