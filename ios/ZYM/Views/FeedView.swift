import SwiftUI

private func feedExtractHashtags(from content: String?) -> [String] {
    guard let content, !content.isEmpty else { return [] }
    let nsContent = content as NSString
    let regex = try? NSRegularExpression(pattern: "#([A-Za-z0-9_]+)")
    let matches = regex?.matches(in: content, range: NSRange(location: 0, length: nsContent.length)) ?? []
    return matches.compactMap { match in
        guard match.numberOfRanges > 1 else { return nil }
        return nsContent.substring(with: match.range(at: 1)).lowercased()
    }
}

private func feedVisibilityLabel(_ visibility: String?) -> String {
    switch (visibility ?? "friends").lowercased() {
    case "public":
        return "Public"
    case "private":
        return "Only me"
    default:
        return "Friends"
    }
}

struct FeedView: View {
    @State private var posts: [Post] = []
    @State private var showCreatePost = false
    @State private var selectedPost: Post?
    @State private var reactingIds = Set<Int>()
    @State private var activityNotifications: [FeedActivityNotification] = []
    @State private var mentionNotifications: [MentionNotificationPayload] = []
    @State private var notificationsLoading = false
    @State private var notificationsOpen = false
    @State private var pendingOpenPostId: Int?
    @State private var notificationHint = ""
    @State private var profileConversation: Conversation?
    @State private var viewedProfile: ConversationPublicProfileResponse?
    @State private var profileLoading = false
    @State private var profileReportPending = false
    @State private var profileActionPending = false
    @StateObject private var wsManager = WebSocketManager()
    @EnvironmentObject var appState: AppState

    private var trendingItems: [(tag: String, count: Int)] {
        var counts: [String: Int] = [:]
        posts.forEach { post in
            guard (post.visibility ?? "friends").lowercased() == "public" else { return }
            feedExtractHashtags(from: post.content).forEach { tag in
                counts[tag, default: 0] += 1
            }
        }
        return counts
            .sorted { lhs, rhs in
                if lhs.value != rhs.value { return lhs.value > rhs.value }
                return lhs.key < rhs.key
            }
            .map { ($0.key, $0.value) }
            .prefix(8)
            .map { $0 }
    }

    private var unreadNotificationCount: Int {
        activityNotifications.filter { !$0.is_read }.count + mentionNotifications.filter { !$0.is_read }.count
    }

