import SwiftUI
import AVFoundation
import CoreImage.CIFilterBuiltins
import UIKit

private func nearbyDistanceText(_ distance: Double) -> String {
    if distance < 1 {
        return "\(max(100, Int((distance * 1000).rounded()))) m"
    }
    return distance >= 10 ? "\(Int(distance.rounded())) km" : String(format: "%.1f km", distance)
}

private func nearbyStatusTitle(_ status: String) -> String {
    switch friendshipStatus(from: status) {
    case .accepted:
        return "Friends"
    case .incomingPending:
        return "Accept"
    case .outgoingPending, .pending:
        return "Pending"
    case .currentUser:
        return "You"
    default:
        return "Add"
    }
}

private struct NearbyAvatarTile: View {
    let user: NearbyUserPayload
    let onTap: () -> Void

    var body: some View {
        Button {
            onTap()
        } label: {
            VStack(spacing: 8) {
                if let avatarURL = user.avatar_url, let url = resolveRemoteURL(avatarURL) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .scaledToFill()
                        default:
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(Color.zymSurfaceSoft)
                        }
                    }
                    .frame(width: 64, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                } else {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(Color.zymSurfaceSoft)
                        .frame(width: 64, height: 64)
                        .overlay(
                            Text(String(user.username.prefix(1)).uppercased())
                                .font(.system(size: 18, weight: .bold))
                                .foregroundColor(Color.zymPrimaryDark)
                        )
                }

                VStack(spacing: 2) {
                    Text(user.username)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Color.zymText)
                        .lineLimit(1)
                    Text(nearbyDistanceText(user.distance_km))
                        .font(.system(size: 10))
                        .foregroundColor(Color.zymSubtext)
                }
                .frame(width: 68)
            }
        }
        .buttonStyle(.plain)
    }
}

