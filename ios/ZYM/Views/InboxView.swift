import SwiftUI

struct InboxView: View {
    @State private var conversations: [Conversation] = []
    @State private var selectedConversation: Conversation?
    @State private var showRequestedConversation = false
    @State private var showAddMenu = false
    @State private var showAddFriend = false
    @State private var showCreateGroup = false
    @State private var showAddCoach = false
    @State private var showConnectionsSheet = false
    @StateObject private var wsManager = WebSocketManager()
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack(alignment: .top) {
                            InboxHeaderIconButton(symbol: "magnifyingglass") {
                                showAddMenu = false
                                showConnectionsSheet = true
                            }

                            Spacer(minLength: 16)

                            VStack(alignment: .trailing, spacing: 8) {
                                InboxHeaderIconButton(
                                    symbol: "plus",
                                    rotation: showAddMenu ? 45 : 0
                                ) {
                                    withAnimation(.spring(response: 0.26, dampingFraction: 0.84)) {
                                        showAddMenu.toggle()
                                    }
                                }

                                if showAddMenu {
                                    QuickActionMenu {
                                        withAnimation(.spring(response: 0.26, dampingFraction: 0.84)) {
                                            showAddMenu = false
                                        }
                                        showAddFriend = true
                                    } onCreateGroup: {
                                        withAnimation(.spring(response: 0.26, dampingFraction: 0.84)) {
                                            showAddMenu = false
                                        }
                                        showCreateGroup = true
                                    } onAddCoach: {
                                        withAnimation(.spring(response: 0.26, dampingFraction: 0.84)) {
                                            showAddMenu = false
                                        }
                                        showAddCoach = true
                                    }
                                    .transition(
                                        .opacity
                                            .combined(with: .move(edge: .top))
                                            .combined(with: .scale(scale: 0.96, anchor: .topTrailing))
                                    )
                                }
                            }
                        }
                        .frame(maxWidth: .infinity)

                        Text("Chats")
                            .font(.system(size: 34, weight: .bold))
                            .foregroundColor(Color.zymText)
                            .padding(.top, showAddMenu ? 2 : 0)

