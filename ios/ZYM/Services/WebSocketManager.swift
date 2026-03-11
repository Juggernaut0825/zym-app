import Foundation

struct SocketChatMessage: Codable {
    let id: Int
    let topic: String?
    let from_user_id: Int
    let content: String?
    let created_at: String?
    let username: String?
    let media_urls: [String]?
    let is_coach: Bool?
}

struct LegacyWSMessage: Identifiable {
    let id = UUID()
    let role: String
    let content: String
}

enum SocketEvent {
    case authSuccess(userId: Int)
    case authFailed
    case subscribed(topic: String)
    case messageCreated(topic: String, message: SocketChatMessage)
    case typing(topic: String, userId: String, isTyping: Bool)
    case inboxUpdated
    case error(message: String)
}

final class WebSocketManager: NSObject, ObservableObject, URLSessionWebSocketDelegate {
    private var session: URLSession?
    private var webSocket: URLSessionWebSocketTask?
    private var authToken: String?
    private var shouldReconnect = false
    private var isAuthenticated = false
    private var subscribedTopics = Set<String>()

    // Legacy compatibility for old chat screens.
    @Published var messages: [LegacyWSMessage] = []
    var onMessage: ((String) -> Void)?

    // Current API event callback.
    var onEvent: ((SocketEvent) -> Void)?

    func connect(token: String) {
        let existingTopics = subscribedTopics
        disconnect()
        subscribedTopics = existingTopics
        guard let url = websocketURL() else { return }

        authToken = token
        shouldReconnect = true
        isAuthenticated = false

        session = URLSession(configuration: .default, delegate: self, delegateQueue: OperationQueue())
        webSocket = session?.webSocketTask(with: url)
        webSocket?.resume()
        receiveLoop()
    }

    func disconnect() {
        shouldReconnect = false
        isAuthenticated = false
        authToken = nil
        subscribedTopics.removeAll()
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        session = nil
    }

    func subscribe(topic: String) {
        subscribedTopics.insert(topic)
        if isAuthenticated {
            sendRaw(["type": "subscribe", "topic": topic])
        }
    }

    func unsubscribe(topic: String) {
        subscribedTopics.remove(topic)
        sendRaw(["type": "unsubscribe", "topic": topic])
    }

    func sendTyping(topic: String, isTyping: Bool) {
        sendRaw(["type": "typing", "topic": topic, "isTyping": isTyping])
    }

    func sendMessage(topic: String, content: String, mediaUrls: [String] = [], mediaIds: [String] = []) {
        var payload: [String: Any] = [
            "type": "send_message",
            "topic": topic,
            "content": content
        ]
        if !mediaUrls.isEmpty {
            payload["mediaUrls"] = mediaUrls
        }
        if !mediaIds.isEmpty {
            payload["mediaIds"] = mediaIds
        }
        sendRaw(payload)
    }

    // Legacy compatibility.
    func sendMessage(_ content: String) {
        sendRaw(["type": "chat", "content": content])
    }

    // Legacy compatibility.
    func sendChat(content: String) {
        sendMessage(content)
    }

    private func authenticate() {
        guard let token = authToken, !token.isEmpty else { return }
        sendRaw(["type": "auth", "token": token])
    }

    private func resubscribeAllTopics() {
        for topic in subscribedTopics {
            sendRaw(["type": "subscribe", "topic": topic])
        }
    }

    private func sendRaw(_ payload: [String: Any]) {
        guard let webSocket, webSocket.state == .running else { return }
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let text = String(data: data, encoding: .utf8) else { return }
        webSocket.send(.string(text)) { _ in }
    }

    private func receiveLoop() {
        webSocket?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let message):
                if case .string(let text) = message {
                    self.handleIncomingText(text)
                }
                self.receiveLoop()
            case .failure:
                self.scheduleReconnect()
            }
        }
    }

    private func handleIncomingText(_ text: String) {
        guard let data = text.data(using: .utf8),
              let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = payload["type"] as? String else {
            return
        }

        switch type {
        case "auth_success":
            isAuthenticated = true
            resubscribeAllTopics()
            let userId = payload["userId"] as? Int ?? 0
            DispatchQueue.main.async {
                self.onEvent?(.authSuccess(userId: userId))
            }

        case "auth_failed":
            isAuthenticated = false
            shouldReconnect = false
            authToken = nil
            webSocket?.cancel(with: .normalClosure, reason: nil)
            DispatchQueue.main.async {
                self.onEvent?(.authFailed)
            }

        case "subscribed":
            let topic = payload["topic"] as? String ?? ""
            DispatchQueue.main.async {
                self.onEvent?(.subscribed(topic: topic))
            }

        case "message_created":
            let topic = payload["topic"] as? String ?? ""
            if let messagePayload = payload["message"] as? [String: Any],
               let messageData = try? JSONSerialization.data(withJSONObject: messagePayload),
               let message = try? JSONDecoder().decode(SocketChatMessage.self, from: messageData) {
                DispatchQueue.main.async {
                    self.onEvent?(.messageCreated(topic: topic, message: message))
                    if let content = message.content, !(message.is_coach ?? false) {
                        self.messages.append(LegacyWSMessage(role: "user", content: content))
                    } else if let content = message.content {
                        self.messages.append(LegacyWSMessage(role: "assistant", content: content))
                    }
                }
            }

        case "typing":
            let topic = payload["topic"] as? String ?? ""
            let userId = String(describing: payload["userId"] ?? "")
            let isTyping = payload["isTyping"] as? Bool ?? false
            DispatchQueue.main.async {
                self.onEvent?(.typing(topic: topic, userId: userId, isTyping: isTyping))
            }

        case "inbox_updated":
            DispatchQueue.main.async {
                self.onEvent?(.inboxUpdated)
            }

        case "chat_response":
            if let content = payload["content"] as? String {
                DispatchQueue.main.async {
                    self.messages.append(LegacyWSMessage(role: "assistant", content: content))
                    self.onMessage?(content)
                }
            }

        case "error":
            let message = payload["message"] as? String ?? "Socket error"
            DispatchQueue.main.async {
                self.onEvent?(.error(message: message))
            }

        default:
            break
        }
    }

    private func scheduleReconnect() {
        guard shouldReconnect, let token = authToken else { return }
        isAuthenticated = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            guard let self, self.shouldReconnect else { return }
            self.connect(token: token)
        }
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        authenticate()
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        scheduleReconnect()
    }
}