struct FriendsView: View {
    @State private var friends: [Friend] = []
    @State private var requests: [Friend] = []
    @State private var searchQuery = ""
    @State private var searchResults: [Friend] = []
    @State private var searchPending = false
    @State private var searchStatusText = ""
    @State private var searchSequence = 0
    @State private var selectedConversation: Conversation?
    @State private var showConversation = false
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 14) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Search People")
                                .foregroundColor(Color.zymText)
                                .font(.custom("Syne", size: 20))

                            TextField("Search people by username", text: $searchQuery)
                                .zymFieldStyle()
                                .textInputAutocapitalization(.never)
                                .disableAutocorrection(true)

                            if searchPending {
                                Text("Searching usernames...")
                                    .foregroundColor(Color.zymSubtext)
                                    .font(.system(size: 12, weight: .medium))
                            } else if !searchStatusText.isEmpty {
                                Text(searchStatusText)
                                    .foregroundColor(Color.zymSubtext)
                                    .font(.system(size: 12, weight: .medium))
                            }

                            ForEach(Array(searchResults.enumerated()), id: \.element.id) { index, friend in
                                FriendSearchResultRow(friend: friend) {
                                    sendFriendRequest(to: friend.id)
                                }
                                .zymAppear(delay: Double(index) * 0.02)
                            }
                        }
                        .padding(.horizontal, 14)

                        if !requests.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Friend Requests")
                                    .foregroundColor(Color.zymText)
                                    .font(.custom("Syne", size: 20))

                                ForEach(Array(requests.enumerated()), id: \.element.id) { index, friend in
                                    FriendRequestRow(friend: friend, onAccept: { acceptFriend(friend.id) })
                                        .zymAppear(delay: Double(index) * 0.02)
                                }
                            }
                            .padding(.horizontal, 14)
                        }

                        VStack(alignment: .leading, spacing: 10) {
                            Text("Friends")
                                .foregroundColor(Color.zymText)
                                .font(.custom("Syne", size: 20))

                            if friends.isEmpty {
                                Text("No friends yet")
                                    .foregroundColor(Color.zymSubtext)
                                    .font(.system(size: 13))
                                    .padding(10)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .zymCard()
                            }

                            ForEach(Array(friends.enumerated()), id: \.element.id) { index, friend in
                                FriendRow(friend: friend, onDM: { openDM(with: friend) })
                                    .zymAppear(delay: Double(index) * 0.02)
                            }
                        }
                        .padding(.horizontal, 14)
                    }
                    .padding(.top, 8)
                }
            }
            .navigationTitle("Friends")
            .background(
                NavigationLink(
                    isActive: $showConversation,
                    destination: {
                        if let selectedConversation {
                            ConversationView(conversation: selectedConversation)
                                .environmentObject(appState)
                        } else {
                            EmptyView()
                        }
                    },
                    label: { EmptyView() }
                )
                .hidden()
            )
            .onAppear(perform: loadFriends)
            .onChange(of: searchQuery) { _, value in
                scheduleSearch(for: value)
            }
        }
    }

    func loadFriends() {
        guard let userId = appState.userId else { return }

        if let url = apiURL("/friends/\(userId)") {
            var request = URLRequest(url: url)
            applyAuthorizationHeader(&request, token: appState.token)
            authorizedDataTask(appState: appState, request: request) { data, _, _ in
                guard let data = data,
                      let response = try? JSONDecoder().decode(FriendsResponse.self, from: data) else { return }
                DispatchQueue.main.async {
                    friends = response.friends
                }
            }.resume()
        }

        if let url = apiURL("/friends/requests/\(userId)") {
            var request = URLRequest(url: url)
            applyAuthorizationHeader(&request, token: appState.token)
            authorizedDataTask(appState: appState, request: request) { data, _, _ in
                guard let data = data,
                      let response = try? JSONDecoder().decode(RequestsResponse.self, from: data) else { return }
                DispatchQueue.main.async {
                    requests = response.requests
                }
            }.resume()
        }
    }

    func acceptFriend(_ friendId: Int) {
        guard let userId = appState.userId,
              let url = apiURL("/friends/accept") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        let body = ["userId": userId, "friendId": friendId]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        authorizedDataTask(appState: appState, request: request) { _, _, _ in
            DispatchQueue.main.async {
                loadFriends()
            }
        }.resume()
    }

    func sendFriendRequest(to friendId: Int, dismissAfterAdd: Bool = true) {
        guard let userId = appState.userId,
              let url = apiURL("/friends/add") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
            "friendId": friendId,
        ])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                if statusCode < 200 || statusCode >= 300 {
                    if let data = data,
                       let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let message = payload["error"] as? String {
                        searchStatusText = message
                    } else {
                        searchStatusText = "Failed to send request."
                    }
                    return
                }
                searchStatusText = "Friend request sent."
                searchQuery = ""
                searchResults = []
                loadFriends()
            }
        }.resume()
    }

    func openDM(with friend: Friend) {
        guard let userId = appState.userId,
              let url = apiURL("/messages/open-dm") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
            "otherUserId": friend.id,
        ])

        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            guard let data = data,
                  let payload = try? JSONDecoder().decode(DMOpenResponse.self, from: data) else { return }
            DispatchQueue.main.async {
                selectedConversation = Conversation(
                    id: payload.topic,
                    name: friend.username,
                    isGroup: false,
                    isCoach: false,
                    coachId: nil,
                    coachEnabled: nil,
                    avatarUrl: friend.avatar_url,
                    otherUserId: friend.id,
                    previewText: "Start chatting",
                    unreadCount: 0,
                    mentionCount: 0
                )
                showConversation = true
            }
        }.resume()
    }

    func scheduleSearch(for rawValue: String) {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        searchSequence += 1
        let currentSequence = searchSequence

        guard trimmed.count >= 2 else {
            searchPending = false
            searchResults = []
            searchStatusText = trimmed.isEmpty ? "" : "Type at least 2 characters."
            return
        }

        searchPending = true
        searchStatusText = ""

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.24) {
            guard currentSequence == searchSequence else { return }
            searchUsers(query: trimmed, sequence: currentSequence)
        }
    }

    func searchUsers(query: String, sequence: Int) {
        guard let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = apiURL("/users/search?q=\(encoded)") else {
            DispatchQueue.main.async {
                searchPending = false
                searchResults = []
                searchStatusText = "Search is unavailable right now."
            }
            return
        }

        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            guard sequence == searchSequence else { return }
            DispatchQueue.main.async {
                searchPending = false
                guard let data = data,
                      let response = try? JSONDecoder().decode(UserSearchResponse.self, from: data) else {
                    searchResults = []
                    searchStatusText = "Failed to search users."
                    return
                }

                let ownUserId = appState.userId ?? -1
                searchResults = response.users.filter { $0.id != ownUserId }
                searchStatusText = searchResults.isEmpty ? "No matching users." : ""
            }
        }.resume()
    }
}

struct FriendSearchResultRow: View {
    let friend: Friend
    let onAdd: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(Color.zymSurfaceSoft)
                .frame(width: 38, height: 38)
                .overlay(
                    Text(String(friend.username.prefix(2)).uppercased())
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color.zymPrimary)
                )

            Text(friend.username)
                .foregroundColor(Color.zymText)
                .font(.system(size: 15, weight: .semibold))

            Spacer()

            Button("Add") { onAdd() }
                .buttonStyle(ZYMPrimaryButton())
        }
        .zymCard()
    }
}

