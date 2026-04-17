import SwiftUI
import Foundation
import Security
import CoreLocation

private let fallbackAPIBaseURL = "http://localhost:3001"
private let fallbackWSBaseURL = "ws://localhost:8080"

func apiBaseURLString() -> String {
    (ProcessInfo.processInfo.environment["ZYM_API_BASE_URL"] ?? fallbackAPIBaseURL)
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
}

func apiURL(_ path: String) -> URL? {
    let configuredBase = apiBaseURLString()
    let normalizedPath = path.hasPrefix("/") ? path : "/\(path)"
    return URL(string: "\(configuredBase)\(normalizedPath)")
}

func resolveRemoteURL(_ raw: String?) -> URL? {
    let value = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if value.isEmpty { return nil }
    if value.hasPrefix("http://") || value.hasPrefix("https://") {
        return URL(string: value)
    }
    if value.hasPrefix("/") {
        return URL(string: "\(apiBaseURLString())\(value)")
    }
    return URL(string: "\(apiBaseURLString())/\(value)")
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

func authorizedDataTask(
    appState: AppState,
    request: URLRequest,
    retryOnUnauthorized: Bool = true,
    completion: @escaping (Data?, URLResponse?, Error?) -> Void
) -> URLSessionDataTask {
    var preparedRequest = request
    applyAuthorizationHeader(&preparedRequest, token: appState.token)

    let task = URLSession.shared.dataTask(with: preparedRequest) { data, response, error in
        if retryOnUnauthorized,
           let httpResponse = response as? HTTPURLResponse,
           httpResponse.statusCode == 401 {
            appState.refreshAccessToken { success in
                guard success else {
                    completion(data, response, error)
                    return
                }

                var retryRequest = request
                applyAuthorizationHeader(&retryRequest, token: appState.token)
                URLSession.shared.dataTask(with: retryRequest) { retryData, retryResponse, retryError in
                    completion(retryData, retryResponse, retryError)
                }.resume()
            }
            return
        }

        completion(data, response, error)
    }

    return task
}

func authorizedDataTask(
    appState: AppState,
    request: URLRequest,
    retryOnUnauthorized: Bool = true
) -> URLSessionDataTask {
    authorizedDataTask(
        appState: appState,
        request: request,
        retryOnUnauthorized: retryOnUnauthorized
    ) { _, _, _ in }
}

struct MentionNotificationPayload: Codable, Identifiable {
    let id: Int
    let topic: String?
    let message_id: Int?
    let source_type: String
    let source_id: Int
    let snippet: String
    var is_read: Bool
    let created_at: String
    let actor_user_id: Int?
    let actor_username: String?
}

struct MentionNotificationsResponse: Codable {
    let mentions: [MentionNotificationPayload]
}

struct SharedLocationSelectionPayload: Codable, Equatable {
    let label: String
    let city: String
    let latitude: Double
    let longitude: Double
    let precision: String
}

struct StoredUserLocationPayload: Codable, Equatable {
    let label: String
    let city: String
    let latitude: Double
    let longitude: Double
    let precision: String
    let shared: Bool
    let updated_at: String?
}

struct StoredLocationResponse: Codable {
    let location: StoredUserLocationPayload?
}

struct LocationSearchResponse: Codable {
    let results: [SharedLocationSelectionPayload]
}

struct LocationReverseResponse: Codable {
    let city: SharedLocationSelectionPayload?
    let precise: SharedLocationSelectionPayload?
}

struct NearbyUserPayload: Codable, Identifiable {
    let id: Int
    let public_uuid: String?
    let username: String
    let avatar_url: String?
    let bio: String?
    let fitness_goal: String?
    let friendship_status: String
    let location_label: String
    let location_city: String
    let distance_km: Double
}

struct NearbyUsersResponse: Codable {
    let users: [NearbyUserPayload]
}

enum AppLocationPermissionError: LocalizedError {
    case denied
    case unavailable

    var errorDescription: String? {
        switch self {
        case .denied:
            return "Location permission was denied."
        case .unavailable:
            return "Unable to determine your location right now."
        }
    }
}

final class AppLocationPermissionCoordinator: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var pendingCompletion: ((Result<CLLocationCoordinate2D, Error>) -> Void)?

    override init() {
        super.init()
        manager.delegate = self
    }

    func requestCurrentCoordinate(precise: Bool, completion: @escaping (Result<CLLocationCoordinate2D, Error>) -> Void) {
        pendingCompletion = completion
        manager.desiredAccuracy = precise ? kCLLocationAccuracyNearestTenMeters : kCLLocationAccuracyThreeKilometers

        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.requestLocation()
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            pendingCompletion = nil
            completion(.failure(AppLocationPermissionError.denied))
        @unknown default:
            pendingCompletion = nil
            completion(.failure(AppLocationPermissionError.unavailable))
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.requestLocation()
        case .denied, .restricted:
            let completion = pendingCompletion
            pendingCompletion = nil
            completion?(.failure(AppLocationPermissionError.denied))
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let coordinate = locations.last?.coordinate else {
            let completion = pendingCompletion
            pendingCompletion = nil
            completion?(.failure(AppLocationPermissionError.unavailable))
            return
        }
        let completion = pendingCompletion
        pendingCompletion = nil
        completion?(.success(coordinate))
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let completion = pendingCompletion
        pendingCompletion = nil
        completion?(.failure(error))
    }
}

