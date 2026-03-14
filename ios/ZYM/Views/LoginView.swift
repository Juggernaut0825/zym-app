import SwiftUI

struct LoginView: View {
    @State private var username = ""
    @State private var password = ""
    @State private var showError = false
    @State private var errorMessage = "Please check username and password."
    @State private var pending = false
    @State private var showContent = false
    @EnvironmentObject var appState: AppState

    var body: some View {
        ZStack {
            ZYMBackgroundLayer()
                .ignoresSafeArea()

            VStack(spacing: 22) {
                VStack(spacing: 8) {
                    HStack(spacing: 8) {
                        Circle()
                            .fill(Color.zymPrimary)
                            .frame(width: 9, height: 9)
                        Text("Lifestyle Fitness Community")
                            .font(.system(size: 11, weight: .bold))
                            .tracking(1.4)
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

                    Text("ZYM")
                        .font(.custom("Syne", size: 52))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [Color.zymSecondaryDark, Color.zymPrimaryDark],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                    Text("AI coach + community")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Color.zymSubtext)
                }

                VStack(spacing: 12) {
                    TextField("Username", text: $username)
                        .padding(12)
                        .background(Color.zymSurface)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.zymLine, lineWidth: 1)
                        )
                        .cornerRadius(12)
                        .foregroundColor(Color.zymText)
                        .autocapitalization(.none)

                    SecureField("Password", text: $password)
                        .padding(12)
                        .background(Color.zymSurface)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.zymLine, lineWidth: 1)
                        )
                        .cornerRadius(12)
                        .foregroundColor(Color.zymText)
                }

                Button(action: login) {
                    HStack(spacing: 8) {
                        if pending {
                            ProgressView()
                                .tint(.white)
                        }
                        Text(pending ? "Signing in..." : "Login")
                    }
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(ZYMPrimaryButton())
                .disabled(pending)

                NavigationLink("Create account", destination: RegisterView())
                    .foregroundColor(Color.zymPrimaryDark)
                    .font(.system(size: 14, weight: .semibold))
            }
            .padding(24)
            .frame(maxWidth: 420)
            .zymCard()
            .padding(.horizontal, 18)
            .opacity(showContent ? 1 : 0)
            .offset(y: showContent ? 0 : 16)
        }
        .onAppear {
            withAnimation(.zymSpring) {
                showContent = true
            }
        }
        .alert("Login failed", isPresented: $showError) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(errorMessage)
        }
    }

    func login() {
        if pending { return }
        guard let url = apiURL("/auth/login") else {
            return
        }
        pending = true

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = [
            "username": username,
            "password": password,
            "timezone": TimeZone.current.identifier,
        ]
        request.httpBody = try? JSONEncoder().encode(body)

        URLSession.shared.dataTask(with: request) { data, response, error in
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            if let error = error {
                DispatchQueue.main.async {
                    pending = false
                    errorMessage = "Cannot reach server (\(apiBaseURLString())). \(error.localizedDescription)"
                    showError = true
                }
                return
            }

            guard statusCode >= 200 && statusCode < 300,
                  let data,
                  let loginResponse = try? JSONDecoder().decode(LoginResponse.self, from: data) else {
                let messageFromAPI: String? = {
                    guard let data,
                          let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                          let message = payload["error"] as? String,
                          !message.isEmpty else { return nil }
                    return message
                }()
                DispatchQueue.main.async {
                    pending = false
                    if statusCode == 401 || statusCode == 403 {
                        errorMessage = "Invalid username or password."
                    } else {
                        errorMessage = messageFromAPI ?? "Login request failed. Please verify API URL and server status."
                    }
                    showError = true
                }
                return
            }

            DispatchQueue.main.async {
                pending = false
                appState.username = username
                appState.token = loginResponse.token
                appState.refreshToken = loginResponse.refreshToken
                appState.userId = loginResponse.userId
                appState.selectedCoach = loginResponse.selectedCoach
                appState.isLoggedIn = true
            }
        }.resume()
    }
}

struct LoginResponse: Codable {
    let token: String
    let refreshToken: String
    let userId: Int
    let selectedCoach: String?
}
