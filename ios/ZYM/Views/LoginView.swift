import SwiftUI
import AuthenticationServices
import CryptoKit
import Security
import UIKit

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
    @State private var authConsentAccepted = true
    @State private var appleSignInCoordinator: AppleSignInCoordinator?
    @State private var googleAuthSession: ASWebAuthenticationSession?
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

                VStack(spacing: 10) {
                    HStack(spacing: 10) {
                        Rectangle()
                            .fill(Color.zymLine)
                            .frame(height: 1)
                        Text("- or continue with -")
                            .font(.system(size: 11, weight: .bold))
                            .tracking(1.2)
                            .foregroundColor(Color.zymSubtext)
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                        Rectangle()
                            .fill(Color.zymLine)
                            .frame(height: 1)
                    }

                    HStack(spacing: 18) {
                        Button(action: startAppleSignIn) {
                            SocialLoginImage(name: "SignInWithAppleMark", size: 54)
                        }
                        .buttonStyle(.plain)
                        .disabled(pending)
                        .accessibilityLabel("Continue with Apple")

                        Button(action: startGoogleSignIn) {
                            SocialLoginImage(name: "SignInWithGoogleMark", size: 54)
                        }
                        .buttonStyle(.plain)
                        .disabled(pending)
                        .accessibilityLabel("Continue with Google")
                    }

                    AuthConsentCheckbox(isAccepted: $authConsentAccepted, action: "By logging in")
                }

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
        guard authConsentAccepted else {
            errorMessage = "Please agree to ZYM's Privacy Policy and Terms before logging in."
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
                appState.username = loginResponse.display_name ?? loginResponse.username ?? trimmedIdentifier
                appState.token = loginResponse.token
                appState.refreshToken = loginResponse.refreshToken
                appState.userId = loginResponse.userId
                let preservedCoach = appState.userId == loginResponse.userId ? appState.selectedCoach : nil
                appState.selectedCoach = loginResponse.selectedCoach ?? preservedCoach
                appState.timezone = loginResponse.timezone ?? appState.timezone ?? TimeZone.current.identifier
                appState.isLoggedIn = true
            }
        }.resume()
    }

    private func handleAppleSignIn(_ result: Result<ASAuthorization, Error>) {
        if pending { return }
        switch result {
        case .failure(let error):
            if let authError = error as? ASAuthorizationError,
               authError.code == .canceled {
                return
            }
            errorMessage = error.localizedDescription
            showError = true
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
                errorMessage = "Apple sign-in did not return a valid credential."
                showError = true
                return
            }
            guard let tokenData = credential.identityToken,
                  let identityToken = String(data: tokenData, encoding: .utf8),
                  !identityToken.isEmpty else {
                errorMessage = "Apple sign-in did not return an identity token."
                showError = true
                return
            }
            loginWithApple(identityToken: identityToken, fullName: appleFullName(credential.fullName))
        }
    }

    private func startAppleSignIn() {
        if pending { return }
        guard authConsentAccepted else {
            errorMessage = "Please agree to ZYM's Privacy Policy and Terms before continuing with Apple."
            showError = true
            return
        }
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        let coordinator = AppleSignInCoordinator { result in
            DispatchQueue.main.async {
                appleSignInCoordinator = nil
                handleAppleSignIn(result)
            }
        }
        appleSignInCoordinator = coordinator

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = coordinator
        controller.presentationContextProvider = coordinator
        controller.performRequests()
    }

    private func appleFullName(_ components: PersonNameComponents?) -> String? {
        guard let components else { return nil }
        let formatter = PersonNameComponentsFormatter()
        formatter.style = .default
        let rendered = formatter.string(from: components).trimmingCharacters(in: .whitespacesAndNewlines)
        return rendered.isEmpty ? nil : rendered
    }

    private func loginWithApple(identityToken: String, fullName: String?) {
        guard let url = apiURL("/auth/apple") else {
            errorMessage = "API URL is unavailable."
            showError = true
            return
        }

        pending = true
        showError = false

        var body: [String: Any] = [
            "identityToken": identityToken,
            "timezone": TimeZone.current.identifier,
            "healthDisclaimerAccepted": authConsentAccepted,
            "consentVersion": zymHealthDisclaimerVersion,
        ]
        if let fullName, !fullName.isEmpty {
            body["fullName"] = fullName
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

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
                let apiMessage = parseAPIErrorMessage(from: data) ?? "Apple sign-in failed."
                DispatchQueue.main.async {
                    pending = false
                    errorMessage = apiMessage
                    showError = true
                }
                return
            }

            DispatchQueue.main.async {
                pending = false
                appState.username = loginResponse.display_name ?? loginResponse.username
                appState.token = loginResponse.token
                appState.refreshToken = loginResponse.refreshToken
                appState.userId = loginResponse.userId
                let preservedCoach = appState.userId == loginResponse.userId ? appState.selectedCoach : nil
                appState.selectedCoach = loginResponse.selectedCoach ?? preservedCoach
                appState.timezone = loginResponse.timezone ?? appState.timezone ?? TimeZone.current.identifier
                appState.isLoggedIn = true
            }
        }.resume()
    }

    private func startGoogleSignIn() {
        if pending { return }
        guard authConsentAccepted else {
            errorMessage = "Please agree to ZYM's Privacy Policy and Terms before continuing with Google."
            showError = true
            return
        }
        pending = true
        showError = false

        resolveGoogleOAuthConfig { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let config):
                    launchGoogleOAuth(config: config)
                case .failure(let error):
                    pending = false
                    errorMessage = error.localizedDescription
                    showError = true
                }
            }
        }
    }

    private func resolveGoogleOAuthConfig(completion: @escaping (Result<GoogleOAuthConfig, Error>) -> Void) {
        if let localConfig = GoogleOAuthConfig.local() {
            completion(.success(localConfig))
            return
        }

        guard let url = apiURL("/auth/google/mobile-config") else {
            completion(.failure(googleOAuthError("Google sign-in is not configured for this app.")))
            return
        }

        URLSession.shared.dataTask(with: url) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard (200...299).contains(statusCode),
                  let data,
                  let payload = try? JSONDecoder().decode(GoogleMobileConfigResponse.self, from: data),
                  payload.configured != false,
                  let config = GoogleOAuthConfig(
                    clientId: payload.clientId,
                    redirectScheme: payload.redirectScheme
                  ) else {
                completion(.failure(googleOAuthError("Google sign-in needs a Google iOS client ID on the server.")))
                return
            }

            completion(.success(config))
        }.resume()
    }

    private func launchGoogleOAuth(config: GoogleOAuthConfig) {
        let state = googleRandomURLSafeString(byteCount: 18)
        let verifier = googleRandomURLSafeString(byteCount: 48)
        let challenge = googleCodeChallenge(for: verifier)

        var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")
        components?.queryItems = [
            URLQueryItem(name: "client_id", value: config.clientId),
            URLQueryItem(name: "redirect_uri", value: config.redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid email profile"),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "prompt", value: "select_account"),
        ]

        guard let authURL = components?.url else {
            pending = false
            errorMessage = "Could not start Google sign-in."
            showError = true
            return
        }

        let session = ASWebAuthenticationSession(
            url: authURL,
            callbackURLScheme: config.redirectScheme
        ) { callbackURL, error in
            DispatchQueue.main.async {
                googleAuthSession = nil

                if let authError = error as? ASWebAuthenticationSessionError,
                   authError.code == .canceledLogin {
                    pending = false
                    return
                }

                if let error {
                    pending = false
                    errorMessage = error.localizedDescription
                    showError = true
                    return
                }

                guard let callbackURL,
                      let items = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?.queryItems else {
                    pending = false
                    errorMessage = "Google sign-in did not return a response."
                    showError = true
                    return
                }

                if let returnedState = items.first(where: { $0.name == "state" })?.value,
                   returnedState != state {
                    pending = false
                    errorMessage = "Google sign-in returned an invalid state."
                    showError = true
                    return
                }

                if let googleError = items.first(where: { $0.name == "error" })?.value,
                   !googleError.isEmpty {
                    pending = false
                    errorMessage = googleError
                    showError = true
                    return
                }

                guard let code = items.first(where: { $0.name == "code" })?.value,
                      !code.isEmpty else {
                    pending = false
                    errorMessage = "Google sign-in did not return an authorization code."
                    showError = true
                    return
                }

                exchangeGoogleAuthorizationCode(
                    code,
                    verifier: verifier,
                    redirectURI: config.redirectURI,
                    clientId: config.clientId
                )
            }
        }
        session.presentationContextProvider = GoogleOAuthPresentationContextProvider.shared
        googleAuthSession = session

        if !session.start() {
            googleAuthSession = nil
            pending = false
            errorMessage = "Could not open Google sign-in."
            showError = true
        }
    }

    private func exchangeGoogleAuthorizationCode(
        _ code: String,
        verifier: String,
        redirectURI: String,
        clientId: String
    ) {
        guard let url = URL(string: "https://oauth2.googleapis.com/token") else {
            pending = false
            errorMessage = "Google token endpoint is unavailable."
            showError = true
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = googleFormURLEncoded([
            "client_id": clientId,
            "code": code,
            "code_verifier": verifier,
            "grant_type": "authorization_code",
            "redirect_uri": redirectURI,
        ])

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                DispatchQueue.main.async {
                    pending = false
                    errorMessage = error.localizedDescription
                    showError = true
                }
                return
            }

            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard (200...299).contains(statusCode),
                  let data,
                  let tokenResponse = try? JSONDecoder().decode(GoogleOAuthTokenResponse.self, from: data),
                  let idToken = tokenResponse.idToken,
                  !idToken.isEmpty else {
                let googleMessage = googleOAuthTokenErrorMessage(data) ?? "Google sign-in failed."
                DispatchQueue.main.async {
                    pending = false
                    errorMessage = googleMessage
                    showError = true
                }
                return
            }

            DispatchQueue.main.async {
                loginWithGoogle(idToken: idToken)
            }
        }.resume()
    }

    private func loginWithGoogle(idToken: String) {
        guard let url = apiURL("/auth/google") else {
            pending = false
            errorMessage = "API URL is unavailable."
            showError = true
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "idToken": idToken,
            "timezone": TimeZone.current.identifier,
            "healthDisclaimerAccepted": authConsentAccepted,
            "consentVersion": zymHealthDisclaimerVersion,
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
                let apiMessage = parseAPIErrorMessage(from: data) ?? "Google sign-in failed."
                DispatchQueue.main.async {
                    pending = false
                    errorMessage = apiMessage
                    showError = true
                }
                return
            }

            DispatchQueue.main.async {
                pending = false
                appState.username = loginResponse.display_name ?? loginResponse.username ?? appState.username
                appState.token = loginResponse.token
                appState.refreshToken = loginResponse.refreshToken
                appState.userId = loginResponse.userId
                let preservedCoach = appState.userId == loginResponse.userId ? appState.selectedCoach : nil
                appState.selectedCoach = loginResponse.selectedCoach ?? preservedCoach
                appState.timezone = loginResponse.timezone ?? appState.timezone ?? TimeZone.current.identifier
                appState.isLoggedIn = true
            }
        }.resume()
    }
}