    private var prioritizedNotifications: [FeedUnifiedNotification] {
        let merged = activityNotifications.map { FeedUnifiedNotification(activity: $0) }
            + mentionNotifications.map { FeedUnifiedNotification(mention: $0) }

        return merged.sorted { lhs, rhs in
            if lhs.is_read != rhs.is_read {
                return !lhs.is_read && rhs.is_read
            }
            return lhs.created_at > rhs.created_at
        }
    }

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                ScrollView {
                    LazyVStack(spacing: 16) {
                        TrendingStrip(
                            items: trendingItems
                        )
                        .zymAppear(delay: 0.01)

                        ForEach(Array(posts.enumerated()), id: \.element.id) { index, post in
                            PostCard(
                                post: post,
                                isReacting: reactingIds.contains(post.id),
                                onOpen: { selectedPost = post },
                                onOpenProfile: {
                                    openPublicProfile(userId: post.user_id, username: post.username ?? "User", avatarURL: post.avatar_url)
                                },
                                onReact: { reactToPost(postId: post.id) }
                            )
                            .zymAppear(delay: Double(min(index, 8)) * 0.02)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.top, 8)
                }
                .refreshable {
                    loadFeed()
                    loadNotifications()
                }

                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        VStack(alignment: .trailing, spacing: 10) {
                            if notificationsOpen {
                                FeedNotificationFlyout(
                                    notifications: prioritizedNotifications,
                                    unreadCount: unreadNotificationCount,
                                    loading: notificationsLoading,
                                    onOpen: openNotification,
                                    onMarkAllRead: markAllNotificationsRead
                                )
                                .transition(
                                    .opacity
                                        .combined(with: .move(edge: .trailing))
                                        .combined(with: .scale(scale: 0.96, anchor: .bottomTrailing))
                                )
                            }

                            if !notificationHint.isEmpty {
                                Text(notificationHint)
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(Color.zymSubtext)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 10)
                                    .background(Color.white.opacity(0.9))
                                    .clipShape(Capsule())
                                    .shadow(color: Color.black.opacity(0.08), radius: 10, x: 0, y: 5)
                                    .transition(.opacity.combined(with: .move(edge: .trailing)))
                            }

                            HStack(spacing: 10) {
                                Button(action: {
                                    withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                                        notificationsOpen.toggle()
                                    }
                                }) {
                                    ZStack(alignment: .topTrailing) {
                                        Image(systemName: "bell")
                                            .font(.system(size: 18, weight: .semibold))
                                            .foregroundColor(Color.zymText)
                                            .frame(width: 46, height: 46)
                                            .background(Color.white.opacity(0.92))
                                            .clipShape(Circle())
                                            .shadow(color: Color.black.opacity(0.12), radius: 10, x: 0, y: 5)

                                        if unreadNotificationCount > 0 {
                                            Text("\(min(unreadNotificationCount, 9))")
                                                .font(.system(size: 10, weight: .bold))
                                                .foregroundColor(.white)
                                                .padding(.horizontal, 5)
                                                .padding(.vertical, 2)
                                                .background(Color.red)
                                                .clipShape(Capsule())
                                                .offset(x: 6, y: -4)
                                        }
                                    }
                                }

                                Button(action: { showCreatePost = true }) {
                                    Image(systemName: "plus")
                                        .font(.system(size: 18, weight: .bold))
                                        .foregroundColor(.white)
                                        .frame(width: 50, height: 50)
                                        .background(
                                            LinearGradient(colors: [Color.zymPrimary, Color.zymPrimaryDark], startPoint: .topLeading, endPoint: .bottomTrailing)
                                        )
                                        .clipShape(Circle())
                                        .shadow(color: Color.black.opacity(0.18), radius: 10, x: 0, y: 5)
                                        .scaleEffect(showCreatePost ? 0.95 : 1)
                                }
                            }
                        }
                        .padding(16)
                    }
                }
            }
            .navigationTitle("Community")
            .onAppear {
                loadFeed()
                loadNotifications()
                connectRealtime()
            }
            .onDisappear {
                wsManager.disconnect()
            }
            .onChange(of: appState.token) { _, token in
                guard let token, !token.isEmpty else {
                    wsManager.disconnect()
                    return
                }
                wsManager.connect(token: token)
            }
            .sheet(isPresented: $showCreatePost) {
                CreatePostView(onPost: loadFeed)
            }
            .sheet(item: $selectedPost) { post in
                FeedPostDetailSheet(
                    post: post,
                    isReacting: reactingIds.contains(post.id),
                    onReact: { reactToPost(postId: post.id) },
                    onVisibilitySaved: { postId, visibility in
                        if let index = posts.firstIndex(where: { $0.id == postId }) {
                            posts[index].visibility = visibility
                            if selectedPost?.id == postId {
                                selectedPost = posts[index]
                            }
                        }
                    },
                    onOpenProfile: { userId, username, avatarURL in
                        openPublicProfile(userId: userId, username: username, avatarURL: avatarURL)
                    }
                )
            }
            .sheet(item: $profileConversation) { conversation in
                ConversationProfileSheet(
                    conversation: conversation,
                    appCoach: conversation.coachId ?? appState.selectedCoach ?? "zj",
                    profile: viewedProfile,
                    loading: profileLoading,
                    primaryActionLabel: profilePrimaryActionLabel(),
                    primaryActionEnabled: profilePrimaryActionEnabled(),
                    primaryActionPending: profileActionPending,
                    onPrimaryAction: {
                        handleProfilePrimaryAction(conversation: conversation)
                    },
                    canReportUser: !conversation.isCoach && !conversation.isGroup && (conversation.otherUserId != nil),
                    reportPending: profileReportPending,
                    onReportUser: { reportPublicProfileUser(conversation: conversation) }
                )
            }
        }
    }

    func loadFeed() {
        guard let userId = appState.userId,
              let url = apiURL("/community/feed/\(userId)") else { return }
        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            guard let data = data,
                  let response = try? JSONDecoder().decode(FeedResponse.self, from: data) else { return }
            DispatchQueue.main.async {
                posts = response.feed
                if let selectedPost,
                   let refreshed = response.feed.first(where: { $0.id == selectedPost.id }) {
                    self.selectedPost = refreshed
                }
                if let pendingOpenPostId,
                   let matchingPost = response.feed.first(where: { $0.id == pendingOpenPostId }) {
                    selectedPost = matchingPost
                    self.pendingOpenPostId = nil
                }
            }
        }.resume()
    }

    func loadNotifications() {
        guard let userId = appState.userId else { return }
        notificationsLoading = true
        let group = DispatchGroup()
        var nextActivity: [FeedActivityNotification] = []
        var nextMentions: [MentionNotificationPayload] = []

        if let activityURL = apiURL("/notifications/feed/\(userId)") {
            group.enter()
            var request = URLRequest(url: activityURL)
            applyAuthorizationHeader(&request, token: appState.token)
            authorizedDataTask(appState: appState, request: request) { data, _, _ in
                defer { group.leave() }
                guard let data = data,
                      let response = try? JSONDecoder().decode(FeedActivityNotificationsResponse.self, from: data) else { return }
                nextActivity = response.notifications
            }.resume()
        }

        if let mentionURL = apiURL("/notifications/mentions/\(userId)") {
            group.enter()
            var request = URLRequest(url: mentionURL)
            applyAuthorizationHeader(&request, token: appState.token)
            authorizedDataTask(appState: appState, request: request) { data, _, _ in
                defer { group.leave() }
                guard let data = data,
                      let response = try? JSONDecoder().decode(MentionNotificationsResponse.self, from: data) else { return }
                nextMentions = response.mentions
            }.resume()
        }

        group.notify(queue: .main) {
            notificationsLoading = false
            withAnimation(.spring(response: 0.26, dampingFraction: 0.88)) {
                activityNotifications = nextActivity
                mentionNotifications = nextMentions
            }
        }
    }

    func openPublicProfile(userId: Int, username: String, avatarURL: String?) {
        guard userId > 0 else { return }
        profileConversation = Conversation(
            id: "user_\(userId)",
            name: username,
            isGroup: false,
            isCoach: false,
            coachId: nil,
            coachEnabled: nil,
            avatarUrl: avatarURL,
            otherUserId: userId,
            previewText: "",
            unreadCount: 0,
            mentionCount: 0
        )
        viewedProfile = nil
        profileLoading = true

        guard let url = apiURL("/profile/public/\(userId)") else {
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
                  let response = try? JSONDecoder().decode(ConversationPublicProfileResponse.self, from: data) else {
                return
            }

            DispatchQueue.main.async {
                viewedProfile = response
            }
        }.resume()
    }

    func reportPublicProfileUser(conversation: Conversation) {
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
            "details": "Reported from iOS feed public profile (\(conversation.id))"
        ])

        authorizedDataTask(appState: appState, request: request) { _, response, _ in
            DispatchQueue.main.async {
                profileReportPending = false
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                notificationHint = statusCode == 201
                    ? "Thanks, the report was submitted."
                    : "Failed to report this user."

                DispatchQueue.main.asyncAfter(deadline: .now() + 2.6) {
                    withAnimation(.easeOut(duration: 0.2)) {
                        notificationHint = ""
                    }
                }
            }
        }.resume()
    }

    private func profilePrimaryActionLabel() -> String? {
        guard let profile = viewedProfile else { return nil }
        return friendshipPrimaryActionLabel(
            status: profile.friendship_status,
            targetUserId: profile.profile.id,
            currentUserId: appState.userId
        )
    }

    private func profilePrimaryActionEnabled() -> Bool {
        guard let profile = viewedProfile else { return false }
        return friendshipPrimaryActionEnabled(
            status: profile.friendship_status,
            targetUserId: profile.profile.id,
            currentUserId: appState.userId,
            pending: profileActionPending
        )
    }

    private func handleProfilePrimaryAction(conversation: Conversation) {
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

    private func openDirectMessageFromProfile(targetUserId: Int) {
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
                    notificationHint = parseAPIError(data) ?? "Failed to open direct message."
                    return
                }
                appState.requestedTabIndex = 0
                appState.requestedConversationTopic = payload.topic
                profileConversation = nil
                notificationHint = "Direct message ready."
            }
        }.resume()
    }

    private func sendFriendRequestFromProfile(targetUserId: Int) {
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
                    notificationHint = parseAPIError(data) ?? "Failed to send friend request."
                    return
                }
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
                notificationHint = "Friend request sent."
            }
        }.resume()
    }

    private func acceptFriendRequestFromProfile(targetUserId: Int) {
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
                    notificationHint = parseAPIError(data) ?? "Failed to accept invitation."
                    return
                }
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
                notificationHint = "Invitation accepted."
            }
        }.resume()
    }

    func connectRealtime() {
        guard let token = appState.token, !token.isEmpty else { return }

        wsManager.onEvent = { event in
            switch event {
            case .authSuccess:
                loadNotifications()
            case .authFailed:
                appState.logout()
            case .inboxUpdated:
                loadNotifications()
            default:
                break
            }
        }

        wsManager.connect(token: token)
    }

    func markNotificationsRead(ids: [Int]? = nil, completion: (() -> Void)? = nil) {
        guard let url = apiURL("/notifications/feed/read"),
              let userId = appState.userId else {
            completion?()
            return
        }

        var body: [String: Any] = ["userId": userId]
        if let ids, !ids.isEmpty {
            body["ids"] = ids
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        authorizedDataTask(appState: appState, request: request) { _, _, _ in
            DispatchQueue.main.async {
                completion?()
            }
        }.resume()
    }

    func markMentionNotificationsRead(ids: [Int]? = nil, completion: (() -> Void)? = nil) {
        guard let url = apiURL("/notifications/mentions/read"),
              let userId = appState.userId else {
            completion?()
            return
        }

        var body: [String: Any] = ["userId": userId]
        if let ids, !ids.isEmpty {
            body["ids"] = ids
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        authorizedDataTask(appState: appState, request: request) { _, _, _ in
            DispatchQueue.main.async {
                completion?()
            }
        }.resume()
    }

    func markAllNotificationsRead() {
        if !activityNotifications.isEmpty {
            markNotificationsRead {
                withAnimation(.zymSoft) {
                    activityNotifications = activityNotifications.map { notification in
                        var updated = notification
                        updated.is_read = true
                        return updated
                    }
                }
            }
        }

        if !mentionNotifications.isEmpty {
            markMentionNotificationsRead {
                withAnimation(.zymSoft) {
                    mentionNotifications = mentionNotifications.map { notification in
                        var updated = notification
                        updated.is_read = true
                        return updated
                    }
                }
            }
        }
    }

    func openNotification(_ notification: FeedUnifiedNotification) {
        if let activity = notification.activity {
            markNotificationsRead(ids: [activity.id]) {
                activityNotifications = activityNotifications.map { item in
                    guard item.id == activity.id else { return item }
                    var updated = item
                    updated.is_read = true
                    return updated
                }
            }
        }

        if let mention = notification.mention {
            markMentionNotificationsRead(ids: [mention.id]) {
                mentionNotifications = mentionNotifications.map { item in
                    guard item.id == mention.id else { return item }
                    var updated = item
                    updated.is_read = true
                    return updated
                }
            }
        }

        withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
            notificationsOpen = false
        }

        if let postId = notification.post_id {
            if let post = posts.first(where: { $0.id == postId }) {
                selectedPost = post
            } else {
                pendingOpenPostId = postId
                loadFeed()
            }
            return
        }

        if let mention = notification.mention,
           mention.source_type == "post_comment",
           let topic = mention.topic,
           topic.hasPrefix("post_"),
           let postId = Int(topic.replacingOccurrences(of: "post_", with: "")) {
            if let post = posts.first(where: { $0.id == postId }) {
                selectedPost = post
            } else {
                pendingOpenPostId = postId
                loadFeed()
            }
            return
        }

        if notification.source_type == "message" || notification.mention?.source_type == "message" {
            appState.requestedTabIndex = 0
            notificationHint = "Message alerts are live. Open Chats to reply."
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) {
                withAnimation(.easeOut(duration: 0.2)) {
                    notificationHint = ""
                }
            }
        }
    }

    func reactToPost(postId: Int) {
        guard let url = apiURL("/community/react"),
              let userId = appState.userId else { return }
        if reactingIds.contains(postId) { return }

        guard let currentPost = posts.first(where: { $0.id == postId }) else { return }
        reactingIds.insert(postId)
        let currentlyLiked = currentPost.viewer_has_liked ?? false
        updatePostState(postId: postId, liked: !currentlyLiked, reactionCount: max(0, (currentPost.reaction_count ?? 0) + (currentlyLiked ? -1 : 1)))

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        let body = ["postId": postId, "userId": userId, "reactionType": "like"] as [String : Any]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                reactingIds.remove(postId)
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard (200...299).contains(statusCode),
                      let data = data,
                      let payload = try? JSONDecoder().decode(PostReactionToggleResponse.self, from: data) else {
                    updatePostState(postId: postId, liked: currentlyLiked, reactionCount: currentPost.reaction_count ?? 0)
                    return
                }
                updatePostState(postId: postId, liked: payload.reacted, reactionCount: payload.reactionCount)
            }
        }.resume()
    }

    func updatePostState(postId: Int, liked: Bool, reactionCount: Int) {
        if let index = posts.firstIndex(where: { $0.id == postId }) {
            posts[index].viewer_has_liked = liked
            posts[index].reaction_count = reactionCount
            if let currentSelection = selectedPost, currentSelection.id == postId {
                selectedPost = posts[index]
            }
        }
    }
}