struct FriendRow: View {
    let friend: Friend
    let onDM: (() -> Void)?

    init(friend: Friend, onDM: (() -> Void)? = nil) {
        self.friend = friend
        self.onDM = onDM
    }

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(Color.zymSurfaceSoft)
                .frame(width: 38, height: 38)
                .overlay(
                    Text(String(friend.username.prefix(2)).uppercased())
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color.zymPrimary)
                )
            Text(friend.username)
                .foregroundColor(Color.zymText)
                .font(.system(size: 15, weight: .semibold))
            Spacer()
            if let onDM {
                Button("DM") {
                    onDM()
                }
                .buttonStyle(ZYMGhostButton())
            }
        }
        .zymCard()
    }
}

struct FriendRequestRow: View {
    let friend: Friend
    let onAccept: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(Color.zymSurfaceSoft)
                .frame(width: 38, height: 38)
                .overlay(
                    Text(String(friend.username.prefix(2)).uppercased())
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color.zymPrimary)
                )

            Text(friend.username)
                .foregroundColor(Color.zymText)
                .font(.system(size: 15, weight: .semibold))
            Spacer()
            Button("Accept") { onAccept() }
                .buttonStyle(ZYMPrimaryButton())
        }
        .zymCard()
    }
}

struct AddFriendView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var appState: AppState
    @State private var username = ""
    @State private var usernameSearchResults: [Friend] = []
    @State private var usernameSearchPending = false
    @State private var usernameSearchSequence = 0
    @State private var identifier = ""
    @State private var connectCode = ""
    @State private var connectId = ""
    @State private var connectExpiresAt: Date?
    @State private var statusText = ""
    @State private var pending = false
    @State private var showQRCodeFullscreen = false
    @State private var showQRScanner = false
    @State private var sharedLocation: StoredUserLocationPayload?
    @State private var nearbyUsers: [NearbyUserPayload] = []
    @State private var requests: [Friend] = []
    @State private var nearbyLoading = false
    @State private var nearbyLocationSheetOpen = false
    @State private var nearbyStatusText = ""
    @State private var profileConversation: Conversation?
    @State private var viewedProfile: ConversationPublicProfileResponse?
    @State private var profileLoading = false
    @State private var profileReportPending = false
    @State private var profileActionPending = false
    @StateObject private var locationCoordinator = AppLocationPermissionCoordinator()
    private let refreshTimer = Timer.publish(every: 55, on: .main, in: .common).autoconnect()
    private let nearbyRefreshTimer = Timer.publish(every: 15, on: .main, in: .common).autoconnect()
    let onAdd: () -> Void

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Your account ID: \(appState.userId ?? 0)")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(Color.zymSubtext)

                        if !connectId.isEmpty {
                            Text("Your connect ID: \(connectId)")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(Color.zymText)
                        }

                        if let qrImage = makeQRCodeImage(from: connectCode) {
                            Button {
                                showQRCodeFullscreen = true
                            } label: {
                                VStack(spacing: 8) {
                                    Image(uiImage: qrImage)
                                        .resizable()
                                        .interpolation(.none)
                                        .scaledToFit()
                                        .frame(width: 164, height: 164)
                                        .padding(8)
                                        .background(Color.white)
                                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                                    Text("Tap QR to open full screen")
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundColor(Color.zymSubtext)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                                .zymCard()
                            }
                            .buttonStyle(.plain)
                        }

                        if !connectCode.isEmpty {
                            Text(connectCode)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Color.zymPrimary)
                                .lineLimit(1)
                                .truncationMode(.middle)
                        }

                        if !connectCodeMeta.isEmpty {
                            Text(connectCodeMeta)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Color.zymSubtext)
                        }

                        HStack(spacing: 8) {
                            Button("Scan QR") {
                                showQRScanner = true
                            }
                            .buttonStyle(ZYMGhostButton())

                            Button("Copy Connect Code") {
                                if !connectCode.isEmpty {
                                    UIPasteboard.general.string = connectCode
                                    statusText = "Connect code copied."
                                }
                            }
                            .buttonStyle(ZYMGhostButton())
                            .disabled(connectCode.isEmpty)

                            Button("Refresh") { loadConnectCode() }
                                .buttonStyle(ZYMGhostButton())
                        }

                        VStack(alignment: .leading, spacing: 10) {
                            HStack(alignment: .center, spacing: 10) {
                                VStack(alignment: .leading, spacing: 6) {
                                    HStack(spacing: 8) {
                                        Text("Nearby")
                                            .font(.custom("Syne", size: 18))
                                            .foregroundColor(Color.zymText)
                                        Button(action: { loadNearbyUsers() }) {
                                            Image(systemName: "arrow.clockwise")
                                                .font(.system(size: 13, weight: .semibold))
                                                .foregroundColor(Color.zymSubtext)
                                                .rotationEffect(.degrees(nearbyLoading ? 180 : 0))
                                        }
                                        .buttonStyle(.plain)
                                        .disabled(nearbyLoading || sharedLocation == nil)
                                    }
                                    Text(sharedLocation?.label ?? "Location off")
                                        .font(.system(size: 12))
                                        .foregroundColor(Color.zymSubtext)
                                }

                                Spacer()

                                Button(sharedLocation == nil ? "Enable" : "Manage") {
                                    nearbyLocationSheetOpen = true
                                }
                                .buttonStyle(ZYMGhostButton())
                            }

                            if sharedLocation == nil {
                                Text("No nearby users")
                                    .font(.system(size: 13))
                                    .foregroundColor(Color.zymSubtext)
                            } else if nearbyUsers.isEmpty && !nearbyLoading {
                                Text("No nearby users")
                                    .font(.system(size: 13))
                                    .foregroundColor(Color.zymSubtext)
                            } else {
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 10) {
                                        ForEach(Array(nearbyUsers.prefix(8))) { user in
                                            NearbyAvatarTile(user: user) {
                                                openNearbyProfile(user)
                                            }
                                        }
                                    }
                                }
                            }

                            if !nearbyStatusText.isEmpty {
                                Text(nearbyStatusText)
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(Color.zymPrimary)
                            }
                        }
                        .zymCard()

                        if !requests.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Pending Invitations")
                                    .font(.custom("Syne", size: 18))
                                    .foregroundColor(Color.zymText)

                                ForEach(requests, id: \.id) { friend in
                                    FriendRequestRow(friend: friend) {
                                        acceptIncomingRequest(friend.id)
                                    }
                                }
                            }
                        }

                        Text("Add by user ID or connect code")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(Color.zymSubtext)

                        TextField("e.g. 102 or zym://add-friend?uid=102", text: $identifier)
                            .zymFieldStyle()

                        Button(pending ? "Working..." : "Send Request") {
                            addFriend()
                        }
                        .buttonStyle(ZYMPrimaryButton())
                        .disabled(pending)

                        Text("Or invite by username")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(Color.zymSubtext)

                        TextField("Search username", text: $username)
                            .zymFieldStyle()
                            .textInputAutocapitalization(.never)
                            .disableAutocorrection(true)

                        if usernameSearchPending {
                            Text("Searching usernames...")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Color.zymSubtext)
                        }

                        ForEach(usernameSearchResults, id: \.id) { friend in
                            FriendSearchResultRow(friend: friend) {
                                sendFriendRequest(to: friend.id)
                            }
                        }

                        if !statusText.isEmpty {
                            Text(statusText)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Color.zymSubtext)
                        }
                    }
                    .padding(18)
                    .padding(.bottom, 24)
                }
            }
            .navigationTitle("Add Friend")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(Color.zymSubtext)
                }
            }
        }
        .onAppear {
            loadConnectCode()
            loadStoredLocation()
            loadNearbyUsers()
            loadPendingRequests()
        }
        .onReceive(refreshTimer) { _ in
            loadConnectCode(silent: true)
        }
        .onReceive(nearbyRefreshTimer) { _ in
            guard sharedLocation != nil else { return }
            loadNearbyUsers()
        }
        .onChange(of: username) { _, value in
            scheduleUsernameSearch(for: value)
        }
        .sheet(isPresented: $showQRScanner) {
            NavigationView {
                QRCodeScannerView { scannedCode in
                    identifier = scannedCode
                    showQRScanner = false
                    statusText = "Scanned code detected. Tap Send Request to add."
                } onFailure: { errorMessage in
                    statusText = errorMessage
                }
                .ignoresSafeArea()
                .navigationTitle("Scan Connect QR")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Done") { showQRScanner = false }
                            .foregroundColor(Color.zymPrimary)
                    }
                }
            }
        }
        .fullScreenCover(isPresented: $showQRCodeFullscreen) {
            ConnectQRCodeFullscreenView(
                connectId: connectId,
                connectCode: connectCode,
                expiresAt: connectExpiresAt,
                onRefresh: { loadConnectCode() }
            )
        }
        .sheet(isPresented: $nearbyLocationSheetOpen) {
            NearbyLocationSheet(
                initialLocation: sharedLocation,
                onSaved: { location in
                    sharedLocation = location
                    nearbyStatusText = location == nil ? "" : "Updated."
                    loadNearbyUsers()
                },
                onDisabled: {
                    sharedLocation = nil
                    nearbyUsers = []
                    nearbyStatusText = "Location off."
                },
                locationCoordinator: locationCoordinator
            )
            .environmentObject(appState)
        }
        .sheet(item: $profileConversation) { profileConversation in
            ConversationProfileSheet(
                conversation: profileConversation,
                appCoach: appState.selectedCoach ?? "zj",
                profile: viewedProfile,
                loading: profileLoading,
                primaryActionLabel: profilePrimaryActionLabel(),
                primaryActionEnabled: profilePrimaryActionEnabled(),
                primaryActionPending: profileActionPending,
                onPrimaryAction: {
                    handleProfilePrimaryAction()
                },
                canReportUser: true,
                reportPending: profileReportPending,
                onReportUser: { reportNearbyProfileUser(conversation: profileConversation) }
            )
        }
    }

    func sendFriendRequest(to friendId: Int, dismissAfterAdd: Bool = true) {
        guard let userId = appState.userId,
              let url = apiURL("/friends/add") else { return }

        pending = true
        statusText = ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
            "friendId": friendId,
        ])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                pending = false
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                if statusCode < 200 || statusCode >= 300 {
                    if let data = data,
                       let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let message = payload["error"] as? String {
                        statusText = message
                    } else {
                        statusText = "Failed to send request."
                    }
                    return
                }
                applyNearbyStatus(friendId: friendId, status: "outgoing_pending")
                onAdd()
                loadPendingRequests()
                if dismissAfterAdd {
                    dismiss()
                } else {
                    nearbyStatusText = "Friend request sent."
                }
            }
        }.resume()
    }

    func addFriend() {
        guard let userId = appState.userId,
              let url = apiURL("/friends/add") else { return }

        pending = true
        statusText = ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)

        let trimmedUsername = username.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedIdentifier = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        var body: [String: Any] = ["userId": userId]
        if isLikelyConnectCode(trimmedIdentifier) {
            body["connectCode"] = trimmedIdentifier
        } else if let friendId = parseIdentifier(trimmedIdentifier) {
            body["friendId"] = friendId
        } else if !trimmedUsername.isEmpty {
            body["username"] = trimmedUsername
        } else {
            pending = false
            statusText = "Enter a user ID, connect code, or username."
            return
        }
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                pending = false
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                if statusCode < 200 || statusCode >= 300 {
                    if let data = data,
                       let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let message = payload["error"] as? String {
                        statusText = message
                    } else {
                        statusText = "Failed to send request."
                    }
                    return
                }
                onAdd()
                loadPendingRequests()
                dismiss()
            }
        }.resume()
    }

    func loadPendingRequests() {
        guard let userId = appState.userId,
              let url = apiURL("/friends/requests/\(userId)") else { return }
        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            guard let data = data,
                  let response = try? JSONDecoder().decode(RequestsResponse.self, from: data) else { return }
            DispatchQueue.main.async {
                requests = response.requests
            }
        }.resume()
    }

    func acceptIncomingRequest(_ friendId: Int) {
        guard let userId = appState.userId,
              let url = apiURL("/friends/accept") else { return }

        pending = true
        statusText = ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
            "friendId": friendId,
        ])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                pending = false
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard statusCode >= 200 && statusCode < 300 else {
                    statusText = parseAPIError(data) ?? "Failed to accept invitation."
                    return
                }
                requests.removeAll { $0.id == friendId }
                applyNearbyStatus(friendId: friendId, status: "accepted")
                loadNearbyUsers()
                loadPendingRequests()
                onAdd()
                statusText = "Invitation accepted."
            }
        }.resume()
    }

    func scheduleUsernameSearch(for rawValue: String) {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        usernameSearchSequence += 1
        let currentSequence = usernameSearchSequence

        guard trimmed.count >= 2 else {
            usernameSearchPending = false
            usernameSearchResults = []
            return
        }

        usernameSearchPending = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.24) {
            guard currentSequence == usernameSearchSequence else { return }
            searchUsers(query: trimmed, sequence: currentSequence)
        }
    }

    func searchUsers(query: String, sequence: Int) {
        guard let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = apiURL("/users/search?q=\(encoded)") else {
            DispatchQueue.main.async {
                usernameSearchPending = false
                usernameSearchResults = []
            }
            return
        }

        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            guard sequence == usernameSearchSequence else { return }
            DispatchQueue.main.async {
                usernameSearchPending = false
                guard let data = data,
                      let response = try? JSONDecoder().decode(UserSearchResponse.self, from: data) else {
                    usernameSearchResults = []
                    return
                }
                let ownUserId = appState.userId ?? -1
                usernameSearchResults = response.users.filter { $0.id != ownUserId }
            }
        }.resume()
    }

    var connectCodeMeta: String {
        guard let expiresAt = connectExpiresAt else {
            return "Secure connect QR rotates every minute."
        }
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return "Secure connect QR rotates every minute. Current token expires at \(formatter.string(from: expiresAt))."
    }

    func loadConnectCode(silent: Bool = false) {
        guard let userId = appState.userId,
              let url = apiURL("/friends/connect/\(userId)") else { return }
        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            guard let data = data,
                  let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let code = payload["connectCode"] as? String else {
                if !silent {
                    DispatchQueue.main.async {
                        statusText = "Failed to refresh connect code."
                    }
                }
                return
            }
            DispatchQueue.main.async {
                connectCode = code
                connectId = String(payload["connectId"] as? String ?? "")
                if connectId.isEmpty, let connectIdInt = payload["connectId"] as? Int {
                    connectId = String(connectIdInt)
                }
                connectExpiresAt = parseISODate(payload["expiresAt"] as? String)
            }
        }.resume()
    }

    func loadStoredLocation() {
        guard let userId = appState.userId,
              let url = apiURL("/location/profile/\(userId)") else { return }
        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            guard let data = data,
                  let response = try? JSONDecoder().decode(StoredLocationResponse.self, from: data) else { return }
            DispatchQueue.main.async {
                sharedLocation = response.location
            }
        }.resume()
    }

    func loadNearbyUsers() {
        guard let userId = appState.userId,
              let url = apiURL("/location/nearby/\(userId)") else { return }
        nearbyLoading = true
        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            DispatchQueue.main.async {
                nearbyLoading = false
            }
            guard let data = data,
                  let response = try? JSONDecoder().decode(NearbyUsersResponse.self, from: data) else { return }
            DispatchQueue.main.async {
                nearbyUsers = response.users
            }
        }.resume()
    }

    func applyNearbyStatus(friendId: Int, status: String) {
        guard let index = nearbyUsers.firstIndex(where: { $0.id == friendId }) else { return }
        nearbyUsers[index].friendship_status = status
    }

    func openNearbyProfile(_ user: NearbyUserPayload) {
        profileConversation = Conversation(
            id: "user_\(user.id)",
            name: user.username,
            isGroup: false,
            isCoach: false,
            coachId: nil,
            coachEnabled: nil,
            avatarUrl: user.avatar_url,
            otherUserId: user.id,
            previewText: "",
            unreadCount: 0,
            mentionCount: 0
        )
        viewedProfile = nil
        profileLoading = true

        guard let url = apiURL("/profile/public/\(user.id)") else {
            profileLoading = false
            return
        }

        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            defer {
                DispatchQueue.main.async {
                    profileLoading = false
                }
            }

            guard let data = data,
                  let response = try? JSONDecoder().decode(ConversationPublicProfileResponse.self, from: data) else { return }
            DispatchQueue.main.async {
                viewedProfile = response
            }
        }.resume()
    }

    func profilePrimaryActionLabel() -> String? {
        guard let profile = viewedProfile else { return nil }
        return friendshipPrimaryActionLabel(
            status: profile.friendship_status,
            targetUserId: profile.profile.id,
            currentUserId: appState.userId
        )
    }

    func profilePrimaryActionEnabled() -> Bool {
        guard let profile = viewedProfile else { return false }
        return friendshipPrimaryActionEnabled(
            status: profile.friendship_status,
            targetUserId: profile.profile.id,
            currentUserId: appState.userId,
            pending: profileActionPending
        )
    }

    func handleProfilePrimaryAction() {
        guard let profile = viewedProfile else { return }
        switch friendshipStatus(from: profile.friendship_status) {
        case .accepted:
            openDirectMessageFromProfile(targetUserId: profile.profile.id)
        case .none:
            sendFriendRequestFromProfile(targetUserId: profile.profile.id)
        case .incomingPending:
            acceptFriendRequestFromProfile(targetUserId: profile.profile.id)
        default:
            break
        }
    }

    func openDirectMessageFromProfile(targetUserId: Int) {
        guard !profileActionPending,
              let userId = appState.userId,
              let url = apiURL("/messages/open-dm") else { return }

        profileActionPending = true
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
            "otherUserId": targetUserId,
        ])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                profileActionPending = false
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard statusCode >= 200 && statusCode < 300,
                      let data = data,
                      let payload = try? JSONDecoder().decode(DMOpenResponse.self, from: data) else {
                    nearbyStatusText = "Failed to open chat."
                    return
                }
                appState.requestedTabIndex = 0
                appState.requestedConversationTopic = payload.topic
                profileConversation = nil
                dismiss()
            }
        }.resume()
    }

    func sendFriendRequestFromProfile(targetUserId: Int) {
        guard !profileActionPending,
              let userId = appState.userId,
              let url = apiURL("/friends/add") else { return }

        profileActionPending = true
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
            "friendId": targetUserId,
        ])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                profileActionPending = false
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard statusCode >= 200 && statusCode < 300 else {
                    nearbyStatusText = "Failed to send request."
                    return
                }
                applyNearbyStatus(friendId: targetUserId, status: "outgoing_pending")
                if let profile = viewedProfile {
                    viewedProfile = ConversationPublicProfileResponse(
                        visibility: profile.visibility,
                        isFriend: profile.isFriend,
                        friendship_status: "outgoing_pending",
                        profile: profile.profile,
                        today_health: profile.today_health,
                        recent_posts: profile.recent_posts
                    )
                }
                nearbyStatusText = "Friend request sent."
            }
        }.resume()
    }

    func acceptFriendRequestFromProfile(targetUserId: Int) {
        guard !profileActionPending,
              let userId = appState.userId,
              let url = apiURL("/friends/accept") else { return }

        profileActionPending = true
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
            "friendId": targetUserId,
        ])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                profileActionPending = false
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard statusCode >= 200 && statusCode < 300 else {
                    nearbyStatusText = parseAPIError(data) ?? "Failed to accept invitation."
                    return
                }
                applyNearbyStatus(friendId: targetUserId, status: "accepted")
                if let profile = viewedProfile {
                    viewedProfile = ConversationPublicProfileResponse(
                        visibility: profile.visibility,
                        isFriend: true,
                        friendship_status: "accepted",
                        profile: profile.profile,
                        today_health: profile.today_health,
                        recent_posts: profile.recent_posts
                    )
                }
                onAdd()
                nearbyStatusText = "Invitation accepted."
            }
        }.resume()
    }

    func reportNearbyProfileUser(conversation: Conversation) {
        guard !profileReportPending,
              let reporterUserId = appState.userId,
              let targetUserId = viewedProfile?.profile.id ?? conversation.otherUserId,
              let url = apiURL("/moderation/report") else { return }

        profileReportPending = true
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": reporterUserId,
            "targetType": "user",
            "targetId": targetUserId,
            "reason": "inappropriate_behavior",
            "details": "Reported from iOS nearby profile"
        ])

        authorizedDataTask(appState: appState, request: request) { _, response, _ in
            DispatchQueue.main.async {
                profileReportPending = false
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                nearbyStatusText = (200...299).contains(statusCode) ? "Report submitted." : "Failed to report user."
            }
        }.resume()
    }

    func parseIdentifier(_ value: String) -> Int? {
        if let raw = Int(value), raw > 0 {
            return raw
        }
        if let url = URL(string: value),
           let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let uid = components.queryItems?.first(where: { $0.name.lowercased() == "uid" || $0.name.lowercased() == "userid" })?.value,
           let parsed = Int(uid),
           parsed > 0 {
            return parsed
        }
        return nil
    }

    func isLikelyConnectCode(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.range(of: #"^\d{6}$"#, options: .regularExpression) != nil {
            return true
        }
        let lowered = trimmed.lowercased()
        return lowered.contains("zym://add-friend")
            || lowered.contains("connectid=")
            || lowered.contains("token=")
    }

    func parseISODate(_ raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        let withFractional = ISO8601DateFormatter()
        withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFractional.date(from: raw) {
            return date
        }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: raw)
    }
}

