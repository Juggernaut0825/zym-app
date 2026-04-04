import SwiftUI

struct InboxView: View {
    @State private var conversations: [Conversation] = []
    @State private var mentions: [MentionNotificationItem] = []
    @State private var showAddMenu = false
    @State private var showAddFriend = false
    @State private var showCreateGroup = false
    @State private var showMentionsSheet = false
    @EnvironmentObject var appState: AppState

    private var unreadMentionsCount: Int {
        mentions.filter { !$0.is_read }.count
    }

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 10) {
                        ForEach(Array(conversations.enumerated()), id: \.element.id) { index, conv in
                            NavigationLink(destination: ConversationView(conversation: conv)) {
                                ConversationRow(conversation: conv)
                            }
                            .buttonStyle(.plain)
                            .zymAppear(delay: Double(index) * 0.03)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.top, 8)
                }
            }
            .navigationTitle("Chats")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: { showMentionsSheet = true }) {
                        ZStack(alignment: .topTrailing) {
                            Image(systemName: "bell")
                                .foregroundColor(Color.zymPrimary)
                            if unreadMentionsCount > 0 {
                                Text("\(min(unreadMentionsCount, 99))")
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 1)
                                    .background(Color.zymPrimary)
                                    .clipShape(Capsule())
                                    .offset(x: 9, y: -7)
                            }
                        }
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showAddMenu = true }) {
                        Image(systemName: "plus.circle.fill")
                            .foregroundColor(Color.zymPrimary)
                    }
                }
            }
            .confirmationDialog("Quick Actions", isPresented: $showAddMenu) {
                Button("Add Friend") { showAddFriend = true }
                Button("Create Group") { showCreateGroup = true }
                Button("Cancel", role: .cancel) {}
            }
            .sheet(isPresented: $showAddFriend) {
                AddFriendView(onAdd: loadInbox)
            }
            .sheet(isPresented: $showCreateGroup) {
                CreateGroupView(onCreate: loadInbox)
            }
            .sheet(isPresented: $showMentionsSheet) {
                MentionsInboxSheet(
                    mentions: mentions,
                    onRefresh: loadMentions,
                    onMarkAllRead: markMentionsRead
                )
            }
            .onAppear(perform: loadInbox)
            .onChange(of: appState.selectedCoach) { _, _ in
                loadInbox()
            }
        }
    }

    func loadInbox() {
        guard let userId = appState.userId else { return }

        let coachName = appState.selectedCoach == "lc" ? "LC Coach" : "ZJ Coach"
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
            var convs: [Conversation] = [
                Conversation(
                    id: "coach_\(userId)",
                    name: coachName,
                    isGroup: false,
                    isCoach: true,
                    coachEnabled: nil,
                    avatarUrl: nil,
                    otherUserId: nil,
                    unreadCount: inboxResponse?.coach?.unread_count ?? 0,
                    mentionCount: inboxResponse?.coach?.mention_count ?? 0
                )
            ]

            let dms = inboxResponse?.dms ?? []
            let groups = inboxResponse?.groups ?? []
            let dmTopics = Set(dms.map(\.topic))

            for dm in dms {
                convs.append(
                    Conversation(
                        id: dm.topic,
                        name: dm.username ?? "User \(dm.other_user_id)",
                        isGroup: false,
                        isCoach: false,
                        coachEnabled: nil,
                        avatarUrl: dm.avatar_url,
                        otherUserId: Int(dm.other_user_id),
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
                        coachEnabled: nil,
                        avatarUrl: friend.avatar_url,
                        otherUserId: friend.id,
                        unreadCount: 0,
                        mentionCount: 0
                    )
                )
            }

            for group in groups {
                convs.append(
                    Conversation(
                        id: group.topic,
                        name: group.name,
                        isGroup: true,
                        isCoach: false,
                        coachEnabled: group.coach_enabled,
                        avatarUrl: nil,
                        otherUserId: nil,
                        unreadCount: group.unread_count ?? 0,
                        mentionCount: group.mention_count ?? 0
                    )
                )
            }

            conversations = convs
            loadMentions()
        }
    }

    func loadMentions() {
        guard let userId = appState.userId,
              let url = apiURL("/notifications/mentions/\(userId)") else { return }
        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            guard let data = data,
                  let response = try? JSONDecoder().decode(MentionsInboxResponse.self, from: data) else { return }
            DispatchQueue.main.async {
                mentions = response.mentions
            }
        }.resume()
    }

    func markMentionsRead() {
        guard let userId = appState.userId,
              let url = apiURL("/notifications/mentions/read") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["userId": userId])

        authorizedDataTask(appState: appState, request: request) { _, _, _ in
            DispatchQueue.main.async {
                mentions = mentions.map { item in
                    var copy = item
                    copy.is_read = true
                    return copy
                }
            }
        }.resume()
    }
}

