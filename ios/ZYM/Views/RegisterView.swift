import SwiftUI

struct RegisterView: View {
    @State private var username = ""
    @State private var email = ""
    @State private var password = ""
    @Environment(\.dismiss) var dismiss

    var body: some View {
        ZStack {
            Color.zymBackground.ignoresSafeArea()

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

                Button("Register") { register() }
                    .frame(maxWidth: .infinity)
                    .buttonStyle(ZYMPrimaryButton())
            }
            .padding(22)
            .zymCard()
            .padding(.horizontal, 18)
        }
    }

    func register() {
        guard let url = apiURL("/auth/register") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(["username": username, "email": email, "password": password])
        URLSession.shared.dataTask(with: request) { _, _, _ in
            DispatchQueue.main.async { dismiss() }
        }.resume()
    }
}