struct Friend: Identifiable, Codable {
    let id: Int
    let username: String
    let avatar_url: String?
}

struct FriendsResponse: Codable {
    let friends: [Friend]
}

struct RequestsResponse: Codable {
    let requests: [Friend]
}

struct UserSearchResponse: Codable {
    let users: [Friend]
}

struct DMOpenResponse: Codable {
    let topic: String
}

func makeQRCodeImage(from payload: String) -> UIImage? {
    guard !payload.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    let context = CIContext()
    let filter = CIFilter.qrCodeGenerator()
    filter.setValue(Data(payload.utf8), forKey: "inputMessage")
    filter.setValue("M", forKey: "inputCorrectionLevel")
    guard let outputImage = filter.outputImage else { return nil }
    let transformed = outputImage.transformed(by: CGAffineTransform(scaleX: 11, y: 11))
    guard let cgImage = context.createCGImage(transformed, from: transformed.extent) else { return nil }
    return UIImage(cgImage: cgImage)
}

struct ConnectQRCodeFullscreenView: View {
    @Environment(\.dismiss) private var dismiss
    let connectId: String
    let connectCode: String
    let expiresAt: Date?
    let onRefresh: () -> Void

    var body: some View {
        ZStack {
            ZYMBackgroundLayer().ignoresSafeArea()

            VStack(spacing: 16) {
                HStack {
                    Spacer()
                    Button("Close") { dismiss() }
                        .foregroundColor(Color.zymPrimary)
                        .font(.system(size: 16, weight: .semibold))
                }

                Text("Connect QR")
                    .font(.custom("Syne", size: 26))
                    .foregroundColor(Color.zymText)

                if !connectId.isEmpty {
                    Text("Connect ID: \(connectId)")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Color.zymText)
                }

                if let qrImage = makeQRCodeImage(from: connectCode) {
                    Image(uiImage: qrImage)
                        .resizable()
                        .interpolation(.none)
                        .scaledToFit()
                        .frame(width: 320, height: 320)
                        .padding(14)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .shadow(color: Color.black.opacity(0.08), radius: 18, x: 0, y: 10)
                }

                if let expiresAt {
                    Text("Expires at \(formattedTime(expiresAt))")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Color.zymSubtext)
                } else {
                    Text("Secure token rotates every minute.")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Color.zymSubtext)
                }

