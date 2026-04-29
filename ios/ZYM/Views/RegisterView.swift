import SwiftUI

struct RegisterView: View {
    let initialEmail: String

    @State private var username = ""
    @State private var email = ""
    @State private var password = ""
    @State private var acceptedTerms = true
    @State private var pending = false
    @State private var errorMessage = ""
    @State private var showVerifyEmail = false
    @Environment(\.dismiss) var dismiss

    init(initialEmail: String = "") {
        self.initialEmail = initialEmail
    }

    var body: some View {
        ZStack {
            ZYMBackgroundLayer().ignoresSafeArea()

            ScrollView {
                VStack(spacing: 18) {
                Text("Create Account")
                    .font(.custom("Syne", size: 34))
                    .foregroundColor(Color.zymPrimary)

                VStack(spacing: 10) {
                    TextField("Username", text: $username)
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

                    TextField("Email", text: $email)
                        .padding(12)
                        .background(Color.zymSurface)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.zymLine, lineWidth: 1)
                        )
                        .cornerRadius(12)
                        .foregroundColor(Color.zymText)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)

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

                AuthConsentCheckbox(isAccepted: $acceptedTerms, action: "By creating an account")
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(Color.white.opacity(0.78))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Color.zymLine, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                if !errorMessage.isEmpty {
                    Text(errorMessage)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button(pending ? "Creating..." : "Register") { register() }
                    .frame(maxWidth: .infinity)
                    .buttonStyle(ZYMPrimaryButton())

                Button("Back to login") {
                    dismiss()
                }
                .frame(maxWidth: .infinity)
                .buttonStyle(ZYMGhostButton())
                }
            }
            .padding(22)
            .zymCard()
            .padding(.horizontal, 18)
        }
        .onAppear {
            if email.isEmpty {
                email = initialEmail
            }
        }
        .sheet(isPresented: $showVerifyEmail) {
            EmailVerificationSheet(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                sentOnAppear: true
            ) {
                dismiss()
            }
        }
    }

    func register() {
        let normalizedUsername = username.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        guard !pending else { return }
        guard !normalizedUsername.isEmpty, !normalizedEmail.isEmpty, password.count >= 8 else {
            errorMessage = "Username, email, and password must be provided. Password must be at least 8 characters."
            return
        }
        guard normalizedEmail.contains("@"), normalizedEmail.contains(".") else {
            errorMessage = "Please enter a valid email address."
            return
        }
        guard acceptedTerms else {
            errorMessage = "Please agree to ZYM's Privacy Policy and Terms before creating your account."
            return
        }
        guard let url = apiURL("/auth/register") else { return }

        pending = true
        errorMessage = ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "username": normalizedUsername,
            "email": normalizedEmail,
            "password": password,
            "healthDisclaimerAccepted": true,
            "consentVersion": zymHealthDisclaimerVersion,
        ])

        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                pending = false

                if let error {
                    errorMessage = error.localizedDescription
                    return
                }

                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard statusCode >= 200 && statusCode < 300,
                      let data,
                      let payload = try? JSONDecoder().decode(AuthRegisterResponse.self, from: data) else {
                    errorMessage = parseAPIErrorMessage(from: data) ?? "Registration failed."
                    return
                }

                if payload.verificationRequired == true {
                    email = normalizedEmail
                    showVerifyEmail = true
                    return
                }

                dismiss()
            }
        }.resume()
    }
}
