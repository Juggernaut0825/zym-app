import SwiftUI

struct LoginView: View {
    @State private var username = ""
    @State private var password = ""
    @State private var showError = false
    @State private var pending = false
    @State private var showContent = false
    @EnvironmentObject var appState: AppState

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.zymBackground, Color.white],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            Circle()
                .fill(Color.zymPrimary.opacity(0.16))
                .frame(width: 170, height: 170)
                .blur(radius: 8)
                .offset(x: -130, y: -280)

            Circle()
                .fill(Color.zymPrimary.opacity(0.10))
                .frame(width: 110, height: 110)
                .blur(radius: 7)
                .offset(x: 150, y: 300)

            VStack(spacing: 22) {
                VStack(spacing: 8) {
                    Text("ZYM")
                        .font(.custom("Syne", size: 52))
                        .foregroundColor(Color.zymPrimary)
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
                    .foregroundColor(Color.zymPrimary)
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
            Text("Please check username and password.")
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

        let body: [String: String] = ["username": username, "password": password]
        request.httpBody = try? JSONEncoder().encode(body)

        URLSession.shared.dataTask(with: request) { data, _, _ in
            guard let data = data,
                  let loginResponse = try? JSONDecoder().decode(LoginResponse.self, from: data) else {
                DispatchQueue.main.async {
                    pending = false
                    showError = true
                }
                return
            }

            DispatchQueue.main.async {
                pending = false
                appState.username = username
                appState.token = loginResponse.token
                appState.userId = loginResponse.userId
                appState.selectedCoach = loginResponse.selectedCoach
                appState.isLoggedIn = true
            }
        }.resume()
    }
}

struct LoginResponse: Codable {
    let token: String
    let userId: Int
    let selectedCoach: String?
}
