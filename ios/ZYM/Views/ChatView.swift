import SwiftUI

struct ChatView: View {
    @State private var message = ""
    @State private var messages: [ChatMessage] = []
    @EnvironmentObject var appState: AppState
    @StateObject private var wsManager = WebSocketManager()

    var body: some View {
        ZStack {
            Color(red: 0.1, green: 0.1, blue: 0.1).ignoresSafeArea()

            VStack {
                ScrollView {
                    ForEach(messages) { msg in
                        HStack {
                            if msg.role == "user" { Spacer() }
                            Text(msg.content)
                                .padding()
                                .background(msg.role == "user" ? Color(red: 0.37, green: 0.43, blue: 0.37) : Color(red: 0.16, green: 0.16, blue: 0.16))
                                .foregroundColor(.white)
                                .cornerRadius(12)
                            if msg.role == "assistant" { Spacer() }
                        }
                        .padding(.horizontal)
                    }
                }

                HStack {
                    TextField("Message", text: $message)
                        .padding()
                        .background(Color(red: 0.16, green: 0.16, blue: 0.16))
                        .cornerRadius(8)
                        .foregroundColor(.white)
                    Button("Send") {
                        sendMessage()
                    }
                    .padding()
                    .background(Color(red: 0.37, green: 0.43, blue: 0.37))
                    .foregroundColor(.white)
                    .cornerRadius(8)
                }
                .padding()
            }
        }
        .onAppear {
            if let token = appState.token {
                wsManager.connect(token: token)
                wsManager.onMessage = { content in
                    messages.append(ChatMessage(role: "assistant", content: content))
                }
            }
        }
        .onDisappear {
            wsManager.disconnect()
        }
    }

    func sendMessage() {
        let userMsg = message
        messages.append(ChatMessage(role: "user", content: userMsg))
        wsManager.sendMessage(userMsg)
        message = ""
    }
}

struct ChatMessage: Identifiable {
    let id = UUID()
    let role: String
    let content: String
}