struct ConversationRow: View {
    let conversation: Conversation
    @EnvironmentObject var appState: AppState

    var body: some View {
        HStack(spacing: 12) {
            if let avatar = conversation.avatarUrl, let url = resolveRemoteURL(avatar) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        Circle()
                            .fill(conversation.isCoach ? Color.zymCoachAccent(appState.selectedCoach) : Color.zymSurfaceSoft)
                    }
                }
                .frame(width: 46, height: 46)
                .clipShape(Circle())
                .overlay(
                    Circle()
                        .stroke(Color.zymLine, lineWidth: 1)
                )
            } else {
                Circle()
                    .fill(conversation.isCoach ? Color.zymCoachAccent(appState.selectedCoach) : Color.zymSurfaceSoft)
                    .frame(width: 46, height: 46)
                    .overlay(
                        Text(conversation.isCoach ? (appState.selectedCoach == "lc" ? "LC" : "ZJ") : (conversation.isGroup ? "GR" : "DM"))
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(conversation.isCoach ? .white : Color.zymPrimaryDark)
                    )
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(conversation.name)
                    .foregroundColor(Color.zymText)
                    .font(.custom("Syne", size: 16))
                    .fontWeight(.semibold)

                Text(conversation.isCoach ? "AI Coach" : (conversation.isGroup ? "Group chat" : "Direct message"))
                    .foregroundColor(Color.zymSubtext)
                    .font(.system(size: 12))
                if conversation.isGroup {
                    Text((conversation.coachEnabled == "none") ? "Coach disabled" : "Coach available via @coach")
                        .foregroundColor(Color.zymSubtext.opacity(0.9))
                        .font(.system(size: 11))
                }
            }
            Spacer()

            if conversation.mentionCount > 0 {
                Text("@\(conversation.mentionCount)")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background(Color.zymSecondaryDark)
                    .clipShape(Capsule())
            }

            if conversation.unreadCount > 0 {
                Text("\(min(conversation.unreadCount, 99))")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background(Color.zymPrimary)
                    .clipShape(Capsule())
            }

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
    let coachEnabled: String?
    let avatarUrl: String?
    let otherUserId: Int?
    let unreadCount: Int
    let mentionCount: Int
}

struct InboxResponse: Codable {
    let coach: InboxCoach?
    let dms: [DMConv]
    let groups: [GroupConv]
}

struct InboxCoach: Codable {
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
    let unread_count: Int?
    let mention_count: Int?
}

struct GroupConv: Codable {
    let id: Int
    let topic: String
    let name: String
    let last_message_at: String?
    let coach_enabled: String?
    let unread_count: Int?
    let mention_count: Int?
}

private func buildP2PTopic(_ userA: Int, _ userB: Int) -> String {
    let left = min(userA, userB)
    let right = max(userA, userB)
    return "p2p_\(left)_\(right)"
}

struct MentionNotificationItem: Codable, Identifiable {
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

struct MentionsInboxResponse: Codable {
    let mentions: [MentionNotificationItem]
}

struct MentionsInboxSheet: View {
    let mentions: [MentionNotificationItem]
    let onRefresh: () -> Void
    let onMarkAllRead: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 8) {
                        if mentions.isEmpty {
                            Text("No mentions yet.")
                                .foregroundColor(Color.zymSubtext)
                                .font(.system(size: 13))
                                .padding(.top, 20)
                        }

                        ForEach(mentions) { mention in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(mention.actor_username ?? "Someone")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(Color.zymText)
                                    Spacer()
                                    Text(String(mention.created_at.prefix(16)))
                                        .font(.system(size: 11))
                                        .foregroundColor(Color.zymSubtext)
                                }
                                Text(mention.snippet)
                                    .font(.system(size: 13))
                                    .foregroundColor(Color.zymText)
                                    .lineLimit(3)
                            }
                            .zymCard()
                        }
                    }
                    .padding(14)
                }
            }
            .navigationTitle("Mentions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Refresh") { onRefresh() }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Mark Read") { onMarkAllRead() }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