struct PostCard: View {
    let post: Post
    let isReacting: Bool
    let onOpen: () -> Void
    let onOpenProfile: () -> Void
    let onReact: () -> Void

    var body: some View {
        let isLiked = post.viewer_has_liked ?? false

        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Button {
                    onOpenProfile()
                } label: {
                    HStack(spacing: 10) {
                        ZStack {
                            if let avatarURL = post.avatar_url, let url = resolveRemoteURL(avatarURL) {
                                AsyncImage(url: url) { phase in
                                    switch phase {
                                    case .success(let image):
                                        image
                                            .resizable()
                                            .scaledToFill()
                                    default:
                                        Circle()
                                            .fill(Color.zymSurfaceSoft)
                                            .overlay(
                                                Text(String((post.username ?? "U").prefix(2)).uppercased())
                                                    .font(.system(size: 11, weight: .semibold))
                                                    .foregroundColor(Color.zymPrimary)
                                            )
                                    }
                                }
                            } else {
                                Circle()
                                    .fill(Color.zymSurfaceSoft)
                                    .overlay(
                                        Text(String((post.username ?? "U").prefix(2)).uppercased())
                                            .font(.system(size: 11, weight: .semibold))
                                            .foregroundColor(Color.zymPrimary)
                                    )
                            }
                        }
                        .frame(width: 38, height: 38)
                        .clipShape(Circle())

                        VStack(alignment: .leading, spacing: 3) {
                            Text(post.username ?? "User")
                                .font(.custom("Syne", size: 16))
                                .foregroundColor(Color.zymText)
                            HStack(spacing: 6) {
                                Text(post.type)
                                    .font(.caption)
                                    .foregroundColor(Color.zymSubtext)
                                Text("· \(feedVisibilityLabel(post.visibility))")
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundColor(Color.zymSubtext)
                                if let label = post.location_label ?? post.location_city, !label.isEmpty {
                                    Image(systemName: "location.fill")
                                        .font(.system(size: 9))
                                        .foregroundColor(Color.zymSubtext.opacity(0.8))
                                    Text(label)
                                        .font(.system(size: 11, weight: .medium))
                                        .foregroundColor(Color.zymSubtext)
                                        .lineLimit(1)
                                }
                            }
                        }
                    }
                }
                .buttonStyle(.plain)

                Spacer()
                if let created = post.created_at {
                    Text(String(created.prefix(16)))
                        .font(.system(size: 11))
                        .foregroundColor(Color.zymSubtext)
                }
            }