private struct GoogleMobileConfigResponse: Decodable {
    let configured: Bool?
    let clientId: String?
    let redirectScheme: String?
}

private struct SocialLoginImage: View {
    let name: String
    let size: CGFloat

    var body: some View {
        Image(name)
            .resizable()
            .renderingMode(.original)
            .interpolation(.high)
            .scaledToFit()
            .frame(width: size, height: size)
            .shadow(color: Color.black.opacity(0.08), radius: 10, x: 0, y: 5)
    }
}

private final class AppleSignInCoordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private let completion: (Result<ASAuthorization, Error>) -> Void

    init(completion: @escaping (Result<ASAuthorization, Error>) -> Void) {
        self.completion = completion
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        completion(.success(authorization))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        completion(.failure(error))
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        googleOAuthPresentationAnchor()
    }
}

private struct GoogleOAuthTokenResponse: Decodable {
    let idToken: String?

    enum CodingKeys: String, CodingKey {
        case idToken = "id_token"
    }
}

private struct GoogleOAuthTokenErrorResponse: Decodable {
    let error: String?
    let errorDescription: String?

    enum CodingKeys: String, CodingKey {
        case error
        case errorDescription = "error_description"
    }
}

private struct GoogleOAuthConfig {
    let clientId: String
    let redirectScheme: String

