import SwiftUI

struct EditProfileView: View {
    let profile: UserProfile
    let onSave: () -> Void
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var appState: AppState

    @State private var bio = ""
    @State private var fitnessGoal = ""
    @State private var hobbies = ""

    var body: some View {
        NavigationView {
            Form {
                Section("About") {
                    TextField("Bio", text: $bio, axis: .vertical)
                        .lineLimit(3...6)
                }

                Section("Fitness") {
                    TextField("Goal", text: $fitnessGoal)
                }

                Section("Interests") {
                    TextField("Hobbies", text: $hobbies)
                }
            }
            .navigationTitle("Edit Profile")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { saveProfile() }
                }
            }
        }
        .onAppear {
            bio = profile.bio ?? ""
            fitnessGoal = profile.fitness_goal ?? ""
            hobbies = profile.hobbies ?? ""
        }
    }

    func saveProfile() {
        guard let userId = appState.userId,
              let url = apiURL("/profile/update") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        let body = ["userId": userId, "bio": bio, "fitness_goal": fitnessGoal, "hobbies": hobbies] as [String: Any]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        authorizedDataTask(appState: appState, request: request) { _, _, _ in
            DispatchQueue.main.async {
                onSave()
                dismiss()
            }
        }.resume()
    }
}