            if let content = post.content, !content.isEmpty {
                Text(content)
                    .foregroundColor(Color.zymText)
                    .font(.system(size: 15))
                    .lineLimit(4)
            }

            if let mediaUrls = post.media_urls, !mediaUrls.isEmpty {
                FeedMediaPreviewGrid(mediaUrls: mediaUrls)
            }

            HStack(spacing: 8) {
                Button(action: onReact) {
                    HStack(spacing: 6) {
                        Image(systemName: isLiked ? "heart.fill" : "heart")
                        Text("\(post.reaction_count ?? 0)")
                    }
                }
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(isLiked ? Color.red : Color.zymText)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(isLiked ? Color.red.opacity(0.08) : Color.zymSurfaceSoft.opacity(0.75))
                .clipShape(Capsule())
                .disabled(isReacting)

                Text("Comments \(post.comment_count ?? 0) · Open details")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color.zymSubtext)
            }
        }
        .zymCard()
        .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .onTapGesture(perform: onOpen)
    }
}

private struct FeedNotificationFlyout: View {
    let notifications: [FeedUnifiedNotification]
    let unreadCount: Int
    let loading: Bool
    let onOpen: (FeedUnifiedNotification) -> Void
    let onMarkAllRead: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Notifications")
                        .font(.custom("Syne", size: 20))
                        .foregroundColor(Color.zymText)
                    Text("Latest unread likes, comments, and messages.")
                        .font(.system(size: 12))
                        .foregroundColor(Color.zymSubtext)
                }

                Spacer()

                if unreadCount > 0 {
                    Button("Read all", action: onMarkAllRead)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color.zymPrimary)
                }
            }

            if loading && notifications.isEmpty {
                Text("Loading notifications...")
                    .font(.system(size: 13))
                    .foregroundColor(Color.zymSubtext)
            } else if notifications.isEmpty {
                Text("Nothing new yet. When people message you or engage with your posts, it will show up here.")
                    .font(.system(size: 13))
                    .foregroundColor(Color.zymSubtext)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                VStack(spacing: 8) {
                    ForEach(Array(notifications.prefix(6))) { notification in
                        Button(action: { onOpen(notification) }) {
                            HStack(alignment: .top, spacing: 10) {
                                ZStack {
                                    Circle()
                                        .fill(notification.is_read ? Color.zymSurfaceSoft : Color.zymPrimary.opacity(0.12))
                                        .frame(width: 34, height: 34)
                                    Image(systemName: notification.iconName)
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(notification.is_read ? Color.zymSubtext : Color.zymPrimary)
                                }

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(notification.title)
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(Color.zymText)
                                        .multilineTextAlignment(.leading)
                                    if !notification.snippet.isEmpty {
                                        Text(notification.snippet)
                                            .font(.system(size: 12))
                                            .foregroundColor(Color.zymSubtext)
                                            .lineLimit(2)
                                            .multilineTextAlignment(.leading)
                                    }
                                    Text(String(notification.created_at.prefix(16)))
                                        .font(.system(size: 11, weight: .medium))
                                        .foregroundColor(Color.zymSubtext.opacity(0.82))
                                }

                                Spacer(minLength: 0)

                                if !notification.is_read {
                                    Circle()
                                        .fill(Color.red)
                                        .frame(width: 8, height: 8)
                                        .padding(.top, 6)
                                }
                            }
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(notification.is_read ? Color.zymSurface.opacity(0.86) : Color.white.opacity(0.98))
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(14)
        .frame(width: 312)
        .background(Color.white.opacity(0.96))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .shadow(color: Color.black.opacity(0.12), radius: 18, x: 0, y: 8)
    }
}

private struct TrendingStrip: View {
    let items: [(tag: String, count: Int)]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Trending")
                        .font(.custom("Syne", size: 18))
                        .foregroundColor(Color.zymText)
                    Text("Real tags people are using.")
                        .font(.system(size: 12))
                        .foregroundColor(Color.zymSubtext)
                }
                Spacer()
            }

            if items.isEmpty {
                Text("No post tags yet.")
                    .font(.system(size: 13))
                    .foregroundColor(Color.zymSubtext)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(items.enumerated()), id: \.offset) { entry in
                            let item = entry.element
                            HStack(spacing: 5) {
                                Text("#\(item.tag)")
                                Text("\(item.count)")
                                    .foregroundColor(Color.zymSubtext)
                            }
                            .font(.system(size: 12, weight: .semibold))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.zymSurfaceSoft.opacity(0.92))
                            .clipShape(Capsule())
                        }
                    }
                }
            }
        }
        .padding(.vertical, 2)
    }
}

