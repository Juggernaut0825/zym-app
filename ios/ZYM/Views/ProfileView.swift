import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var appState: AppState
    @State private var profile: APIProfile?
    @State private var showEditor = false

    var body: some View {
        NavigationView {
            ZStack {
                Color.zymBackground.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 12) {
                        ZStack(alignment: .bottomLeading) {
                            if let cover = profile?.background_url, let url = URL(string: cover) {
                                AsyncImage(url: url) { phase in
                                    switch phase {
                                    case .success(let image):
                                        image
                                            .resizable()
                                            .scaledToFill()
                                    default:
                                        LinearGradient(
                                            colors: [Color.zymSurfaceSoft, Color.zymBackground],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    }
                                }
                                .frame(height: 170)
                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            } else {
                                LinearGradient(
                                    colors: [Color.zymSurfaceSoft, Color.zymBackground],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                                .frame(height: 170)
                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            }

                            HStack(spacing: 10) {
                                if let avatar = profile?.avatar_url, let url = URL(string: avatar) {
                                    AsyncImage(url: url) { phase in
                                        switch phase {
                                        case .success(let image):
                                            image
                                                .resizable()
                                                .scaledToFill()
                                        default:
                                            Circle().fill(Color.zymSurfaceSoft)
                                        }
                                    }
                                    .frame(width: 74, height: 74)
                                    .clipShape(Circle())
                                    .overlay(Circle().stroke(Color.white.opacity(0.8), lineWidth: 2))
                                } else {
                                    Circle()
                                        .fill(Color.zymPrimary)
                                        .frame(width: 74, height: 74)
                                        .overlay(
                                            Text(String((profile?.username ?? appState.username ?? "U").prefix(2)).uppercased())
                                                .font(.custom("Syne", size: 24))
                                                .foregroundColor(.white)
                                        )
                                        .overlay(Circle().stroke(Color.white.opacity(0.8), lineWidth: 2))
                                }

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(profile?.username ?? appState.username ?? "User")
                                        .font(.custom("Syne", size: 28))
                                        .foregroundColor(Color.zymText)
                                    Text("User ID: \(appState.userId ?? 0)")
                                        .font(.system(size: 12))
                                        .foregroundColor(Color.zymSubtext)
                                    Text("Coach: \((appState.selectedCoach ?? "zj").uppercased())")
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundColor(Color.zymSubtext)
                                }
                            }
                            .padding(12)
                        }
                        .zymCard()
                        .zymAppear(delay: 0.04)

                        VStack(alignment: .leading, spacing: 8) {
                            Text("Bio")
                                .font(.custom("Syne", size: 18))
                                .foregroundColor(Color.zymText)
                            Text(profile?.bio?.isEmpty == false ? profile?.bio ?? "" : "No bio yet.")
                                .font(.system(size: 14))
                                .foregroundColor(Color.zymSubtext)

                            Divider()

                            Text("Fitness Goal")
                                .font(.custom("Syne", size: 18))
                                .foregroundColor(Color.zymText)
                            Text(profile?.fitness_goal?.isEmpty == false ? profile?.fitness_goal ?? "" : "Not set")
                                .font(.system(size: 14))
                                .foregroundColor(Color.zymSubtext)

                            Divider()

                            Text("Hobbies")
                                .font(.custom("Syne", size: 18))
                                .foregroundColor(Color.zymText)
                            Text(profile?.hobbies?.isEmpty == false ? profile?.hobbies ?? "" : "Not set")
                                .font(.system(size: 14))
                                .foregroundColor(Color.zymSubtext)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .zymCard()
                        .zymAppear(delay: 0.1)

                        Button(action: { showEditor = true }) {
                            Text("Edit Profile")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(ZYMPrimaryButton())
                        .zymAppear(delay: 0.14)

                        Button(action: { appState.logout() }) {
                            Text("Logout")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(ZYMGhostButton())
                        .zymAppear(delay: 0.18)
                    }
                    .padding(14)
                }
            }
            .navigationTitle("Profile")
        }
        .sheet(isPresented: $showEditor) {
            ProfileEditSheet(profile: profile, onSaved: loadProfile)
                .environmentObject(appState)
        }
        .onAppear(perform: loadProfile)
    }

    private func loadProfile() {
        guard let userId = appState.userId,
              let url = apiURL("/profile/\(userId)") else { return }
        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        URLSession.shared.dataTask(with: request) { data, _, _ in
            guard let data = data,
                  let response = try? JSONDecoder().decode(APIProfile.self, from: data) else { return }
            DispatchQueue.main.async {
                profile = response
            }
        }.resume()
    }
}

private struct ProfileEditSheet: View {
    let profile: APIProfile?
    let onSaved: () -> Void

    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var bio = ""
    @State private var fitnessGoal = ""
    @State private var hobbies = ""
    @State private var avatarURL = ""
    @State private var backgroundURL = ""
    @State private var pending = false
    @State private var errorText = ""

    var body: some View {
        NavigationView {
            Form {
                Section("Profile") {
                    TextField("Bio", text: $bio, axis: .vertical)
                        .lineLimit(3...6)
                    TextField("Fitness goal", text: $fitnessGoal)
                    TextField("Hobbies", text: $hobbies)
                }

                Section("Images (URL)") {
                    TextField("Avatar URL", text: $avatarURL)
                        .textInputAutocapitalization(.never)
                    TextField("Background URL", text: $backgroundURL)
                        .textInputAutocapitalization(.never)
                }

                if !errorText.isEmpty {
                    Section {
                        Text(errorText)
                            .foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("Edit Profile")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(pending ? "Saving..." : "Save") {
                        saveProfile()
                    }
                    .disabled(pending)
                }
            }
        }
        .onAppear {
            bio = profile?.bio ?? ""
            fitnessGoal = profile?.fitness_goal ?? ""
            hobbies = profile?.hobbies ?? ""
            avatarURL = profile?.avatar_url ?? ""
            backgroundURL = profile?.background_url ?? ""
        }
    }

    private func saveProfile() {
        guard let userId = appState.userId,
              let url = apiURL("/profile/update") else { return }

        pending = true
        errorText = ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
            "bio": bio,
            "fitness_goal": fitnessGoal,
            "hobbies": hobbies,
            "avatar_url": avatarURL,
            "background_url": backgroundURL
        ])

        URLSession.shared.dataTask(with: request) { data, response, _ in
            DispatchQueue.main.async {
                pending = false
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                if statusCode < 200 || statusCode >= 300 {
                    if let data = data,
                       let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let message = payload["error"] as? String {
                        errorText = message
                    } else {
                        errorText = "Failed to save profile."
                    }
                    return
                }
                onSaved()
                dismiss()
            }
        }.resume()
    }
}

struct APIProfile: Codable {
    let id: Int
    let username: String
    let avatar_url: String?
    let background_url: String?
    let bio: String?
    let fitness_goal: String?
    let hobbies: String?
    let selected_coach: String?
}
