import SwiftUI

let zymHealthDisclaimerVersion = "2026-03-26"
let zymPrivacyURL = URL(string: "https://zym8.com/privacy.html")!
let zymTermsURL = URL(string: "https://zym8.com/terms.html")!

private func zymConsentMarkdown(action: String) -> String {
    "\(action), I agree to ZYM's [Privacy Policy](\(zymPrivacyURL.absoluteString)) and [Terms](\(zymTermsURL.absoluteString))."
}

struct AuthConsentCheckbox: View {
    @Binding var isAccepted: Bool
    let action: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Button {
                isAccepted.toggle()
            } label: {
                Image(systemName: isAccepted ? "checkmark.square.fill" : "square")
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundColor(isAccepted ? Color.zymPrimaryDark : Color.zymSubtext)
                    .frame(width: 24, height: 24)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isAccepted ? "Agreement selected" : "Agreement not selected")

            Text(.init(zymConsentMarkdown(action: action)))
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(Color.zymSubtext)
                .tint(Color.zymPrimaryDark)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)
        }
    }
}

func parseAPIErrorMessage(from data: Data?) -> String? {
    guard let data else { return nil }
    if let decoded = try? JSONDecoder().decode(APIErrorResponse.self, from: data),
       !decoded.error.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return decoded.error
    }
    if let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       let error = payload["error"] as? String,
       !error.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return error
    }
    return nil
}

struct EmailVerificationSheet: View {
    let email: String
    let sentOnAppear: Bool
    let onDone: (() -> Void)?

    @Environment(\.dismiss) private var dismiss

    @State private var resendPending = false
    @State private var message = ""
    @State private var errorText = ""
    @State private var resent = false

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                VStack(alignment: .leading, spacing: 16) {
                    Text("Verify your email")
                        .font(.custom("Syne", size: 30))
                        .foregroundColor(Color.zymText)

                    Text(message)
                        .font(.system(size: 14))
                        .foregroundColor(Color.zymSubtext)

                    if !errorText.isEmpty {
                        Text(errorText)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.red)
                    }

                    if resent {
                        Text("Verification email sent if the address matches an unverified account.")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Color.zymPrimaryDark)
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.white.opacity(0.82))
                            .overlay(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .stroke(Color.zymLine, lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }

                    VStack(spacing: 10) {
                        Button(resendPending ? "Sending..." : "Resend verification email") {
                            resendVerification()
                        }
                        .buttonStyle(ZYMGhostButton())
                        .disabled(resendPending || email.isEmpty)

                        Button("Back to login") {
                            dismiss()
                            onDone?()
                        }
                        .buttonStyle(ZYMPrimaryButton())
                    }

                    Spacer()
                }
                .padding(20)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                        onDone?()
                    }
                }
            }
        }
        .onAppear {
            if sentOnAppear {
                message = "Check your inbox for a verification email. Delivery can take a minute. Once you verify, you can sign in."
            } else {
                message = "Verify your address to finish signing in. Once the email is verified, come back and log in."
            }
        }
    }

    private func resendVerification() {
        guard !email.isEmpty, !resendPending, let url = apiURL("/auth/verify-email/request") else { return }

        resendPending = true
        errorText = ""
        resent = false

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "email": email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
        ])

        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                resendPending = false
                if let error {
                    errorText = error.localizedDescription
                    return
                }
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard statusCode >= 200 && statusCode < 300,
                      let data,
                      let payload = try? JSONDecoder().decode(VerificationRequestResponse.self, from: data) else {
                    errorText = parseAPIErrorMessage(from: data) ?? "Failed to resend verification email."
                    return
                }
                resent = true
                message = payload.message ?? "A new verification email has been sent if the account exists."
            }
        }.resume()
    }
}

struct ForgotPasswordSheet: View {
    let initialEmail: String

    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var pending = false
    @State private var message = "Enter your email and we will send a password reset link if the account exists."
    @State private var errorText = ""
    @State private var success = false

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                VStack(alignment: .leading, spacing: 16) {
                    Text("Reset your password")
                        .font(.custom("Syne", size: 30))
                        .foregroundColor(Color.zymText)

                    Text(message)
                        .font(.system(size: 14))
                        .foregroundColor(Color.zymSubtext)

                    TextField("Email", text: $email)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .padding(12)
                        .background(Color.white.opacity(0.82))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .stroke(Color.zymLine, lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                    if !errorText.isEmpty {
                        Text(errorText)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.red)
                    }

                    if success {
                        Text("Reset email sent if that registered account exists. Check spam if you do not see it soon.")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Color.zymPrimaryDark)
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.white.opacity(0.82))
                            .overlay(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .stroke(Color.zymLine, lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }

                    Button(pending ? "Sending..." : "Send reset email") {
                        requestReset()
                    }
                    .buttonStyle(ZYMPrimaryButton())
                    .disabled(pending)

                    Spacer()
                }
                .padding(20)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .onAppear {
            email = initialEmail
        }
    }

    private func requestReset() {
        let normalized = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalized.isEmpty,
              let url = apiURL("/auth/forgot-password") else {
            errorText = "Please enter your email address."
            return
        }

        pending = true
        errorText = ""
        success = false

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "email": normalized,
        ])

        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                pending = false
                if let error {
                    errorText = error.localizedDescription
                    return
                }
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard statusCode >= 200 && statusCode < 300,
                      let data,
                      let payload = try? JSONDecoder().decode(VerificationRequestResponse.self, from: data) else {
                    errorText = parseAPIErrorMessage(from: data) ?? "Failed to request password reset."
                    return
                }
                message = payload.message ?? "If the account exists, a password reset email has been sent."
                success = true
            }
        }.resume()
    }
}
