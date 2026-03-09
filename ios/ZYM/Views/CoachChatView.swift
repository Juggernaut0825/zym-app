import SwiftUI

struct CoachChatView: View {
    @StateObject private var wsManager = WebSocketManager()
    @State private var inputText = ""

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(wsManager.messages) { message in
                        MessageBubble(message: message)
                    }
                }
                .padding()
            }

            HStack(spacing: 12) {
                TextField("Message", text: $inputText)
                    .textFieldStyle(.roundedBorder)
                    .submitLabel(.send)
                    .onSubmit {
                        sendMessage()
                    }

                Button(action: sendMessage) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 32))
                }
                .disabled(inputText.isEmpty)
            }
            .padding()
        }
        .navigationTitle("Coach")
    }

    private func sendMessage() {
        guard !inputText.isEmpty else { return }
        wsManager.sendChat(content: inputText)
        inputText = ""
    }
}

struct MessageBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.role == "user" {
                Spacer()
            }

            Text(message.content)
                .padding(12)
                .background(message.role == "user" ? Color.blue : Color.gray.opacity(0.2))
                .foregroundColor(message.role == "user" ? .white : .primary)
                .cornerRadius(16)

            if message.role == "assistant" {
                Spacer()
            }
        }
    }
}