                HStack(spacing: 12) {
                    Button("Copy Code") {
                        UIPasteboard.general.string = connectCode
                    }
                    .buttonStyle(ZYMGhostButton())

                    Button("Refresh") { onRefresh() }
                        .buttonStyle(ZYMGhostButton())
                }

                Spacer()
            }
            .padding(20)
        }
    }

    private func formattedTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

final class QRCodeScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onScanned: ((String) -> Void)?
    var onFailure: ((String) -> Void)?

    private let captureSession = AVCaptureSession()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var isConfigured = false
    private var hasEmittedResult = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureIfNeeded()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if isConfigured && !captureSession.isRunning {
            captureSession.startRunning()
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if captureSession.isRunning {
            captureSession.stopRunning()
        }
    }

    private func configureIfNeeded() {
        guard !isConfigured else { return }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configureSession()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    guard let self else { return }
                    if granted {
                        self.configureSession()
                    } else {
                        self.onFailure?("Camera permission is required to scan QR.")
                    }
                }
            }
        default:
            onFailure?("Camera permission is denied. Enable it in iOS Settings.")
        }
    }

    private func configureSession() {
        guard let videoDevice = AVCaptureDevice.default(for: .video) else {
            onFailure?("No camera available on this device.")
            return
        }

        do {
            let input = try AVCaptureDeviceInput(device: videoDevice)
            guard captureSession.canAddInput(input) else {
                onFailure?("Unable to access camera input.")
                return
            }
            captureSession.addInput(input)

            let metadataOutput = AVCaptureMetadataOutput()
            guard captureSession.canAddOutput(metadataOutput) else {
                onFailure?("Unable to scan QR on this device.")
                return
            }
            captureSession.addOutput(metadataOutput)
            metadataOutput.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
            metadataOutput.metadataObjectTypes = [.qr]

            let preview = AVCaptureVideoPreviewLayer(session: captureSession)
            preview.videoGravity = .resizeAspectFill
            preview.frame = view.layer.bounds
            view.layer.insertSublayer(preview, at: 0)
            previewLayer = preview

            isConfigured = true
            captureSession.startRunning()
        } catch {
            onFailure?("Failed to initialize camera scanner.")
        }
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard !hasEmittedResult,
              let metadataObject = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              metadataObject.type == .qr,
              let value = metadataObject.stringValue else {
            return
        }

        hasEmittedResult = true
        captureSession.stopRunning()
        onScanned?(value)
    }
}

struct QRCodeScannerView: UIViewControllerRepresentable {
    let onScanned: (String) -> Void
    let onFailure: (String) -> Void

    func makeUIViewController(context: Context) -> QRCodeScannerViewController {
        let controller = QRCodeScannerViewController()
        controller.onScanned = onScanned
        controller.onFailure = onFailure
        return controller
    }

    func updateUIViewController(_ uiViewController: QRCodeScannerViewController, context: Context) {}
}