                        VStack(spacing: 10) {
                            ForEach(Array(conversations.enumerated()), id: \.element.id) { index, conv in
                                NavigationLink(destination: ConversationView(conversation: conv)) {
                                    ConversationRow(conversation: conv)
                                }
                                .buttonStyle(.plain)
                                .zymAppear(delay: Double(index) * 0.03)
                            }
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.top, 8)
                    .padding(.bottom, 20)
                }
            }
            .navigationBarHidden(true)
            .background(
                NavigationLink(
                    isActive: $showRequestedConversation,
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
            .sheet(isPresented: $showConnectionsSheet) {
                FriendsView()
                    .environmentObject(appState)
            }
            .sheet(isPresented: $showAddFriend) {
                AddFriendView(onAdd: loadInbox)
                    .environmentObject(appState)
            }
            .sheet(isPresented: $showCreateGroup) {
                CreateGroupView(onCreate: loadInbox)
                    .environmentObject(appState)
            }
            .sheet(isPresented: $showAddCoach) {
                AddCoachView(
                    enabledCoachIds: conversations.compactMap { $0.isCoach ? $0.coachId : nil },
                    onChanged: loadInbox
                )
                .environmentObject(appState)
            }
            .onAppear {
                loadInbox()
                connectRealtime()
            }
            .onDisappear {
                wsManager.disconnect()
            }
            .onChange(of: appState.selectedCoach) { _, _ in
                loadInbox()
            }
            .onChange(of: appState.token) { _, token in
                guard let token, !token.isEmpty else {
                    wsManager.disconnect()
                    return
                }
                wsManager.connect(token: token)
            }
            .onChange(of: appState.requestedConversationTopic) { _, topic in
                guard let topic, !topic.isEmpty else { return }
                guard let conversation = conversations.first(where: { $0.id == topic }) else { return }
                selectedConversation = conversation
                showRequestedConversation = true
                appState.requestedConversationTopic = nil
            }
        }
    }

    private func connectRealtime() {
        guard let token = appState.token, !token.isEmpty else { return }

        wsManager.onEvent = { event in
            switch event {
            case .authSuccess:
                loadInbox()
            case .authFailed:
                appState.logout()
            case .inboxUpdated, .friendsUpdated:
                loadInbox()
            default:
                break
            }
        }

        wsManager.connect(token: token)
    }

    func loadInbox() {
        guard let userId = appState.userId else { return }

        guard let inboxURL = apiURL("/messages/inbox/\(userId)") else { return }
        let friendsURL = apiURL("/friends/\(userId)")

        let group = DispatchGroup()
        var inboxResponse: InboxResponse?
        var friendsResponse: FriendsResponse?

        group.enter()
        var inboxRequest = URLRequest(url: inboxURL)
        applyAuthorizationHeader(&inboxRequest, token: appState.token)
        authorizedDataTask(appState: appState, request: inboxRequest) { data, _, _ in
            defer { group.leave() }
            guard let data = data,
                  let response = try? JSONDecoder().decode(InboxResponse.self, from: data) else { return }
            inboxResponse = response
        }.resume()

        if let friendsURL {
            group.enter()
            var friendsRequest = URLRequest(url: friendsURL)
            applyAuthorizationHeader(&friendsRequest, token: appState.token)
            authorizedDataTask(appState: appState, request: friendsRequest) { data, _, _ in
                defer { group.leave() }
                guard let data = data,
                      let response = try? JSONDecoder().decode(FriendsResponse.self, from: data) else { return }
                friendsResponse = response
            }.resume()
        }

        group.notify(queue: .main) {
            var convs: [Conversation] = (inboxResponse?.coaches ?? []).map { coach in
                Conversation(
                    id: coach.topic,
                    name: coach.coach_name ?? (coach.coach_id == "lc" ? "LC Coach" : "ZJ Coach"),
                    isGroup: false,
                    isCoach: true,
                    coachId: coach.coach_id,
                    coachEnabled: nil,
                        avatarUrl: nil,
                        otherUserId: nil,
                        previewText: coach.last_message_preview?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                            ? (coach.last_message_preview ?? "")
                            : "Ask about training, meals, or form.",
                        unreadCount: coach.unread_count ?? 0,
                        mentionCount: coach.mention_count ?? 0
                    )
            }

            let dms = inboxResponse?.dms ?? []
            let groups = inboxResponse?.groups ?? []
            let dmTopics = Set(dms.map(\.topic))

            for dm in dms {
                let preview = dm.last_message_preview?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                    ? (dm.last_message_preview ?? "")
                    : "Start chatting"
                convs.append(
                    Conversation(
                        id: dm.topic,
                        name: dm.username ?? "User \(dm.other_user_id)",
                        isGroup: false,
                        isCoach: false,
                        coachId: nil,
                        coachEnabled: nil,
                        avatarUrl: dm.avatar_url,
                        otherUserId: Int(dm.other_user_id),
                        previewText: preview,
                        unreadCount: dm.unread_count ?? 0,
                        mentionCount: dm.mention_count ?? 0
                    )
                )
            }

            for friend in friendsResponse?.friends ?? [] {
                let topic = buildP2PTopic(userId, friend.id)
                if dmTopics.contains(topic) {
                    continue
                }
                convs.append(
                    Conversation(
                        id: topic,
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
                )
            }

            for group in groups {
                let preview = group.last_message_preview?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                    ? (group.last_message_preview ?? "")
                    : ((group.coach_enabled == "none") ? "Coach disabled" : "Mention @coach to bring AI into the chat")
                convs.append(
                    Conversation(
                        id: group.topic,
                        name: group.name,
                        isGroup: true,
                        isCoach: false,
                        coachId: nil,
                        coachEnabled: group.coach_enabled,
                        avatarUrl: nil,
                        otherUserId: nil,
                        previewText: preview,
                        unreadCount: group.unread_count ?? 0,
                        mentionCount: group.mention_count ?? 0
                    )
                )
            }

            conversations = convs
            if let requestedTopic = appState.requestedConversationTopic,
               let conversation = convs.first(where: { $0.id == requestedTopic }) {
                selectedConversation = conversation
                showRequestedConversation = true
                appState.requestedConversationTopic = nil
            }
        }
    }
}

private struct InboxHeaderIconButton: View {
    let symbol: String
    var rotation: Double = 0
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .fill(Color.white.opacity(0.94))
                    .frame(width: 56, height: 56)
                    .shadow(color: Color.black.opacity(0.08), radius: 16, x: 0, y: 8)

                Image(systemName: symbol)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(Color.zymPrimary)
                    .rotationEffect(.degrees(rotation))
            }
        }
        .buttonStyle(.plain)
    }
}

