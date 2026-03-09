import SwiftUI

struct AddFriendView: View {
    @State private var phoneNumber = ""
    @State private var message = ""
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationView {
            ZStack {
                Color.white.ignoresSafeArea()

                VStack(spacing: 20) {
                    Text("Add Friend")
                        .font(.custom("Syne", size: 28))
                        .fontWeight(.bold)
                        .foregroundColor(Color(red: 0.1, green: 0.1, blue: 0.1))

                    TextField("Phone Number", text: $phoneNumber)
                        .padding()
                        .background(Color(red: 0.98, green: 0.98, blue: 0.98))
                        .cornerRadius(12)
                        .keyboardType(.phonePad)

                    Button(action: addFriend) {
                        Text("Send Request")
                            .font(.custom("Syne", size: 16))
                            .fontWeight(.semibold)
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color(red: 0.37, green: 0.43, blue: 0.37))
                            .cornerRadius(12)
                    }

                    if !message.isEmpty {
                        Text(message)
                            .foregroundColor(Color(red: 0.6, green: 0.6, blue: 0.6))
                    }

                    Spacer()
                }
                .padding()
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(Color(red: 0.37, green: 0.43, blue: 0.37))
                }
            }
        }
    }

    func addFriend() {
        guard let userId = appState.userId,
              let url = apiURL("/friends/add") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        let body = ["userId": userId, "phoneNumber": phoneNumber] as [String: Any]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: request) { data, _, _ in
            DispatchQueue.main.async {
                if let data = data, let response = try? JSONDecoder().decode([String: String].self, from: data) {
                    message = response["message"] ?? "Request sent"
                } else {
                    message = "Failed to send request"
                }
            }
        }.resume()
    }
}