struct FeedPostDetailSheet: View {
    let post: Post
    let isReacting: Bool
    let onReact: () -> Void
    let onVisibilitySaved: (Int, String) -> Void
    let onOpenProfile: ((Int, String, String?) -> Void)?
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var appState: AppState
    @State private var comments: [FeedComment] = []
    @State private var commentDraft = ""
    @State private var commentsLoading = false
    @State private var commentPending = false
    @State private var visibility: String
    @State private var visibilityPending = false
    @State private var statusText = ""

    init(
        post: Post,
        isReacting: Bool,
        onReact: @escaping () -> Void,
        onVisibilitySaved: @escaping (Int, String) -> Void,
        onOpenProfile: ((Int, String, String?) -> Void)?
    ) {
        self.post = post
        self.isReacting = isReacting
        self.onReact = onReact
        self.onVisibilitySaved = onVisibilitySaved
        self.onOpenProfile = onOpenProfile
        _visibility = State(initialValue: post.visibility ?? "friends")
    }

    private var isOwnPost: Bool {
        post.user_id == (appState.userId ?? -1)
    }

    var body: some View {
        let isLiked = post.viewer_has_liked ?? false

        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack(alignment: .top, spacing: 10) {
                            Button {
                                onOpenProfile?(post.user_id, post.username ?? "User", post.avatar_url)
                            } label: {
                                HStack(spacing: 10) {
                                    ZStack {
                                        if let avatarURL = post.avatar_url, let url = resolveRemoteURL(avatarURL) {
                                            AsyncImage(url: url) { phase in
                                                switch phase {
                                                case .success(let image):
                                                    image
                                                        .resizable()
                                                        .scaledToFill()
                                                default:
                                                    Circle().fill(Color.zymSurfaceSoft)
                                                }
                                            }
                                        } else {
                                            Circle()
                                                .fill(Color.zymSurfaceSoft)
                                                .overlay(
                                                    Text(String((post.username ?? "U").prefix(2)).uppercased())
                                                        .font(.system(size: 10, weight: .bold))
                                                        .foregroundColor(Color.zymPrimaryDark)
                                                )
                                        }
                                    }
                                    .frame(width: 38, height: 38)
                                    .clipShape(Circle())

                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(post.username ?? "User")
                                            .font(.custom("Syne", size: 22))
                                            .foregroundColor(Color.zymText)
                                        Text("View profile")
                                            .font(.system(size: 11, weight: .medium))
                                            .foregroundColor(Color.zymPrimary)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                            Spacer()
                            VStack(alignment: .trailing, spacing: 6) {
                                Text(post.type)
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundColor(Color.zymSubtext)
                                Text(feedVisibilityLabel(visibility))
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundColor(Color.zymSubtext)
                            }
                        }

                        if let content = post.content, !content.isEmpty {
                            Text(content)
                                .foregroundColor(Color.zymText)
                                .font(.system(size: 16))
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        if let label = post.location_label ?? post.location_city, !label.isEmpty {
                            HStack(spacing: 6) {
                                Image(systemName: "location.fill")
                                    .font(.system(size: 11, weight: .semibold))
                                Text(label)
                                    .font(.system(size: 12, weight: .medium))
                            }
                            .foregroundColor(Color.zymSubtext)
                        }

                        if let mediaUrls = post.media_urls, !mediaUrls.isEmpty {
                            FeedMediaPreviewGrid(mediaUrls: mediaUrls)
                        }

                        HStack(spacing: 10) {
                            Button(action: onReact) {
                                HStack(spacing: 7) {
                                    Image(systemName: isLiked ? "heart.fill" : "heart")
                                    Text("\(post.reaction_count ?? 0)")
                                }
                            }
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(isLiked ? Color.red : Color.zymText)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 9)
                            .background(isLiked ? Color.red.opacity(0.08) : Color.zymSurfaceSoft.opacity(0.8))
                            .clipShape(Capsule())
                            .disabled(isReacting)

                            if isOwnPost {
                                Menu {
                                    Button("Friends only") { updateVisibility("friends") }
                                    Button("Public") { updateVisibility("public") }
                                } label: {
                                    HStack(spacing: 6) {
                                        Image(systemName: "globe")
                                        Text(visibilityPending ? "Saving..." : feedVisibilityLabel(visibility))
                                    }
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(Color.zymText)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 9)
                                    .background(Color.zymSurfaceSoft.opacity(0.8))
                                    .clipShape(Capsule())
                                }
                                .disabled(visibilityPending)
                            }
                        }

                        if !statusText.isEmpty {
                            Text(statusText)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Color.zymPrimary)
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text("Comments")
                                    .font(.custom("Syne", size: 18))
                                    .foregroundColor(Color.zymText)
                                Spacer()
                                if commentsLoading {
                                    ProgressView()
                                }
                            }

                            if comments.isEmpty, !commentsLoading {
                                Text("No comments yet.")
                                    .font(.system(size: 13))
                                    .foregroundColor(Color.zymSubtext)
                            }

                            ForEach(comments) { comment in
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack(alignment: .center, spacing: 8) {
                                        Button {
                                            onOpenProfile?(comment.user_id, comment.username, comment.avatar_url)
                                        } label: {
                                            ZStack {
                                                if let avatarURL = comment.avatar_url, let url = resolveRemoteURL(avatarURL) {
                                                    AsyncImage(url: url) { phase in
                                                        switch phase {
                                                        case .success(let image):
                                                            image
                                                                .resizable()
                                                                .scaledToFill()
                                                        default:
                                                            Circle()
                                                                .fill(Color.zymSurfaceSoft)
                                                                .overlay(
                                                                    Text(String(comment.username.prefix(2)).uppercased())
                                                                        .font(.system(size: 9, weight: .bold))
                                                                        .foregroundColor(Color.zymPrimaryDark)
                                                                )
                                                        }
                                                    }
                                                } else {
                                                    Circle()
                                                        .fill(Color.zymSurfaceSoft)
                                                        .overlay(
                                                            Text(String(comment.username.prefix(2)).uppercased())
                                                                .font(.system(size: 9, weight: .bold))
                                                                .foregroundColor(Color.zymPrimaryDark)
                                                        )
                                                }
                                            }
                                            .frame(width: 28, height: 28)
                                            .clipShape(Circle())
                                        }
                                        .buttonStyle(.plain)
                                        Button {
                                            onOpenProfile?(comment.user_id, comment.username, comment.avatar_url)
                                        } label: {
                                            Text(comment.username)
                                                .font(.system(size: 12, weight: .semibold))
                                                .foregroundColor(Color.zymText)
                                        }
                                        .buttonStyle(.plain)
                                        Spacer()
                                        Text(String(comment.created_at.prefix(16)))
                                            .font(.system(size: 11))
                                            .foregroundColor(Color.zymSubtext)
                                    }
                                    Text(comment.content)
                                        .font(.system(size: 14))
                                        .foregroundColor(Color.zymText)
                                }
                                .zymCard()
                            }

