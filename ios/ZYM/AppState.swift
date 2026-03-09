import SwiftUI
import Foundation

private let fallbackAPIBaseURL = "http://localhost:3001"
private let fallbackWSBaseURL = "ws://localhost:8080"

func apiURL(_ path: String) -> URL? {
    let configuredBase = (ProcessInfo.processInfo.environment["ZYM_API_BASE_URL"] ?? fallbackAPIBaseURL)
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let normalizedPath = path.hasPrefix("/") ? path : "/\(path)"
    return URL(string: "\(configuredBase)\(normalizedPath)")
}

func websocketURL() -> URL? {
    let configured = (ProcessInfo.processInfo.environment["ZYM_WS_URL"] ?? fallbackWSBaseURL)
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    return URL(string: configured)
}

func applyAuthorizationHeader(_ request: inout URLRequest, token: String?) {
    guard let token, !token.isEmpty else { return }
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
}

class AppState: ObservableObject {
    @Published var isLoggedIn = false
    @Published var token: String?
    @Published var userId: Int?
    @Published var username: String?
    @Published var selectedCoach: String?

    func logout() {
        isLoggedIn = false
        token = nil
        userId = nil
        username = nil
        selectedCoach = nil
    }
}
