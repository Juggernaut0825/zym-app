import SwiftUI

struct LoginView: View {
    @State private var identifier = ""
    @State private var password = ""
    @State private var showError = false
    @State private var errorMessage = "Please check your credentials."
    @State private var pending = false
    @State private var showContent = false
    @State private var showForgotPassword = false
    @State private var showVerifyEmail = false
    @State private var verificationEmail = ""
    @State private var verificationSentOnAppear = false
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
                    TextField("Email or username", text: $identifier)
                        .padding(12)
                        .background(Color.zymSurface)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.zymLine, lineWidth: 1)
                        )
                        .cornerRadius(12)
                        .foregroundColor(Color.zymText)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

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

                if !errorMessage.isEmpty && showError {
                    Text(errorMessage)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button(action: login) {
                    HStack(spacing: 8) {
                        if pending {
                            ProgressView()
                                .tint(.white)
                        }
                        Text(pending ? "Signing in..." : "Get to work")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(ZYMPrimaryButton())
                .disabled(pending)

                HStack(spacing: 10) {
                    Button("Forgot password?") {
                        showForgotPassword = true
                    }
                    .foregroundColor(Color.zymPrimaryDark)
                    .font(.system(size: 13, weight: .semibold))

                    Spacer()

                    NavigationLink("Create account", destination: RegisterView(initialEmail: identifier.contains("@") ? identifier : ""))
                        .foregroundColor(Color.zymPrimaryDark)
                        .font(.system(size: 14, weight: .semibold))
                }

                if !verificationEmail.isEmpty {
                    Button("Resend verification email") {
                        verificationSentOnAppear = false
                        showVerifyEmail = true
                    }
                    .buttonStyle(ZYMGhostButton())
                }
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
        .sheet(isPresented: $showForgotPassword) {
            ForgotPasswordSheet(initialEmail: identifier.contains("@") ? identifier : "")
        }
        .sheet(isPresented: $showVerifyEmail) {
            EmailVerificationSheet(
                email: verificationEmail,
                sentOnAppear: verificationSentOnAppear,
                onDone: nil
            )
        }
        .alert("Login failed", isPresented: $showError) {
            Button("OK", role: .cancel) { }
            if !verificationEmail.isEmpty {
                Button("Verify email") {
                    verificationSentOnAppear = false
                    showVerifyEmail = true
                }
            }
        } message: {
            Text(errorMessage)
        }
    }

    private func login() {
        let trimmedIdentifier = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        if pending { return }
        guard !trimmedIdentifier.isEmpty else {
            errorMessage = "Please enter your email or username."
            showError = true
            return
        }
        guard !password.isEmpty else {
            errorMessage = "Please enter your password."
            showError = true
            return
        }
        guard let url = apiURL("/auth/login") else {
            errorMessage = "API URL is unavailable."
            showError = true
            return
        }

        pending = true
        showError = false
        verificationEmail = trimmedIdentifier.contains("@") ? trimmedIdentifier.lowercased() : ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "identifier": trimmedIdentifier,
            "password": password,
            "timezone": TimeZone.current.identifier,
        ])

        URLSession.shared.dataTask(with: request) { data, response, error in
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            if let error {
                DispatchQueue.main.async {
                    pending = false
                    errorMessage = "Cannot reach server (\(apiBaseURLString())). \(error.localizedDescription)"
                    showError = true
                }
                return
            }

            guard statusCode >= 200 && statusCode < 300,
                  let data,
                  let loginResponse = try? JSONDecoder().decode(AuthLoginResponse.self, from: data) else {
                let apiMessage = parseAPIErrorMessage(from: data) ?? "Login failed."
                DispatchQueue.main.async {
                    pending = false
                    errorMessage = statusCode == 401 ? "Invalid email, username, or password." : apiMessage
                    if statusCode == 403,
                       apiMessage.localizedCaseInsensitiveContains("verify your email"),
                       verificationEmail.isEmpty == false {
                        verificationSentOnAppear = false
                    }
                    showError = true
                }
                return
            }

            DispatchQueue.main.async {
                pending = false
                appState.username = loginResponse.username ?? trimmedIdentifier
                appState.token = loginResponse.token
                appState.refreshToken = loginResponse.refreshToken
                appState.userId = loginResponse.userId
                let preservedCoach = appState.userId == loginResponse.userId ? appState.selectedCoach : nil
                appState.selectedCoach = loginResponse.selectedCoach ?? preservedCoach
                appState.isLoggedIn = true
            }
        }.resume()
    }
}