                            HStack(spacing: 8) {
                                TextField("Write a comment...", text: $commentDraft)
                                    .padding(10)
                                    .background(Color.zymSurfaceSoft.opacity(0.7))
                                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                Button(action: addComment) {
                                    Text(commentPending ? "..." : "Send")
                                }
                                .buttonStyle(ZYMGhostButton())
                                .disabled(commentPending || commentDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            }
                        }
                    }
                    .padding(16)
                }
            }
            .navigationTitle("Post")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear(perform: loadComments)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func updateVisibility(_ nextVisibility: String) {
        guard !visibilityPending,
              nextVisibility != visibility,
              let userId = appState.userId,
              let url = apiURL("/community/post/visibility") else { return }

        visibilityPending = true
        statusText = ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
            "postId": post.id,
            "visibility": nextVisibility,
        ])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                visibilityPending = false
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard (200...299).contains(statusCode) else {
                    statusText = parseAPIErrorMessage(from: data) ?? "Failed to update privacy."
                    return
                }
                visibility = nextVisibility
                statusText = "Privacy updated."
                onVisibilitySaved(post.id, nextVisibility)
            }
        }.resume()
    }

    private func loadComments() {
        guard let url = apiURL("/community/post/\(post.id)/comments") else { return }
        commentsLoading = true
        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            defer {
                DispatchQueue.main.async {
                    commentsLoading = false
                }
            }
            guard let data = data,
                  let response = try? JSONDecoder().decode(FeedCommentsResponse.self, from: data) else { return }
            DispatchQueue.main.async {
                comments = response.comments
            }
        }.resume()
    }

    private func addComment() {
        guard let userId = appState.userId,
              let url = apiURL("/community/comment") else { return }
        let content = commentDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        if content.isEmpty || commentPending { return }

        commentPending = true
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
            "postId": post.id,
            "content": content
        ])

        authorizedDataTask(appState: appState, request: request) { _, _, _ in
            DispatchQueue.main.async {
                commentPending = false
                commentDraft = ""
                loadComments()
            }
        }.resume()
    }
}