private enum AppKeychain {
    static let service = "com.zym.app.auth"

    static func set(_ value: String, account: String) {
        guard let data = value.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]

        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecSuccess { return }
        if status == errSecItemNotFound {
            var newItem = query
            newItem[kSecValueData as String] = data
            newItem[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(newItem as CFDictionary, nil)
        }
    }

    static func get(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess,
              let data = item as? Data,
              let value = String(data: data, encoding: .utf8),
              !value.isEmpty else {
            return nil
        }
        return value
    }

    static func delete(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

class AppState: ObservableObject {
    private enum Keys {
        static let isLoggedIn = "zym.isLoggedIn"
        static let token = "zym.token"
        static let refreshToken = "zym.refreshToken"
        static let userId = "zym.userId"
        static let username = "zym.username"
        static let selectedCoach = "zym.selectedCoach"
        static let timezone = "zym.timezone"
    }

    private var restoring = false
    private var refreshInFlight = false
    private var refreshCompletions: [(Bool) -> Void] = []
    private let keychainTokenAccount = "access-token"
    private let keychainRefreshTokenAccount = "refresh-token"

    @Published var isLoggedIn = false {
        didSet { persistSessionIfNeeded() }
    }

    @Published var token: String? {
        didSet { persistSessionIfNeeded() }
    }

    @Published var refreshToken: String? {
        didSet { persistSessionIfNeeded() }
    }

    @Published var userId: Int? {
        didSet { persistSessionIfNeeded() }
    }

    @Published var username: String? {
        didSet { persistSessionIfNeeded() }
    }

    @Published var selectedCoach: String? {
        didSet { persistSessionIfNeeded() }
    }

    @Published var timezone: String? {
        didSet { persistSessionIfNeeded() }
    }

    @Published var requestedTabIndex: Int?

    init() {
        restoreSession()
    }

    func logout() {
        isLoggedIn = false
        token = nil
        refreshToken = nil
        userId = nil
        username = nil
        selectedCoach = nil
        timezone = nil
    }

    func refreshAccessToken(completion: @escaping (Bool) -> Void) {
        DispatchQueue.main.async {
            self.refreshCompletions.append(completion)
            if self.refreshInFlight { return }

            guard self.isLoggedIn,
                  let refreshToken = self.refreshToken,
                  !refreshToken.isEmpty,
                  let url = apiURL("/auth/refresh") else {
                self.finishRefresh(success: false, shouldLogout: false)
                return
            }

            self.refreshInFlight = true

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONSerialization.data(withJSONObject: [
                "refreshToken": refreshToken,
                "timezone": TimeZone.current.identifier,
            ])

            URLSession.shared.dataTask(with: request) { data, response, _ in
                var nextToken: String?
                var nextRefreshToken: String?
                var nextSelectedCoach: String?
                var nextTimezone: String?
                var shouldLogout = false

                if let http = response as? HTTPURLResponse {
                    if http.statusCode == 401 || http.statusCode == 403 {
                        shouldLogout = true
                    } else if (200...299).contains(http.statusCode),
                              let data,
                              let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                              let tokenValue = payload["token"] as? String,
                              !tokenValue.isEmpty {
                        nextToken = tokenValue
                        if let refreshed = payload["refreshToken"] as? String, !refreshed.isEmpty {
                            nextRefreshToken = refreshed
                        }
                        if let selectedCoach = payload["selectedCoach"] as? String, !selectedCoach.isEmpty {
                            nextSelectedCoach = selectedCoach
                        }
                        if let timezone = payload["timezone"] as? String, !timezone.isEmpty {
                            nextTimezone = timezone
                        }
                    }
                }

                DispatchQueue.main.async {
                    if let nextToken {
                        self.token = nextToken
                        if let nextRefreshToken {
                            self.refreshToken = nextRefreshToken
                        }
                        if let nextSelectedCoach {
                            self.selectedCoach = nextSelectedCoach
                        }
                        if let nextTimezone {
                            self.timezone = nextTimezone
                        }
                        self.finishRefresh(success: true, shouldLogout: false)
                        return
                    }

                    self.finishRefresh(success: false, shouldLogout: shouldLogout)
                }
            }.resume()
        }
    }

    private func restoreSession() {
        restoring = true
        defer { restoring = false }

        let defaults = UserDefaults.standard
        let legacyToken = defaults.string(forKey: Keys.token)
        let legacyRefreshToken = defaults.string(forKey: Keys.refreshToken)
        let savedToken = AppKeychain.get(account: keychainTokenAccount) ?? legacyToken
        let savedRefreshToken = AppKeychain.get(account: keychainRefreshTokenAccount) ?? legacyRefreshToken
        let savedUserId = defaults.integer(forKey: Keys.userId)
        let savedUsername = defaults.string(forKey: Keys.username)
        let savedCoach = defaults.string(forKey: Keys.selectedCoach)
        let savedTimezone = defaults.string(forKey: Keys.timezone)

        if let legacyToken, AppKeychain.get(account: keychainTokenAccount) == nil {
            AppKeychain.set(legacyToken, account: keychainTokenAccount)
        }
        if let legacyRefreshToken, AppKeychain.get(account: keychainRefreshTokenAccount) == nil {
            AppKeychain.set(legacyRefreshToken, account: keychainRefreshTokenAccount)
        }
        defaults.removeObject(forKey: Keys.token)
        defaults.removeObject(forKey: Keys.refreshToken)

        token = savedToken
        refreshToken = savedRefreshToken
        userId = savedUserId > 0 ? savedUserId : nil
        username = savedUsername
        selectedCoach = savedCoach
        timezone = savedTimezone
        isLoggedIn = (savedToken?.isEmpty == false) && (savedRefreshToken?.isEmpty == false) && (savedUserId > 0)
    }

    private func persistSessionIfNeeded() {
        if restoring { return }

        let defaults = UserDefaults.standard
        if isLoggedIn,
           let token, !token.isEmpty,
           let refreshToken, !refreshToken.isEmpty,
           let userId, userId > 0 {
            AppKeychain.set(token, account: keychainTokenAccount)
            AppKeychain.set(refreshToken, account: keychainRefreshTokenAccount)
            defaults.set(true, forKey: Keys.isLoggedIn)
            defaults.set(userId, forKey: Keys.userId)
            defaults.set(username, forKey: Keys.username)
            defaults.set(selectedCoach, forKey: Keys.selectedCoach)
            defaults.set(timezone, forKey: Keys.timezone)
            defaults.removeObject(forKey: Keys.token)
            defaults.removeObject(forKey: Keys.refreshToken)
            return
        }

        AppKeychain.delete(account: keychainTokenAccount)
        AppKeychain.delete(account: keychainRefreshTokenAccount)
        defaults.removeObject(forKey: Keys.isLoggedIn)
        defaults.removeObject(forKey: Keys.token)
        defaults.removeObject(forKey: Keys.refreshToken)
        defaults.removeObject(forKey: Keys.userId)
        defaults.removeObject(forKey: Keys.username)
        defaults.removeObject(forKey: Keys.selectedCoach)
        defaults.removeObject(forKey: Keys.timezone)
    }

    private func finishRefresh(success: Bool, shouldLogout: Bool) {
        if shouldLogout {
            logout()
        }

        refreshInFlight = false
        let completions = refreshCompletions
        refreshCompletions = []
        completions.forEach { callback in
            callback(success)
        }
    }
}