private struct QuickActionMenu: View {
    let onAddFriend: () -> Void
    let onCreateGroup: () -> Void
    let onAddCoach: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            QuickActionMenuRow(
                title: "Add Friend",
                systemImage: "person.badge.plus",
                action: onAddFriend
            )

            Divider()
                .overlay(Color.white.opacity(0.14))
                .padding(.leading, 48)

            QuickActionMenuRow(
                title: "Create Group",
                systemImage: "message.badge",
                action: onCreateGroup
            )

            Divider()
                .overlay(Color.white.opacity(0.14))
                .padding(.leading, 48)

            QuickActionMenuRow(
                title: "Add Coach",
                systemImage: "sparkles",
                action: onAddCoach
            )
        }
        .frame(width: 212)
        .background(Color.black.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: Color.black.opacity(0.18), radius: 18, x: 0, y: 10)
    }
}

private struct QuickActionMenuRow: View {
    let title: String
    let systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: systemImage)
                    .font(.system(size: 18, weight: .semibold))
                    .frame(width: 20)

                Text(title)
                    .font(.system(size: 17, weight: .semibold))

                Spacer(minLength: 0)
            }
            .foregroundColor(.white)
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
    }
}

struct ConversationRow: View {
    let conversation: Conversation

    private var totalUnreadCount: Int {
        max(0, conversation.unreadCount + conversation.mentionCount)
    }

    private var avatarLabel: String {
        if conversation.isCoach {
            return (conversation.coachId ?? "zj").uppercased()
        }
        let trimmed = conversation.name.trimmingCharacters(in: .whitespacesAndNewlines)
        let tokens = trimmed.split(separator: " ").prefix(2)
        let initials = tokens.map { String($0.prefix(1)).uppercased() }.joined()
        if !initials.isEmpty {
            return initials
        }
        return String(trimmed.prefix(1)).uppercased()
    }

    var body: some View {
        HStack(spacing: 12) {
            ZStack(alignment: .topTrailing) {
                if conversation.isCoach {
                    CoachAvatar(coach: conversation.coachId ?? "zj", state: .idle, size: 50)
                        .frame(width: 50, height: 50)
                } else if let avatar = conversation.avatarUrl, let url = resolveRemoteURL(avatar) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .scaledToFill()
                        default:
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(conversation.isCoach ? Color.zymCoachAccent(conversation.coachId) : Color.zymSurfaceSoft)
                        }
                    }
                    .frame(width: 50, height: 50)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                } else {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(conversation.isCoach ? Color.zymCoachAccent(conversation.coachId) : Color.zymSurfaceSoft)
                        .frame(width: 50, height: 50)
                        .overlay(
                            Text(avatarLabel)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(conversation.isCoach ? .white : Color.zymPrimaryDark)
                        )
                }

                if totalUnreadCount > 0 {
                    Text(totalUnreadCount > 99 ? "99+" : "\(totalUnreadCount)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, totalUnreadCount > 9 ? 6 : 5)
                        .padding(.vertical, 3)
                        .background(Color.red)
                        .clipShape(Capsule())
                        .offset(x: 8, y: -7)
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(conversation.name)
                    .foregroundColor(Color.zymText)
                    .font(.custom("Syne", size: 16))
                    .fontWeight(.semibold)
                    .lineLimit(1)

                Text(conversation.previewText)
                    .foregroundColor(Color.zymSubtext)
                    .font(.system(size: 13))
                    .lineLimit(1)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Color.zymSubtext)
        }
        .zymCard()
    }
}

struct Conversation: Identifiable {
    let id: String
    let name: String
    let isGroup: Bool
    let isCoach: Bool
    let coachId: String?
    let coachEnabled: String?
    let avatarUrl: String?
    let otherUserId: Int?
    let previewText: String
    let unreadCount: Int
    let mentionCount: Int
}

struct InboxResponse: Codable {
    let coach: InboxCoach?
    let coaches: [InboxCoach]?
    let dms: [DMConv]
    let groups: [GroupConv]
}

struct InboxCoach: Codable {
    let coach_id: String
    let coach_name: String?
    let topic: String
    let last_message_at: String?
    let last_message_preview: String?
    let unread_count: Int?
    let mention_count: Int?
}

struct DMConv: Codable {
    let topic: String
    let other_user_id: String
    let username: String?
    let avatar_url: String?
    let last_message_at: String?
    let last_message_preview: String?
    let unread_count: Int?
    let mention_count: Int?
}