struct FeedMediaPreviewGrid: View {
    let mediaUrls: [String]

    var body: some View {
        RemoteMediaGrid(mediaUrls: mediaUrls, isMine: false)
    }
}

struct FeedUnifiedNotification: Identifiable {
    let id: String
    let kind: String
    let title: String
    let snippet: String
    let created_at: String
    let is_read: Bool
    let iconName: String
    let post_id: Int?
    let source_type: String
    let activity: FeedActivityNotification?
    let mention: MentionNotificationPayload?

    init(activity: FeedActivityNotification) {
        let actor = activity.actor_username ?? "Someone"
        self.id = "activity-\(activity.id)"
        self.kind = "activity"
        self.title = activity.source_type == "post_comment"
            ? "\(actor) commented on your post"
            : activity.source_type == "post_reaction"
                ? "\(actor) liked your post"
                : "\(actor) sent you a message"
        self.snippet = activity.snippet
        self.created_at = activity.created_at
        self.is_read = activity.is_read
        self.iconName = activity.source_type == "post_comment"
            ? "bubble.left"
            : activity.source_type == "post_reaction"
                ? "heart"
                : "message"
        self.post_id = activity.post_id
        self.source_type = activity.source_type
        self.activity = activity
        self.mention = nil
    }

    init(mention: MentionNotificationPayload) {
        let actor = mention.actor_username ?? "Someone"
        self.id = "mention-\(mention.id)"
        self.kind = "mention"
        self.title = mention.source_type == "post_comment"
            ? "\(actor) mentioned you in a comment"
            : "\(actor) mentioned you in chat"
        self.snippet = mention.snippet
        self.created_at = mention.created_at
        self.is_read = mention.is_read
        self.iconName = mention.source_type == "post_comment" ? "at.circle" : "message.badge"
        self.post_id = nil
        self.source_type = mention.source_type
        self.activity = nil
        self.mention = mention
    }
}

private func feedDistanceLabel(_ distance: Double) -> String {
    if distance < 1 {
        return "\(max(100, Int((distance * 1000).rounded()))) m away"
    }
    return distance >= 10 ? "\(Int(distance.rounded())) km away" : String(format: "%.1f km away", distance)
}