    var redirectURI: String {
        "\(redirectScheme):/oauth2redirect"
    }

    init?(clientId: String?, redirectScheme: String?) {
        let normalizedClientId = cleanGoogleConfigValue(clientId)
        let normalizedScheme = cleanGoogleConfigValue(redirectScheme)
            ?? GoogleOAuthConfig.redirectScheme(for: normalizedClientId)

        guard let normalizedClientId,
              let normalizedScheme else { return nil }

        self.clientId = normalizedClientId
        self.redirectScheme = normalizedScheme
    }

    static func local() -> GoogleOAuthConfig? {
        let environment = ProcessInfo.processInfo.environment
        let info = Bundle.main.infoDictionary ?? [:]
        let clientId = cleanGoogleConfigValue(environment["GOOGLE_IOS_CLIENT_ID"])
            ?? cleanGoogleConfigValue(info["GoogleOAuthClientID"] as? String)
        let redirectScheme = cleanGoogleConfigValue(environment["GOOGLE_IOS_REDIRECT_SCHEME"])
            ?? cleanGoogleConfigValue(info["GoogleOAuthRedirectScheme"] as? String)
        return GoogleOAuthConfig(clientId: clientId, redirectScheme: redirectScheme)
    }

    private static func redirectScheme(for clientId: String?) -> String? {
        guard let clientId else { return nil }
        let suffix = ".apps.googleusercontent.com"
        guard clientId.hasSuffix(suffix) else { return nil }
        return "com.googleusercontent.apps.\(String(clientId.dropLast(suffix.count)))"
    }
}

private final class GoogleOAuthPresentationContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = GoogleOAuthPresentationContextProvider()

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        googleOAuthPresentationAnchor()
    }
}

private func googleOAuthPresentationAnchor() -> ASPresentationAnchor {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window = scenes
        .flatMap { $0.windows }
        .first(where: { $0.isKeyWindow })
    return window ?? ASPresentationAnchor(frame: .zero)
}

private func cleanGoogleConfigValue(_ value: String?) -> String? {
    let trimmed = String(value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty,
          !trimmed.contains("$("),
          !trimmed.lowercased().contains("your-google") else { return nil }
    return trimmed
}

private func googleRandomURLSafeString(byteCount: Int) -> String {
    var bytes = [UInt8](repeating: 0, count: byteCount)
    let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    if status == errSecSuccess {
        return Data(bytes).googleBase64URLEncodedString()
    }
    return UUID().uuidString.replacingOccurrences(of: "-", with: "")
}

private func googleCodeChallenge(for verifier: String) -> String {
    let data = Data(verifier.utf8)
    let digest = SHA256.hash(data: data)
    return Data(digest).googleBase64URLEncodedString()
}

private func googleFormURLEncoded(_ values: [String: String]) -> Data? {
    let body = values
        .map { key, value in
            "\(key.googleFormEscaped)=\(value.googleFormEscaped)"
        }
        .joined(separator: "&")
    return body.data(using: .utf8)
}

private func googleOAuthTokenErrorMessage(_ data: Data?) -> String? {
    guard let data,
          let response = try? JSONDecoder().decode(GoogleOAuthTokenErrorResponse.self, from: data) else { return nil }
    return response.errorDescription ?? response.error
}

private func googleOAuthError(_ message: String) -> NSError {
    NSError(
        domain: "ZYMGoogleSignIn",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: message]
    )
}

private extension Data {
    func googleBase64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

private extension String {
    var googleFormEscaped: String {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: ":#[]@!$&'()*+,;=")
        return addingPercentEncoding(withAllowedCharacters: allowed) ?? self
    }
}