struct GroupConv: Codable {
    let id: Int
    let topic: String
    let name: String
    let last_message_at: String?
    let last_message_preview: String?
    let coach_enabled: String?
    let unread_count: Int?
    let mention_count: Int?
}

private func buildP2PTopic(_ userA: Int, _ userB: Int) -> String {
    let left = min(userA, userB)
    let right = max(userA, userB)
    return "p2p_\(left)_\(right)"
}

private struct CoachCatalogCard: Identifiable {
    let id: String
    let title: String
    let badge: String
    let description: String
}

private struct EnableCoachResponse: Codable {
    let success: Bool
    let coach: String?
    let selectedCoach: String?
    let enabledCoaches: [String]?
}

struct AddCoachView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState

    let enabledCoachIds: [String]
    let onChanged: () -> Void

    @State private var pendingCoachId: String?
    @State private var statusText = ""

    private let coaches: [CoachCatalogCard] = [
        CoachCatalogCard(
            id: "zj",
            title: "ZJ Coach",
            badge: "Encouraging",
            description: "Supportive, steady, and momentum-focused."
        ),
        CoachCatalogCard(
            id: "lc",
            title: "LC Coach",
            badge: "Strict",
            description: "Direct, structured, and accountability-first."
        ),
    ]

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Enable a coach chat. Each coach keeps a separate conversation history while your profile, meals, and training records stay shared.")
                            .font(.system(size: 14))
                            .foregroundColor(Color.zymSubtext)

                        ForEach(coaches) { coach in
                            let isEnabled = enabledCoachIds.contains(coach.id)

                            HStack(alignment: .top, spacing: 12) {
                                CoachAvatar(coach: coach.id, state: isEnabled ? .selected : .idle, size: 52)
                                    .frame(width: 52, height: 52)

                                VStack(alignment: .leading, spacing: 6) {
                                    HStack(spacing: 8) {
                                        Text(coach.title)
                                            .font(.custom("Syne", size: 20))
                                            .foregroundColor(Color.zymText)

                                        Text(coach.badge.uppercased())
                                            .font(.system(size: 10, weight: .bold))
                                            .tracking(1.2)
                                            .foregroundColor(Color.zymSubtext)
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 6)
                                            .background(Color.white.opacity(0.78))
                                            .clipShape(Capsule())
                                    }

                                    Text(coach.description)
                                        .font(.system(size: 13))
                                        .foregroundColor(Color.zymSubtext)

                                    Button {
                                        if isEnabled {
                                            onChanged()
                                            dismiss()
                                        } else {
                                            enableCoach(coach.id)
                                        }
                                    } label: {
                                        Text(buttonTitle(for: coach.id, isEnabled: isEnabled))
                                            .frame(maxWidth: .infinity)
                                    }
                                    .buttonStyle(ZYMPrimaryButton())
                                    .disabled(pendingCoachId != nil)
                                }
                            }
                            .padding(16)
                            .background(Color.white.opacity(0.88))
                            .overlay(
                                RoundedRectangle(cornerRadius: 20, style: .continuous)
                                    .stroke(Color.zymLine, lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                        }

                        if !statusText.isEmpty {
                            Text(statusText)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Color.zymSubtext)
                        }
                    }
                    .padding(18)
                }
            }
            .navigationTitle("Add Coach")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") { dismiss() }
                        .foregroundColor(Color.zymSubtext)
                }
            }
        }
    }

    private func buttonTitle(for coachId: String, isEnabled: Bool) -> String {
        if pendingCoachId == coachId {
            return "Adding..."
        }
        return isEnabled ? "Open In Chats" : "Interact"
    }

    private func enableCoach(_ coachId: String) {
        guard pendingCoachId == nil,
              let userId = appState.userId,
              let url = apiURL("/coach/enable") else { return }

        pendingCoachId = coachId
        statusText = ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
            "coach": coachId,
        ])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                defer { pendingCoachId = nil }

                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard statusCode >= 200 && statusCode < 300 else {
                    statusText = parseAPIErrorMessage(from: data) ?? "Failed to add coach."
                    return
                }

                if let data,
                   let decoded = try? JSONDecoder().decode(EnableCoachResponse.self, from: data),
                   let selectedCoach = decoded.selectedCoach,
                   !selectedCoach.isEmpty {
                    appState.selectedCoach = selectedCoach
                }

                onChanged()
                dismiss()
            }
        }.resume()
    }
}