struct NearbyLocationSheet: View {
    let initialLocation: StoredUserLocationPayload?
    let onSaved: (StoredUserLocationPayload?) -> Void
    let onDisabled: () -> Void
    @ObservedObject var locationCoordinator: AppLocationPermissionCoordinator
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var appState: AppState
    @State private var query = ""
    @State private var results: [SharedLocationSelectionPayload] = []
    @State private var loading = false
    @State private var saving = false
    @State private var statusText = ""

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()
                VStack(alignment: .leading, spacing: 14) {
                    Text("Share a city or area for nearby discovery.")
                        .font(.system(size: 13))
                        .foregroundColor(Color.zymSubtext)

                    HStack(spacing: 8) {
                        Button("Use Current City") {
                            requestCurrentLocation(precise: false)
                        }
                        .buttonStyle(ZYMGhostButton())
                        .disabled(saving)

                        Button("Use Precise") {
                            requestCurrentLocation(precise: true)
                        }
                        .buttonStyle(ZYMGhostButton())
                        .disabled(saving)
                    }

                    if let initialLocation {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(initialLocation.label)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(Color.zymText)
                                Text(initialLocation.precision == "city" ? "City-level sharing" : "Precise sharing")
                                    .font(.system(size: 12))
                                    .foregroundColor(Color.zymSubtext)
                            }
                            Spacer()
                            Button("Turn Off") {
                                disableNearby()
                            }
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Color.zymPrimary)
                            .disabled(saving)
                        }
                        .padding(12)
                        .background(Color.white.opacity(0.9))
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }

                    TextField("Search city or neighborhood", text: $query)
                        .zymFieldStyle()
                        .onChange(of: query) { _, _ in
                            searchLocations()
                        }

                    if loading {
                        ProgressView()
                    } else if query.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 && results.isEmpty {
                        Text("No matching locations yet.")
                            .font(.system(size: 13))
                            .foregroundColor(Color.zymSubtext)
                    }

                    ScrollView {
                        VStack(spacing: 8) {
                            ForEach(results, id: \.label) { result in
                                Button(action: {
                                    saveLocation(result)
                                }) {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(result.label)
                                            .font(.system(size: 14, weight: .semibold))
                                            .foregroundColor(Color.zymText)
                                        Text("\(result.city) · \(result.precision == "city" ? "City-level" : "Precise")")
                                            .font(.system(size: 12))
                                            .foregroundColor(Color.zymSubtext)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(12)
                                    .background(Color.white.opacity(0.9))
                                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                                }
                                .buttonStyle(.plain)
                                .disabled(saving)
                            }
                        }
                    }

                    if !statusText.isEmpty {
                        Text(statusText)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Color.zymPrimary)
                    }

                    Spacer()
                }
                .padding(16)
            }
            .navigationTitle("Nearby Location")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }

    private func searchLocations() {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2,
              let encoded = trimmed.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = apiURL("/location/search?q=\(encoded)") else {
            results = []
            loading = false
            return
        }

        loading = true
        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            DispatchQueue.main.async {
                loading = false
            }
            guard let data = data,
                  let response = try? JSONDecoder().decode(LocationSearchResponse.self, from: data) else { return }
            DispatchQueue.main.async {
                results = response.results
            }
        }.resume()
    }

    private func requestCurrentLocation(precise: Bool) {
        saving = true
        statusText = ""
        locationCoordinator.requestCurrentCoordinate(precise: precise) { result in
            switch result {
            case .success(let coordinate):
                reverseCurrentLocation(latitude: coordinate.latitude, longitude: coordinate.longitude, precise: precise)
            case .failure(let error):
                DispatchQueue.main.async {
                    saving = false
                    statusText = error.localizedDescription
                }
            }
        }
    }

    private func reverseCurrentLocation(latitude: Double, longitude: Double, precise: Bool) {
        guard let url = apiURL("/location/reverse") else {
            saving = false
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "latitude": latitude,
            "longitude": longitude,
        ])

        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            guard let data = data,
                  let response = try? JSONDecoder().decode(LocationReverseResponse.self, from: data) else {
                DispatchQueue.main.async {
                    saving = false
                    statusText = "Failed to resolve this location."
                }
                return
            }
            let selection = precise ? response.precise : response.city
            guard let selection else {
                DispatchQueue.main.async {
                    saving = false
                    statusText = "Failed to resolve this location."
                }
                return
            }
            saveLocation(selection)
        }.resume()
    }

    private func saveLocation(_ selection: SharedLocationSelectionPayload) {
        guard let userId = appState.userId,
              let url = apiURL("/location/profile") else { return }

        saving = true
        statusText = ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
            "locationLabel": selection.label,
            "locationCity": selection.city,
            "locationLatitude": selection.latitude,
            "locationLongitude": selection.longitude,
            "locationPrecision": selection.precision,
            "locationShared": true,
        ])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard (200...299).contains(statusCode),
                      let data = data,
                      let decoded = try? JSONDecoder().decode(StoredLocationResponse.self, from: data) else {
                    saving = false
                    statusText = "Failed to save this location."
                    return
                }
                saving = false
                onSaved(decoded.location)
                dismiss()
            }
        }.resume()
    }

    private func disableNearby() {
        guard let userId = appState.userId,
              let url = apiURL("/location/profile") else { return }

        saving = true
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
            "locationShared": false,
        ])

        authorizedDataTask(appState: appState, request: request) { _, response, _ in
            DispatchQueue.main.async {
                saving = false
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard (200...299).contains(statusCode) else {
                    statusText = "Failed to disable nearby sharing."
                    return
                }
                onDisabled()
                dismiss()
            }
        }.resume()
    }
}

struct Post: Identifiable, Codable {
    let id: Int
    let user_id: Int
    let type: String
    var visibility: String?
    var viewer_has_liked: Bool?
    let content: String?
    let username: String?
    let avatar_url: String?
    var reaction_count: Int?
    let comment_count: Int?
    let media_urls: [String]?
    let location_label: String?
    let location_city: String?
    let location_latitude: Double?
    let location_longitude: Double?
    let location_precision: String?
    let created_at: String?
}

struct FeedResponse: Codable {
    let feed: [Post]
}

struct PostReactionToggleResponse: Codable {
    let success: Bool
    let reacted: Bool
    let reactionCount: Int
}

struct FeedComment: Codable, Identifiable {
    let id: Int
    let post_id: Int
    let user_id: Int
    let username: String
    let avatar_url: String?
    let content: String
    let created_at: String
}

struct FeedCommentsResponse: Codable {
    let comments: [FeedComment]
}

struct FeedActivityNotification: Codable, Identifiable {
    let id: Int
    let topic: String?
    let message_id: Int?
    let post_id: Int?
    let source_type: String
    let source_id: Int
    let snippet: String
    var is_read: Bool
    let created_at: String
    let actor_user_id: Int?
    let actor_username: String?
}

struct FeedActivityNotificationsResponse: Codable {
    let notifications: [FeedActivityNotification]
}
