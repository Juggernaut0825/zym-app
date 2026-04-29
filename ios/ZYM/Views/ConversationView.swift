import SwiftUI
import UIKit
import PhotosUI
import AVKit
import UniformTypeIdentifiers

enum DraftAttachmentKind {
    case image
    case video
    case unknown
}

struct DraftAttachment: Identifiable {
    let id = UUID()
    let data: Data
    let kind: DraftAttachmentKind
    let filename: String
    let contentType: String
    let previewURL: URL?
}

private struct ConversationTypingState {
    let label: String
    let isCoach: Bool
    let coachId: String?
    let avatarURL: String?
    let fallbackText: String
}

struct ConversationView: View {
    let conversation: Conversation
    private let maxMessageCharacters = 8000

    private let latestMessageAnchor = "conversation-latest-message-anchor"

    @State private var messages: [Message] = []
    @State private var newMessage = ""
    @State private var showMediaPicker = false
    @State private var selectedMedia: [PhotosPickerItem] = []
    @State private var draftAttachments: [DraftAttachment] = []
    @State private var isSending = false
    @State private var typingUsers: [String: Bool] = [:]
    @State private var lastTypingSent = false
    @State private var showGroupSheet = false
    @State private var groupMembers: [ConversationGroupMember] = []
    @State private var inviteUsername = ""
    @State private var groupActionPending = false
    @State private var infoNotice = ""
    @State private var profileSheetConversation: Conversation?
    @State private var profileLoading = false
    @State private var viewedProfile: ConversationPublicProfileResponse?
    @State private var profileReportPending = false
    @State private var profileActionPending = false
    @State private var animatedCoachReplies: [Int: Int] = [:]
    @State private var coachRevealWorkItems: [Int: [DispatchWorkItem]] = [:]
    @State private var coachRevealTick = 0
    @State private var showConversationSettings = false
    @State private var scrollToLatestRequest = 0

    @StateObject private var wsManager = WebSocketManager()
    @EnvironmentObject var appState: AppState

    private var groupId: Int? {
        guard conversation.isGroup, conversation.id.hasPrefix("grp_") else { return nil }
        return Int(conversation.id.replacingOccurrences(of: "grp_", with: ""))
    }

    private var groupCoachEnabled: Bool {
        conversation.coachEnabled != "none"
    }

    private var resolvedCoachId: String {
        if conversation.coachId == "lc" { return "lc" }
        if conversation.coachEnabled == "lc" { return "lc" }
        if appState.selectedCoach == "lc" { return "lc" }
        return "zj"
    }

    private var coachTypingName: String { resolvedCoachId.uppercased() }

    private var displayTimeZone: TimeZone {
        if let stored = appState.timezone,
           let zone = TimeZone(identifier: stored),
           !stored.isEmpty {
            return zone
        }
        return TimeZone.current
    }

    private var hasPendingCoachReveal: Bool {
        messages.contains { message in
            guard message.is_coach else { return false }
            guard let revealed = animatedCoachReplies[message.id] else { return false }
            return revealed < splitConversationReplySegments(message.content).count
        }
    }

    private var messageTooLong: Bool {
        newMessage.count > maxMessageCharacters
    }

    private var typingIndicatorState: ConversationTypingState? {
        let activeTypers = typingUsers
            .filter { $0.value }
            .map(\.key)
            .filter { $0 != String(appState.userId ?? -1) }

        if activeTypers.isEmpty { return nil }

        if (activeTypers.contains("coach") || activeTypers.contains("0")) && !hasPendingCoachReveal {
            return ConversationTypingState(
                label: "\(coachTypingName) is typing...",
                isCoach: true,
                coachId: resolvedCoachId,
                avatarURL: nil,
                fallbackText: coachTypingName
            )
        }

        if !conversation.isGroup {
            return ConversationTypingState(
                label: "\(conversation.name) is typing...",
                isCoach: false,
                coachId: nil,
                avatarURL: conversation.avatarUrl,
                fallbackText: String(conversation.name.prefix(2)).uppercased()
            )
        }

        let activeUserIds = activeTypers.compactMap(Int.init)
        let primaryMember = groupMembers.first { activeUserIds.contains($0.id) }
        let primaryName = primaryMember?.username ?? "Someone"
        let label: String
        if activeUserIds.count <= 1 {
            label = "\(primaryName) is typing..."
        } else if activeUserIds.count == 2 {
            let secondaryName = groupMembers.first { $0.id != primaryMember?.id && activeUserIds.contains($0.id) }?.username ?? "Someone"
            label = "\(primaryName) and \(secondaryName) are typing..."
        } else {
            label = "\(primaryName) and \(activeUserIds.count - 1) others are typing..."
        }

        return ConversationTypingState(
            label: label,
            isCoach: false,
            coachId: nil,
            avatarURL: primaryMember?.avatar_url,
            fallbackText: String(primaryName.prefix(2)).uppercased()
        )
    }

    var body: some View {
        ZStack {
            ZYMBackgroundLayer().ignoresSafeArea()
            NavigationLink(
                destination: ConversationNotificationSettingsView(conversation: conversation)
                    .environmentObject(appState),
                isActive: $showConversationSettings
            ) {
                EmptyView()
            }
            .hidden()

            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(Array(messages.enumerated()), id: \.element.id) { index, msg in
                                ConversationMessageRow(
                                    message: msg,
                                    previousMessage: index > 0 ? messages[index - 1] : nil,
                                    currentUserId: appState.userId ?? 0,
                                    conversationName: conversation.name,
                                    conversationIsCoach: conversation.isCoach,
                                    coachId: resolvedCoachId,
                                    timeZone: displayTimeZone,
                                    bubbleTheme: conversationBubbleThemePreset(id: appState.conversationBubbleThemeId(for: conversation.id)),
                                    revealedCoachSegmentCount: animatedCoachReplies[msg.id],
                                    inlineTypingLabel: "\(coachTypingName) is typing...",
                                    onOpenProfile: { userId, username, avatarURL in
                                        openProfileSheet(
                                            for: Conversation(
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
                                        )
                                    }
                                )
                                    .zymAppear(delay: Double(min(index, 5)) * 0.02)
                            }

                            if let typingIndicatorState {
                                TypingIndicatorRow(
                                    label: typingIndicatorState.label,
                                    isCoach: typingIndicatorState.isCoach,
                                    coachId: typingIndicatorState.coachId,
                                    avatarURL: typingIndicatorState.avatarURL,
                                    fallbackText: typingIndicatorState.fallbackText
                                )
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.top, 4)
                                .transition(.opacity)
                            }

                            Color.clear
                                .frame(height: 1)
                                .id(latestMessageAnchor)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 10)
                    .onAppear {
                        scrollToLatestMessage(using: proxy, animated: false)
                    }
                    .onChange(of: messages.last?.id) { _, _ in
                        scrollToLatestMessage(using: proxy)
                    }
                    .onChange(of: coachRevealTick) { _, _ in
                        scrollToLatestMessage(using: proxy)
                    }
                    .onChange(of: scrollToLatestRequest) { _, _ in
                        scrollToLatestMessage(using: proxy, animated: false)
                    }
                }

                VStack(spacing: 8) {
                    if !infoNotice.isEmpty {
                        HStack {
                            Text(infoNotice)
                                .font(.system(size: 12))
                                .foregroundColor(Color.zymPrimaryDark)
                            Spacer()
                        }
                        .padding(.horizontal, 14)
                    }

                    if !draftAttachments.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(draftAttachments) { attachment in
                                    DraftAttachmentPreview(attachment: attachment)
                                }
                            }
                            .padding(.horizontal, 12)
                        }
                    }

                    HStack(alignment: .bottom, spacing: 10) {
                        Button(action: { showMediaPicker = true }) {
                            Image(systemName: "plus.circle.fill")
                                .font(.system(size: 24))
                                .foregroundColor(Color.zymPrimary)
                        }
                        .frame(width: 32, height: 44)

                        TextField("Message", text: $newMessage, axis: .vertical)
                            .lineLimit(1...5)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(minHeight: 44, alignment: .center)
                            .frame(maxWidth: .infinity)
                            .background(messageTooLong ? Color.red.opacity(0.08) : Color.zymSurfaceSoft.opacity(0.82))
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .accessibilityLabel("Message")

                        if conversation.isGroup && groupCoachEnabled {
                            Button("@coach") {
                                if !newMessage.lowercased().contains("@coach") {
                                    newMessage = newMessage.isEmpty ? "@coach " : "@coach \(newMessage)"
                                }
                            }
                            .buttonStyle(ZYMGhostButton())
                        }

                        Button(action: sendMessage) {
                            Text(isSending ? "..." : "Send")
                                .frame(width: 52, height: 20)
                        }
                        .buttonStyle(ZYMPrimaryButton())
                        .disabled(isSending || messageTooLong)
                    }
                    .padding(.horizontal, 12)

                    if messageTooLong {
                        HStack {
                            Text("Message is too long to send. Keep it under \(maxMessageCharacters) characters.")
                                .font(.system(size: 12))
                                .foregroundColor(.red.opacity(0.82))
                            Spacer()
                        }
                        .padding(.horizontal, 14)
                    }

                    if conversation.isGroup {
                        HStack {
                            Text(groupCoachEnabled
                                 ? "Tip: mention @coach in group to trigger AI reply."
                                 : "Coach is disabled in this group.")
                                .font(.system(size: 12))
                                .foregroundColor(Color.zymSubtext)
                            Spacer()
                        }
                        .padding(.horizontal, 14)
                    }
                }
                .padding(.bottom, 10)
                .padding(.top, 6)
                .background(Color.zymSurface.opacity(0.96))
            }
        }
        .navigationTitle(conversation.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbar {
            if !conversation.isCoach && !conversation.isGroup {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: { openProfileSheet() }) {
                        HStack(spacing: 8) {
                            if let avatar = conversation.avatarUrl, let url = resolveRemoteURL(avatar) {
                                AsyncImage(url: url) { phase in
                                    switch phase {
                                    case .success(let image):
                                        image
                                            .resizable()
                                            .scaledToFill()
                                    default:
                                        Circle()
                                            .fill(Color.zymSurfaceSoft)
                                    }
                                }
                                .frame(width: 32, height: 32)
                                .clipShape(Circle())
                            } else {
                                Circle()
                                    .fill(Color.zymSurfaceSoft)
                                    .frame(width: 32, height: 32)
                                    .overlay(
                                        Text(String(conversation.name.prefix(2)).uppercased())
                                            .font(.system(size: 10, weight: .bold))
                                            .foregroundColor(Color.zymPrimaryDark)
                                    )
                            }
                        }
                    }
                }
            }

            if groupId != nil {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        showGroupSheet = true
                        loadGroupMembers()
                    }) {
                        Image(systemName: "person.2.fill")
                            .foregroundColor(Color.zymPrimary)
                    }
                }
            }

            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { showConversationSettings = true }) {
                    Image(systemName: "ellipsis.circle")
                        .foregroundColor(Color.zymPrimary)
                }
            }
        }
        .sheet(item: $profileSheetConversation) { profileConversation in
            ConversationProfileSheet(
                conversation: profileConversation,
                appCoach: profileConversation.coachId ?? appState.selectedCoach ?? "zj",
                profile: viewedProfile,
                loading: profileLoading,
                primaryActionLabel: profilePrimaryActionLabel(),
                primaryActionEnabled: profilePrimaryActionEnabled(),
                primaryActionPending: profileActionPending,
                onPrimaryAction: {
                    handleProfilePrimaryAction(for: profileConversation)
                },
                canReportUser: !profileConversation.isCoach && !profileConversation.isGroup && (profileConversation.otherUserId != nil),
                reportPending: profileReportPending,
                onReportUser: { reportConversationUser(for: profileConversation) }
            )
        }
        .onAppear {
            loadMessages()
            connectRealtime()
            if groupId != nil {
                loadGroupMembers()
            }
        }
        .onDisappear {
            wsManager.sendTyping(topic: conversation.id, isTyping: false)
            wsManager.unsubscribe(topic: conversation.id)
            wsManager.disconnect()
            clearDraftAttachments()
            cancelAllCoachReplyRevealAnimations()
        }
        .photosPicker(
            isPresented: $showMediaPicker,
            selection: $selectedMedia,
            maxSelectionCount: 5,
            matching: .any(of: [.images, .videos])
        )
        .onChange(of: selectedMedia) { _, _ in loadMedia() }
        .onChange(of: newMessage) { _, value in
            let shouldTyping = !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            if shouldTyping != lastTypingSent {
                wsManager.sendTyping(topic: conversation.id, isTyping: shouldTyping)
                lastTypingSent = shouldTyping
            }
        }
        .onChange(of: appState.token) { _, token in
            guard let token, !token.isEmpty else { return }
            wsManager.connect(token: token)
            wsManager.subscribe(topic: conversation.id)
        }
        .sheet(isPresented: $showGroupSheet) {
            GroupMembersSheet(
                members: groupMembers,
                inviteUsername: $inviteUsername,
                isPending: groupActionPending,
                canManageMembers: groupMembers.first(where: { $0.id == (appState.userId ?? -1) })?.role == "owner",
                onRefresh: loadGroupMembers,
                onInvite: addMemberToGroup,
                onRemove: removeMemberFromGroup
            )
        }
    }

    private func connectRealtime() {
        guard let token = appState.token else { return }

        wsManager.onEvent = { event in
            switch event {
            case .authSuccess:
                wsManager.subscribe(topic: conversation.id)
            case .authFailed:
                infoNotice = "Session expired. Please sign in again."
                appState.logout()
            case .messageCreated(let topic, let incomingMessage):
                guard topic == conversation.id else { return }

                let createdAt = incomingMessage.created_at ?? ISO8601DateFormatter().string(from: Date())
                let isCoach = incomingMessage.is_coach ?? (incomingMessage.from_user_id == 0)
                let mapped = Message(
                    id: incomingMessage.id,
                    topic: topic,
                    from_user_id: incomingMessage.from_user_id,
                    content: incomingMessage.decodedContent,
                    created_at: createdAt,
                    username: incomingMessage.username ?? (isCoach ? conversationCoachDisplayName(resolvedCoachId) : "User"),
                    avatar_url: incomingMessage.avatar_url,
                    media_urls: incomingMessage.media_urls ?? [],
                    is_coach: isCoach
                )

                if !messages.contains(where: { $0.id == mapped.id }) {
                    withAnimation(.zymSpring) {
                        messages.append(mapped)
                    }
                    scheduleCoachReplyRevealIfNeeded(for: mapped)
                }

                if mapped.from_user_id != (appState.userId ?? 0) {
                    markConversationRead(messageId: mapped.id)
                }

            case .typing(let topic, let userId, let isTyping):
                guard topic == conversation.id else { return }
                if String(appState.userId ?? 0) == userId { return }
                typingUsers[userId] = isTyping
            case .inboxUpdated:
                break
            case .friendsUpdated:
                break
            case .subscribed:
                break
            case .error(let message):
                infoNotice = message
            }
        }

        wsManager.connect(token: token)
        wsManager.subscribe(topic: conversation.id)
    }

    private func loadMessages() {
        guard let url = apiURL("/messages/\(conversation.id)") else { return }
        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            guard let data = data,
                  let response = try? JSONDecoder().decode(MessagesResponse.self, from: data) else { return }
            DispatchQueue.main.async {
                withAnimation(.zymSoft) {
                    messages = response.messages
                }
                pruneCoachReplyRevealAnimations(validMessageIds: Set(response.messages.map(\.id)))
                markConversationRead(messageId: response.messages.last?.id)
                scrollToLatestRequest += 1
            }
        }.resume()
    }

    private func scrollToLatestMessage(using proxy: ScrollViewProxy, animated: Bool = true) {
        let delays: [TimeInterval] = animated ? [0, 0.08, 0.24] : [0, 0.05, 0.18]
        for delay in delays {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                let scroll = {
                    proxy.scrollTo(latestMessageAnchor, anchor: .bottom)
                }
                if animated {
                    withAnimation(.zymSoft, scroll)
                } else {
                    scroll()
                }
            }
        }
    }

    private func scheduleCoachReplyRevealIfNeeded(for message: Message) {
        guard message.is_coach else { return }
        guard message.from_user_id != (appState.userId ?? 0) else { return }

        let segments = splitConversationReplySegments(message.content)
        guard !segments.isEmpty else { return }

        cancelCoachReplyRevealAnimation(for: message.id)
        animatedCoachReplies[message.id] = 0
        coachRevealTick += 1

        var pendingItems: [DispatchWorkItem] = []
        var totalDelay: TimeInterval = 0

        for (index, segment) in segments.enumerated() {
            totalDelay += segmentRevealDelay(for: segment, index: index)
            let revealItem = DispatchWorkItem {
                guard animatedCoachReplies[message.id] != nil else { return }
                withAnimation(.zymSoft) {
                    animatedCoachReplies[message.id] = index + 1
                    coachRevealTick += 1
                }

                if index == segments.count - 1 {
                    let settleItem = DispatchWorkItem {
                        animatedCoachReplies.removeValue(forKey: message.id)
                        coachRevealWorkItems.removeValue(forKey: message.id)
                        coachRevealTick += 1
                    }
                    coachRevealWorkItems[message.id, default: []].append(settleItem)
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.26, execute: settleItem)
                }
            }
            pendingItems.append(revealItem)
            DispatchQueue.main.asyncAfter(deadline: .now() + totalDelay, execute: revealItem)
        }

        coachRevealWorkItems[message.id] = pendingItems
    }

    private func segmentRevealDelay(for segment: String, index: Int) -> TimeInterval {
        let characterCount = segment
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .count
        let baseDelay = index == 0 ? 680 : 900
        let milliseconds = min(3200, max(baseDelay, baseDelay + characterCount * 18))
        return TimeInterval(milliseconds) / 1000
    }

    private func cancelCoachReplyRevealAnimation(for messageId: Int) {
        coachRevealWorkItems[messageId]?.forEach { $0.cancel() }
        coachRevealWorkItems.removeValue(forKey: messageId)
        animatedCoachReplies.removeValue(forKey: messageId)
    }

    private func cancelAllCoachReplyRevealAnimations() {
        Array(coachRevealWorkItems.keys).forEach(cancelCoachReplyRevealAnimation)
    }

    private func pruneCoachReplyRevealAnimations(validMessageIds: Set<Int>) {
        for messageId in coachRevealWorkItems.keys where !validMessageIds.contains(messageId) {
            cancelCoachReplyRevealAnimation(for: messageId)
        }
        for messageId in animatedCoachReplies.keys where !validMessageIds.contains(messageId) {
            animatedCoachReplies.removeValue(forKey: messageId)
        }
    }

    private func sendMessage() {
        guard let userId = appState.userId else { return }
        if isSending { return }
        if messageTooLong {
            infoNotice = "Message is too long to send. Keep it under \(maxMessageCharacters) characters."
            return
        }
        if newMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && draftAttachments.isEmpty { return }

        isSending = true

        if !draftAttachments.isEmpty {
            uploadMediaAndSend(userId: userId)
        } else {
            sendTextMessage(userId: userId, mediaUrls: [])
        }
    }

    private func loadMedia() {
        let items = selectedMedia
        clearDraftAttachments(resetSelection: false)
        for item in items {
            let detectedType = item.supportedContentTypes.first(where: { type in
                type.conforms(to: .movie) || type.conforms(to: .audiovisualContent) || type.conforms(to: .video)
            }) ?? item.supportedContentTypes.first(where: { type in
                type.conforms(to: .image)
            }) ?? item.supportedContentTypes.first

            let isVideo = detectedType?.conforms(to: .movie) == true
                || detectedType?.conforms(to: .audiovisualContent) == true
                || detectedType?.conforms(to: .video) == true
            let fileExtension = detectedType?.preferredFilenameExtension ?? (isVideo ? "mov" : "jpg")
            let mimeType = detectedType?.preferredMIMEType ?? (isVideo ? "video/quicktime" : "image/jpeg")
            let filename = "media.\(fileExtension)"

            item.loadTransferable(type: Data.self) { result in
                if case .success(let data) = result, let data = data {
                    let previewURL = isVideo ? makeTempPreviewURL(for: data, fileExtension: fileExtension) : nil
                    DispatchQueue.main.async {
                        draftAttachments.append(
                            DraftAttachment(
                                data: data,
                                kind: isVideo ? .video : .image,
                                filename: filename,
                                contentType: mimeType,
                                previewURL: previewURL
                            )
                        )
                    }
                }
            }
        }
    }

    private func uploadMediaAndSend(userId: Int) {
        var mediaUrls: [String] = []
        var mediaIds: [String] = []
        let lock = NSLock()
        let group = DispatchGroup()

        for attachment in draftAttachments {
            group.enter()
            uploadMedia(attachment) { response in
                if let response = response {
                    lock.lock()
                    mediaUrls.append(response.path.isEmpty ? (response.url ?? response.path) : response.path)
                    if let mediaId = response.mediaId, !mediaId.isEmpty {
                        mediaIds.append(mediaId)
                    }
                    lock.unlock()
                }
                group.leave()
            }
        }

        group.notify(queue: .main) {
            if mediaUrls.isEmpty && mediaIds.isEmpty && newMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                isSending = false
                infoNotice = "Selected media could not be prepared for upload."
                return
            }
            sendTextMessage(userId: userId, mediaUrls: mediaUrls, mediaIds: mediaIds)
            clearDraftAttachments()
        }
    }

    private func uploadMedia(_ attachment: DraftAttachment, completion: @escaping (UploadResponse?) -> Void) {
        requestUploadIntent(for: attachment) { intent in
            guard let intent = intent,
                  intent.strategy != "legacy_multipart",
                  let assetId = intent.assetId,
                  let upload = intent.upload,
                  let uploadURL = URL(string: upload.url) else {
                uploadMediaLegacy(attachment, completion: completion)
                return
            }

            var uploadRequest = URLRequest(url: uploadURL)
            uploadRequest.httpMethod = upload.method.isEmpty ? "PUT" : upload.method
            uploadRequest.httpBody = attachment.data
            for (header, value) in upload.headers ?? [:] {
                uploadRequest.setValue(value, forHTTPHeaderField: header)
            }
            if uploadRequest.value(forHTTPHeaderField: "Content-Type") == nil {
                uploadRequest.setValue(attachment.contentType, forHTTPHeaderField: "Content-Type")
            }
            if shouldAuthorizeUploadTarget(uploadURL) {
                applyAuthorizationHeader(&uploadRequest, token: appState.token)
            }

            authorizedDataTask(appState: appState, request: uploadRequest) { _, response, _ in
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard statusCode >= 200 && statusCode < 300 else {
                    uploadMediaLegacy(attachment, completion: completion)
                    return
                }
                finalizeUploadedMedia(assetId: assetId, completion: completion)
            }.resume()
        }
    }

    private func requestUploadIntent(for attachment: DraftAttachment, completion: @escaping (UploadIntentResponse?) -> Void) {
        guard let url = apiURL("/media/upload-url") else {
            completion(nil)
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "fileName": attachment.filename,
            "contentType": attachment.contentType,
            "sizeBytes": attachment.data.count,
            "source": "ios_message",
            "visibility": "private",
        ])

        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            guard let data = data,
                  let response = try? JSONDecoder().decode(UploadIntentResponse.self, from: data) else {
                completion(nil)
                return
            }
            completion(response)
        }.resume()
    }

    private func finalizeUploadedMedia(assetId: String, completion: @escaping (UploadResponse?) -> Void) {
        guard let url = apiURL("/media/finalize") else {
            completion(nil)
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "assetId": assetId
        ])

        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            guard let data = data,
                  let response = try? JSONDecoder().decode(UploadResponse.self, from: data) else {
                completion(nil)
                return
            }
            completion(response)
        }.resume()
    }

    private func shouldAuthorizeUploadTarget(_ url: URL) -> Bool {
        guard let apiBase = apiURL("/") else { return false }
        return url.host == apiBase.host && url.port == apiBase.port
    }

    private func uploadMediaLegacy(_ attachment: DraftAttachment, completion: @escaping (UploadResponse?) -> Void) {
        guard let url = apiURL("/media/upload") else {
            completion(nil)
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        applyAuthorizationHeader(&request, token: appState.token)

        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"source\"\r\n\r\n".data(using: .utf8)!)
        body.append("ios_message\r\n".data(using: .utf8)!)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"visibility\"\r\n\r\n".data(using: .utf8)!)
        body.append("private\r\n".data(using: .utf8)!)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(attachment.filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(attachment.contentType)\r\n\r\n".data(using: .utf8)!)
        body.append(attachment.data)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            guard let data = data,
                  let response = try? JSONDecoder().decode(UploadResponse.self, from: data) else {
                completion(nil)
                return
            }
            completion(response)
        }.resume()
    }

    private func sendTextMessage(userId: Int, mediaUrls: [String], mediaIds: [String] = []) {
        guard let url = apiURL("/messages/send") else {
            isSending = false
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)

        let trimmed = newMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        var body: [String: Any] = [
            "fromUserId": userId,
            "topic": conversation.id
        ]

        if !trimmed.isEmpty {
            body["content"] = trimmed
            body["contentB64"] = utf8Base64String(trimmed)
        }
        if !mediaUrls.isEmpty {
            body["mediaUrls"] = mediaUrls
        }
        if !mediaIds.isEmpty {
            body["mediaIds"] = mediaIds
        }

        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        authorizedDataTask(appState: appState, request: request) { data, response, error in
            DispatchQueue.main.async {
                defer { isSending = false }
                if let error {
                    infoNotice = error.localizedDescription
                    return
                }
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard statusCode >= 200 && statusCode < 300 else {
                    infoNotice = parseAPIErrorMessage(from: data) ?? "Failed to send message."
                    return
                }
                newMessage = ""
                lastTypingSent = false
                wsManager.sendTyping(topic: conversation.id, isTyping: false)
                loadMessages()
            }
        }.resume()
    }

    private func markConversationRead(messageId: Int?) {
        guard let userId = appState.userId,
              let url = apiURL("/messages/read") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)

        var body: [String: Any] = [
            "userId": userId,
            "topic": conversation.id
        ]
        if let messageId {
            body["messageId"] = messageId
        }
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        authorizedDataTask(appState: appState, request: request).resume()
    }

    private func openProfileSheet(for targetConversation: Conversation? = nil) {
        let target = targetConversation ?? conversation
        guard !target.isGroup else { return }
        profileSheetConversation = target

        if target.isCoach {
            profileLoading = false
            viewedProfile = nil
            return
        }

        guard let peerUserId = target.otherUserId,
              let url = apiURL("/profile/public/\(peerUserId)") else {
            profileLoading = false
            viewedProfile = nil
            return
        }

        profileLoading = true
        viewedProfile = nil
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

    private func reportConversationUser(for targetConversation: Conversation) {
        guard !profileReportPending,
              let reporterUserId = appState.userId,
              let targetUserId = viewedProfile?.profile.id ?? targetConversation.otherUserId,
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
            "details": "Reported from iOS conversation profile (\(targetConversation.id))"
        ])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                profileReportPending = false
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                if statusCode >= 200 && statusCode < 300 {
                    infoNotice = "Report submitted. Our team will review it."
                    return
                }
                if let data = data,
                   let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let message = payload["error"] as? String {
                    infoNotice = message
                } else {
                    infoNotice = "Failed to submit report."
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

    private func handleProfilePrimaryAction(for targetConversation: Conversation) {
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
                    infoNotice = parseAPIErrorMessage(from: data) ?? "Failed to open direct message."
                    return
                }
                appState.requestedTabIndex = 0
                appState.requestedConversationTopic = payload.topic
                profileSheetConversation = nil
                infoNotice = "Direct message ready."
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
                    infoNotice = parseAPIErrorMessage(from: data) ?? "Failed to send friend request."
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
                infoNotice = "Friend request sent."
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
                    infoNotice = parseAPIErrorMessage(from: data) ?? "Failed to accept invitation."
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
                infoNotice = "Invitation accepted."
            }
        }.resume()
    }

    private func clearDraftAttachments(resetSelection: Bool = true) {
        for attachment in draftAttachments {
            if let previewURL = attachment.previewURL {
                try? FileManager.default.removeItem(at: previewURL)
            }
        }
        draftAttachments = []
        if resetSelection {
            selectedMedia = []
        }
    }

    private func makeTempPreviewURL(for data: Data, fileExtension: String) -> URL? {
        let ext = fileExtension.isEmpty ? "mov" : fileExtension
        let fileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("zym-preview-\(UUID().uuidString)")
            .appendingPathExtension(ext)
        do {
            try data.write(to: fileURL, options: .atomic)
            return fileURL
        } catch {
            return nil
        }
    }

    private func loadGroupMembers() {
        guard let groupId = groupId,
              let url = apiURL("/groups/\(groupId)/members") else { return }
        groupActionPending = true
        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)

        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            defer {
                DispatchQueue.main.async {
                    groupActionPending = false
                }
            }

            guard let data = data,
                  let response = try? JSONDecoder().decode(GroupMembersResponse.self, from: data) else {
                return
            }

            DispatchQueue.main.async {
                groupMembers = response.members
            }
        }.resume()
    }

    private func addMemberToGroup() {
        guard let groupId = groupId,
              let url = apiURL("/groups/add-member") else { return }

        let username = inviteUsername.trimmingCharacters(in: .whitespacesAndNewlines)
        if username.isEmpty { return }

        groupActionPending = true
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "groupId": groupId,
            "username": username
        ])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            defer {
                DispatchQueue.main.async {
                    groupActionPending = false
                }
            }

            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            if statusCode >= 200 && statusCode < 300 {
                DispatchQueue.main.async {
                    inviteUsername = ""
                    infoNotice = "Member invited."
                    loadGroupMembers()
                }
                return
            }

            if let data = data,
               let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let message = payload["error"] as? String {
                DispatchQueue.main.async {
                    infoNotice = message
                }
            }
        }.resume()
    }

    private func removeMemberFromGroup(_ member: ConversationGroupMember) {
        guard let groupId = groupId,
              let url = apiURL("/groups/remove-member") else { return }

        groupActionPending = true
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "groupId": groupId,
            "userId": member.id
        ])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            defer {
                DispatchQueue.main.async {
                    groupActionPending = false
                }
            }

            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            if statusCode >= 200 && statusCode < 300 {
                DispatchQueue.main.async {
                    infoNotice = "Removed \(member.username)."
                    loadGroupMembers()
                }
                return
            }

            if let data = data,
               let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let message = payload["error"] as? String {
                DispatchQueue.main.async {
                    infoNotice = message
                }
            }
        }.resume()
    }
}

private struct ConversationNotificationPreferencePayload: Codable {
    let topic: String
    let muted: Bool
}

private struct ConversationNotificationSettingsView: View {
    let conversation: Conversation

    @EnvironmentObject private var appState: AppState
    @State private var preference: ConversationNotificationPreferencePayload?
    @State private var loading = false
    @State private var saving = false
    @State private var statusText = ""
    @State private var bubbleThemeExpanded = false

    private var selectedBubbleTheme: ConversationBubbleThemePreset {
        conversationBubbleThemePreset(id: appState.conversationBubbleThemeId(for: conversation.id))
    }

    var body: some View {
        ZStack {
            ZYMBackgroundLayer().ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(conversation.name)
                            .font(.custom("Syne", size: 28))
                            .foregroundColor(Color.zymText)
                        Text("Keep this chat loud or quiet. You can also pick a simple bubble theme here.")
                            .font(.system(size: 14))
                            .foregroundColor(Color.zymSubtext)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .zymAppear(delay: 0.03)

                    VStack(alignment: .leading, spacing: 12) {
                        Text("Chat notifications")
                            .font(.custom("Syne", size: 20))
                            .foregroundColor(Color.zymText)

                        if loading && preference == nil {
                            ProgressView()
                        } else {
                            HStack(alignment: .top, spacing: 12) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Notifications")
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundColor(Color.zymText)
                                    Text((preference?.muted ?? false)
                                         ? "This chat stays in your inbox, but new messages stay quiet."
                                         : "New messages from this chat can still notify you.")
                                        .font(.system(size: 12))
                                        .foregroundColor(Color.zymSubtext)
                                        .fixedSize(horizontal: false, vertical: true)
                                }

                                Spacer(minLength: 12)

                                Toggle("", isOn: Binding(
                                    get: { !(preference?.muted ?? false) },
                                    set: { nextValue in
                                        updatePreference(muted: !nextValue)
                                    }
                                ))
                                .labelsHidden()
                                .tint(.green)
                                .disabled(saving || loading)
                            }
                            .padding(.vertical, 2)
                        }

                        if !statusText.isEmpty {
                            Text(statusText)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Color.zymPrimary)
                        }
                    }
                    .zymCard()
                    .zymAppear(delay: 0.08)

                    VStack(alignment: .leading, spacing: 12) {
                        DisclosureGroup(isExpanded: $bubbleThemeExpanded) {
                            Text("Saved on this device for this chat.")
                                .font(.system(size: 12))
                                .foregroundColor(Color.zymSubtext)
                                .padding(.top, 8)

                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                                ForEach(conversationBubbleThemePresets) { preset in
                                    ConversationBubbleThemeChip(
                                        preset: preset,
                                        selected: selectedBubbleTheme.id == preset.id,
                                        onSelect: {
                                            appState.setConversationBubbleThemeId(preset.id, for: conversation.id)
                                        }
                                    )
                                }
                            }
                        } label: {
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Message Bubble")
                                        .font(.custom("Syne", size: 20))
                                        .foregroundColor(Color.zymText)
                                    Text(selectedBubbleTheme.label)
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundColor(Color.zymSubtext)
                                }

                                Spacer()

                                ConversationBubbleThemePreview(preset: selectedBubbleTheme)
                            }
                        }
                        .accentColor(Color.zymText)
                    }
                    .zymCard()
                    .zymAppear(delay: 0.1)
                }
                .padding(14)
            }
        }
        .navigationTitle("Chat Settings")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear(perform: loadPreference)
    }

    private func loadPreference() {
        guard let userId = appState.userId,
              let baseURL = apiURL("/notifications/conversation-preference/\(userId)") else { return }

        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "topic", value: conversation.id)]
        guard let url = components?.url else { return }

        loading = true
        statusText = ""

        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            DispatchQueue.main.async {
                loading = false
            }
            guard let data = data,
                  let response = try? JSONDecoder().decode(ConversationNotificationPreferencePayload.self, from: data) else { return }
            DispatchQueue.main.async {
                preference = response
            }
        }.resume()
    }

    private func updatePreference(muted: Bool) {
        guard let userId = appState.userId,
              let url = apiURL("/notifications/conversation-preference") else { return }

        saving = true
        statusText = ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
            "topic": conversation.id,
            "muted": muted,
        ])

        authorizedDataTask(appState: appState, request: request) { data, response, error in
            DispatchQueue.main.async {
                saving = false
                if let error {
                    statusText = error.localizedDescription
                    return
                }

                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard (200...299).contains(statusCode),
                      let data = data,
                      let payload = try? JSONDecoder().decode(ConversationNotificationPreferencePayload.self, from: data) else {
                    statusText = parseAPIError(data) ?? "Failed to update chat notification settings."
                    return
                }

                preference = payload
                statusText = ""
            }
        }.resume()
    }
}

private func conversationCoachDisplayName(_ coachId: String?) -> String {
    coachId == "lc" ? "LC Coach" : "ZJ Coach"
}

private func splitConversationReplySegments(_ content: String?) -> [String] {
    let text = conversationSanitizedDisplayContent(content).trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return [] }
    let normalized = text
        .replacingOccurrences(of: "\r\n", with: "\n")
        .replacingOccurrences(of: "\n{2,}", with: "\u{000B}", options: .regularExpression)
    let parts = normalized
        .components(separatedBy: "\u{000B}")
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
    return parts.isEmpty ? [text] : parts
}

private func conversationSanitizedDisplayContent(_ content: String?) -> String {
    let mapped = String(content ?? "")
        .map(conversationSanitizedCharacter)
        .joined()
    return conversationNormalizeEmojiPunctuation(mapped)
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

private func conversationSanitizedCharacter(_ character: Character) -> String {
    let scalars = character.unicodeScalars
    if scalars.count == 1, let scalar = scalars.first {
        switch scalar.value {
        case 0x2753, 0x2754:
            return "?"
        case 0x2755, 0x2757:
            return "!"
        case 0x2049:
            return "!?"
        case 0x203C:
            return "!!"
        default:
            break
        }
    }

    let hasEmojiBase = scalars.contains { scalar in
        !conversationIsEmojiFormatScalar(scalar) && (scalar.properties.isEmoji || scalar.properties.isEmojiPresentation)
    }
    let hasEmojiPresentationSelector = scalars.contains { $0.value == 0xFE0F }
    let stripEmojiPresentationSelector = conversationShouldStripEmojiPresentationSelector(from: scalars)
    let filteredScalars = scalars.filter { scalar in
        if scalar.value == 0xFFFD { return false }
        if scalar.value == 0xFE0E { return false }
        if scalar.value == 0xFE0F && stripEmojiPresentationSelector { return false }
        if conversationIsEmojiFormatScalar(scalar) && !hasEmojiBase { return false }
        return true
    }
    let emojiPresentationSelector = Unicode.Scalar(0xFE0F)!
    var normalizedScalars = String.UnicodeScalarView()
    for scalar in filteredScalars {
        normalizedScalars.append(scalar)
        if conversationShouldForceEmojiPresentation(for: scalar, hasSelector: hasEmojiPresentationSelector) {
            normalizedScalars.append(emojiPresentationSelector)
        }
    }
    return String(normalizedScalars)
}

private func conversationNormalizeEmojiPunctuation(_ content: String) -> String {
    content
        .replacingOccurrences(of: #"([?!。！？])\s+\?(?=\s|$)"#, with: "$1", options: .regularExpression)
        .replacingOccurrences(of: #"([?!。！？])\?(?=\s|$)"#, with: "$1", options: .regularExpression)
        .replacingOccurrences(of: #"([!！])\s+!(?=\s|$)"#, with: "$1", options: .regularExpression)
        .replacingOccurrences(of: #"([!！])!(?=\s|$)"#, with: "$1", options: .regularExpression)
}

private func conversationShouldStripEmojiPresentationSelector(from scalars: String.UnicodeScalarView) -> Bool {
    guard scalars.contains(where: { $0.value == 0xFE0F }) else { return false }
    guard !scalars.contains(where: { $0.value == 0x20E3 }) else { return false }
    guard let base = scalars.first(where: { !conversationIsEmojiFormatScalar($0) }) else { return false }
    return base.value <= 0x7F
}

private func conversationIsEmojiFormatScalar(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.value {
    case 0xFE0F, 0x200D, 0x20E3, 0xE0020...0xE007F:
        return true
    default:
        return false
    }
}

private func conversationShouldForceEmojiPresentation(for scalar: Unicode.Scalar, hasSelector: Bool) -> Bool {
    guard !hasSelector else { return false }
    guard scalar.value > 0x7F else { return false }
    guard scalar.properties.isEmoji, !scalar.properties.isEmojiPresentation else { return false }
    return true
}

private func parseConversationDisplayDate(_ value: String?) -> Date? {
    let raw = String(value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !raw.isEmpty else { return nil }

    let normalized: String
    if raw.range(of: #"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$"#, options: .regularExpression) != nil {
        normalized = raw.replacingOccurrences(of: " ", with: "T") + "Z"
    } else if raw.range(of: #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$"#, options: .regularExpression) != nil {
        normalized = raw + "Z"
    } else {
        normalized = raw
    }

    let fractionalFormatter = ISO8601DateFormatter()
    fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = fractionalFormatter.date(from: normalized) {
        return date
    }

    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    if let date = formatter.date(from: normalized) {
        return date
    }

    let fallback = DateFormatter()
    fallback.locale = Locale(identifier: "en_US_POSIX")
    fallback.timeZone = TimeZone(secondsFromGMT: 0)
    fallback.dateFormat = "yyyy-MM-dd HH:mm:ss"
    return fallback.date(from: raw)
}

private func conversationDayToken(_ value: String?, timeZone: TimeZone) -> String? {
    guard let date = parseConversationDisplayDate(value) else { return nil }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    let components = calendar.dateComponents([.year, .month, .day], from: date)
    guard let year = components.year,
          let month = components.month,
          let day = components.day else {
        return nil
    }
    return "\(year)-\(month)-\(day)"
}

private func formatConversationTime(_ value: String?, timeZone: TimeZone) -> String {
    guard let date = parseConversationDisplayDate(value) else { return "" }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = timeZone
    formatter.dateFormat = "MM/dd, h:mm a"
    return formatter.string(from: date)
}

private func formatConversationDayLabel(_ value: String?, timeZone: TimeZone) -> String {
    guard let date = parseConversationDisplayDate(value) else { return "" }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone

    let normalized = calendar.startOfDay(for: date)
    let today = calendar.startOfDay(for: Date())
    let yesterday = calendar.date(byAdding: .day, value: -1, to: today) ?? today

    if normalized == today { return "Today" }
    if normalized == yesterday { return "Yesterday" }

    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = timeZone
    formatter.dateFormat = "EEE, MMM d"
    return formatter.string(from: date)
}

private struct ConversationMessageRow: View {
    let message: Message
    let previousMessage: Message?
    let currentUserId: Int
    let conversationName: String
    let conversationIsCoach: Bool
    let coachId: String
    let timeZone: TimeZone
    let bubbleTheme: ConversationBubbleThemePreset
    let revealedCoachSegmentCount: Int?
    let inlineTypingLabel: String
    let onOpenProfile: ((Int, String, String?) -> Void)?

    private var isMine: Bool {
        message.from_user_id == currentUserId
    }

    private var showDateDivider: Bool {
        conversationDayToken(previousMessage?.created_at, timeZone: timeZone) != conversationDayToken(message.created_at, timeZone: timeZone)
    }

    private var compact: Bool {
        guard let previousMessage else { return false }
        return previousMessage.from_user_id == message.from_user_id && !showDateDivider
    }

    private var showMetaLine: Bool {
        !compact || isMine
    }

    private var senderLabel: String {
        if isMine { return "You" }
        if message.is_coach { return conversationCoachDisplayName(coachId) }
        let trimmed = message.username.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? conversationName : trimmed
    }

    private var senderMetaLabel: String {
        if !isMine && conversationIsCoach && message.is_coach {
            return ""
        }
        return senderLabel
    }

    private var avatarText: String {
        message.is_coach ? coachId.uppercased() : String(senderLabel.prefix(2)).uppercased()
    }

    private var contentSegments: [String] {
        if message.is_coach && !isMine {
            return splitConversationReplySegments(message.content)
        }
        let text = conversationSanitizedDisplayContent(message.content)
        return text.isEmpty ? [] : [text]
    }

    private var renderedSegments: [String] {
        guard message.is_coach && !isMine else { return contentSegments }
        let count = max(0, min(revealedCoachSegmentCount ?? contentSegments.count, contentSegments.count))
        return Array(contentSegments.prefix(count))
    }

    private var hasRemainingCoachSegments: Bool {
        guard message.is_coach && !isMine else { return false }
        return (revealedCoachSegmentCount ?? contentSegments.count) < contentSegments.count
    }

    private var mediaUrls: [String] {
        message.media_urls ?? []
    }

    private var rowWidth: CGFloat {
        min(UIScreen.main.bounds.width * 0.76, 360)
    }

    var body: some View {
        VStack(spacing: 10) {
            if showDateDivider {
                ConversationDayDivider(label: formatConversationDayLabel(message.created_at, timeZone: timeZone))
            }

            HStack(alignment: .bottom, spacing: 10) {
                if isMine {
                    Spacer(minLength: 40)
                } else {
                    if let onOpenProfile, !message.is_coach, !compact {
                        Button(action: {
                            onOpenProfile(
                                message.from_user_id,
                                senderLabel == "You" ? conversationName : senderLabel,
                                message.avatar_url
                            )
                        }) {
                            ConversationAvatarBadge(
                                isCoach: message.is_coach,
                                coachId: coachId,
                                avatarURL: message.avatar_url,
                                fallbackText: avatarText
                            )
                        }
                        .buttonStyle(.plain)
                    } else {
                        ConversationAvatarBadge(
                            isCoach: message.is_coach,
                            coachId: coachId,
                            avatarURL: message.avatar_url,
                            fallbackText: avatarText
                        )
                        .opacity(compact ? 0 : 1)
                    }
                }

                VStack(alignment: isMine ? .trailing : .leading, spacing: 8) {
                    if showMetaLine {
                        HStack(spacing: 6) {
                            if !senderMetaLabel.isEmpty {
                                Text(senderMetaLabel.uppercased())
                                    .font(.system(size: 11, weight: .semibold))
                                    .kerning(1.2)
                            }
                            Text(formatConversationTime(message.created_at, timeZone: timeZone).uppercased())
                                .font(.system(size: 11))
                                .kerning(1.2)
                        }
                        .foregroundColor(Color.zymSubtext.opacity(0.78))
                    }

                    VStack(alignment: isMine ? .trailing : .leading, spacing: 8) {
                        ForEach(Array(renderedSegments.enumerated()), id: \.offset) { _, segment in
                            ConversationSegmentBubble(content: segment, isMine: isMine, theme: bubbleTheme)
                        }

                        if hasRemainingCoachSegments {
                            TypingIndicatorPill(label: inlineTypingLabel)
                        }

                        if !mediaUrls.isEmpty {
                            RemoteMediaGrid(mediaUrls: mediaUrls, isMine: isMine)
                        }
                    }
                }
                .frame(maxWidth: rowWidth, alignment: isMine ? .trailing : .leading)

                if !isMine {
                    Spacer(minLength: 6)
                }
            }
            .frame(maxWidth: .infinity, alignment: isMine ? .trailing : .leading)
        }
    }
}

private struct ConversationDayDivider: View {
    let label: String

    var body: some View {
        HStack(spacing: 10) {
            Rectangle()
                .fill(Color.zymLine.opacity(0.75))
                .frame(height: 1)
            Text(label)
                .font(.system(size: 10, weight: .bold))
                .kerning(1.4)
                .foregroundColor(Color.zymSubtext.opacity(0.72))
                .textCase(.uppercase)
            Rectangle()
                .fill(Color.zymLine.opacity(0.75))
                .frame(height: 1)
        }
        .padding(.vertical, 2)
    }
}

private struct ConversationAvatarBadge: View {
    let isCoach: Bool
    let coachId: String
    let avatarURL: String?
    let fallbackText: String

    var body: some View {
        avatarContent
            .frame(width: 34, height: 34)
            .clipShape(Circle())
    }

    @ViewBuilder
    private var avatarContent: some View {
        if !isCoach, let url = resolveRemoteURL(avatarURL) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                default:
                    fallbackCircle
                }
            }
        } else {
            fallbackCircle
        }
    }

    private var fallbackCircle: some View {
        Circle()
            .fill(isCoach ? Color.zymCoachAccent(coachId) : Color.zymSurfaceSoft)
            .overlay(
                Text(fallbackText)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(isCoach ? .white : Color.zymPrimaryDark)
            )
    }
}

private struct ConversationSegmentBubble: View {
    let content: String
    let isMine: Bool
    let theme: ConversationBubbleThemePreset

    var body: some View {
        ConversationMarkdownText(content: content, isMine: isMine, theme: theme)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(isMine ? theme.outgoingFill : theme.incomingFill)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct ConversationMarkdownText: View {
    let content: String
    let isMine: Bool
    let theme: ConversationBubbleThemePreset

    private var displayContent: String {
        conversationSanitizedDisplayContent(content)
    }

    private var attributed: AttributedString? {
        guard conversationContainsInlineMarkdownLink(displayContent) else { return nil }
        return try? AttributedString(
            markdown: displayContent,
            options: AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        )
    }

    var body: some View {
        if let attributed {
            Text(attributed)
                .font(.system(size: 15, design: .default))
                .foregroundColor(isMine ? theme.outgoingText : theme.incomingText)
                .tint(isMine ? theme.outgoingText.opacity(0.92) : theme.incomingText.opacity(0.92))
        } else {
            ConversationEmojiSafeText(
                content: displayContent,
                textColor: UIColor(isMine ? theme.outgoingText : theme.incomingText),
                fontSize: 15
            )
        }
    }
}

private func conversationContainsInlineMarkdownLink(_ content: String) -> Bool {
    content.range(of: #"\[[^\]]+\]\(https?://[^)\s]+\)"#, options: .regularExpression) != nil
}

private struct ConversationEmojiSafeText: UIViewRepresentable {
    let content: String
    let textColor: UIColor
    let fontSize: CGFloat

    func makeUIView(context: Context) -> ConversationEmojiFallbackLabel {
        let label = ConversationEmojiFallbackLabel()
        label.numberOfLines = 0
        label.lineBreakMode = .byWordWrapping
        label.backgroundColor = .clear
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        label.setContentHuggingPriority(.defaultLow, for: .horizontal)
        return label
    }

    func updateUIView(_ label: ConversationEmojiFallbackLabel, context: Context) {
        label.configure(
            content,
            textColor: textColor,
            fontSize: fontSize
        )
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: ConversationEmojiFallbackLabel, context: Context) -> CGSize? {
        let width = proposal.width ?? UIScreen.main.bounds.width * 0.72
        let targetSize = CGSize(width: width, height: .greatestFiniteMagnitude)
        let size = uiView.sizeThatFits(targetSize)
        return CGSize(width: min(size.width, width), height: size.height)
    }
}

private final class ConversationEmojiFallbackLabel: UILabel {
    fileprivate static let imageCache = NSCache<NSString, UIImage>()
    private var renderContent = ""
    private var renderTextColor = UIColor.label
    private var renderFontSize: CGFloat = 15
    private var requestedEmojiKeys = Set<String>()

    func configure(_ content: String, textColor: UIColor, fontSize: CGFloat) {
        let shouldRender = content != renderContent || textColor != renderTextColor || fontSize != renderFontSize
        renderContent = content
        renderTextColor = textColor
        renderFontSize = fontSize
        if shouldRender {
            attributedText = conversationEmojiSafeAttributedString(
                content,
                textColor: textColor,
                fontSize: fontSize,
                missingEmojiHandler: { [weak self] key in
                    self?.requestEmojiImage(key)
                }
            )
        }
    }

    private func requestEmojiImage(_ key: String) {
        guard !requestedEmojiKeys.contains(key) else { return }
        guard ConversationEmojiFallbackLabel.imageCache.object(forKey: key as NSString) == nil else {
            rerender()
            return
        }
        guard let url = URL(string: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/\(key).png") else { return }
        requestedEmojiKeys.insert(key)

        URLSession.shared.dataTask(with: url) { [weak self] data, response, _ in
            guard let self else { return }
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard statusCode >= 200 && statusCode < 300,
                  let data,
                  let image = UIImage(data: data) else {
                return
            }
            ConversationEmojiFallbackLabel.imageCache.setObject(image, forKey: key as NSString)
            DispatchQueue.main.async {
                self.rerender()
            }
        }.resume()
    }

    private func rerender() {
        attributedText = conversationEmojiSafeAttributedString(
            renderContent,
            textColor: renderTextColor,
            fontSize: renderFontSize,
            missingEmojiHandler: { [weak self] key in
                self?.requestEmojiImage(key)
            }
        )
        invalidateIntrinsicContentSize()
    }
}

private func conversationEmojiSafeAttributedString(
    _ content: String,
    textColor: UIColor,
    fontSize: CGFloat,
    missingEmojiHandler: (String) -> Void
) -> NSAttributedString {
    let baseFont = UIFont.systemFont(ofSize: fontSize)
    let attributed = NSMutableAttributedString()

    for character in content {
        let text = String(character)
        if conversationCharacterContainsEmoji(character),
           let key = conversationTwemojiKey(for: character) {
            if let image = ConversationEmojiFallbackLabel.imageCache.object(forKey: key as NSString) {
                let attachment = NSTextAttachment()
                attachment.image = image
                let imageSize = fontSize + 2
                attachment.bounds = CGRect(x: 0, y: -3, width: imageSize, height: imageSize)
                attributed.append(NSAttributedString(attachment: attachment))
            } else {
                missingEmojiHandler(key)
                attributed.append(NSAttributedString(
                    string: text,
                    attributes: [
                        .font: UIFont(name: "AppleColorEmoji", size: fontSize) ?? baseFont,
                        .foregroundColor: textColor,
                    ]
                ))
            }
        } else {
            attributed.append(NSAttributedString(
                string: text,
                attributes: [
                    .font: baseFont,
                    .foregroundColor: textColor,
                ]
            ))
        }
    }

    return attributed
}

private func conversationTwemojiKey(for character: Character) -> String? {
    let codepoints = character.unicodeScalars.compactMap { scalar -> String? in
        switch scalar.value {
        case 0xFE0E, 0xFE0F:
            return nil
        default:
            return String(scalar.value, radix: 16, uppercase: false)
        }
    }
    return codepoints.isEmpty ? nil : codepoints.joined(separator: "-")
}

private func conversationCharacterContainsEmoji(_ character: Character) -> Bool {
    character.unicodeScalars.contains { scalar in
        scalar.properties.isEmojiPresentation || (scalar.properties.isEmoji && scalar.value > 0x7F)
    }
}

enum RemoteMediaKind {
    case image
    case video
}

struct RemoteMediaItem: Identifiable, Hashable {
    let id: String
    let url: URL
    let kind: RemoteMediaKind
    let originalValue: String
}

struct RemoteMediaPresentation: Identifiable {
    let id = UUID()
    let items: [RemoteMediaItem]
    let initialIndex: Int
}

func resolvedRemoteMediaItems(from mediaUrls: [String]) -> [RemoteMediaItem] {
    mediaUrls.reduce(into: [RemoteMediaItem]()) { result, mediaUrl in
        guard let url = resolveRemoteURL(mediaUrl) else { return }
        let item = RemoteMediaItem(
            id: url.absoluteString,
            url: url,
            kind: isVideoURL(mediaUrl) ? .video : .image,
            originalValue: mediaUrl
        )
        guard !result.contains(where: { $0.id == item.id }) else { return }
        result.append(item)
    }
}

struct RemoteMediaGrid: View {
    let mediaUrls: [String]
    let isMine: Bool

    @State private var mediaPresentation: RemoteMediaPresentation?

    private var items: [RemoteMediaItem] {
        resolvedRemoteMediaItems(from: mediaUrls)
    }

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], spacing: 8) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                Button {
                    mediaPresentation = RemoteMediaPresentation(items: items, initialIndex: index)
                } label: {
                    RemoteMediaThumbnailCard(item: item, height: 110, showMineAccent: isMine)
                }
                .buttonStyle(.plain)
            }
        }
        .fullScreenCover(item: $mediaPresentation) { presentation in
            RemoteMediaGalleryView(presentation: presentation)
        }
    }
}

struct RemoteMediaThumbnailCard: View {
    let item: RemoteMediaItem
    let height: CGFloat
    let showMineAccent: Bool

    var body: some View {
        ZStack {
            if item.kind == .video {
                RemoteVideoThumbnailView(url: item.url)
                LinearGradient(
                    colors: [Color.black.opacity(0.02), Color.black.opacity(0.32)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                VStack {
                    Spacer()
                    HStack {
                        Image(systemName: "play.circle.fill")
                            .font(.system(size: 28, weight: .regular))
                            .foregroundColor(.white)
                        Spacer()
                    }
                    .padding(10)
                }
            } else {
                AsyncImage(url: item.url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure(_):
                        ZStack {
                            Color.zymSurfaceSoft
                            Image(systemName: "exclamationmark.triangle")
                                .foregroundColor(Color.zymSubtext)
                        }
                    case .empty:
                        ZStack {
                            Color.zymSurfaceSoft
                            ProgressView()
                        }
                    @unknown default:
                        Color.zymSurfaceSoft
                    }
                }
            }
        }
        .frame(height: height)
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(showMineAccent ? Color.white.opacity(0.12) : Color.zymLine.opacity(0.35), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

struct RemoteVideoThumbnailView: View {
    let url: URL

    @State private var image: UIImage?

    var body: some View {
        SwiftUI.Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                ZStack {
                    Color.black.opacity(0.9)
                    ProgressView()
                        .tint(.white)
                }
            }
        }
        .task(id: url) {
            await loadThumbnail()
        }
    }

    private func loadThumbnail() async {
        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 1200, height: 1200)

        let time = CMTime(seconds: 0.1, preferredTimescale: 600)
        if let cgImage = try? generator.copyCGImage(at: time, actualTime: nil) {
            await MainActor.run {
                image = UIImage(cgImage: cgImage)
            }
        }
    }
}

struct RemoteMediaGalleryView: View {
    let presentation: RemoteMediaPresentation

    @Environment(\.dismiss) private var dismiss
    @State private var selection: Int

    init(presentation: RemoteMediaPresentation) {
        self.presentation = presentation
        _selection = State(initialValue: presentation.initialIndex)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            TabView(selection: $selection) {
                ForEach(Array(presentation.items.enumerated()), id: \.element.id) { index, item in
                    ZStack {
                        Color.black.ignoresSafeArea()
                        if item.kind == .video {
                            NativeVideoPlayerView(url: item.url)
                                .ignoresSafeArea()
                        } else {
                            RemoteFullscreenImageView(url: item.url)
                                .ignoresSafeArea()
                        }
                    }
                    .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))

            VStack {
                HStack {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 28, weight: .medium))
                            .foregroundColor(.white.opacity(0.92))
                    }
                    .buttonStyle(.plain)

                    Spacer()

                    if presentation.items.count > 1 {
                        Text("\(selection + 1) / \(presentation.items.count)")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.white.opacity(0.9))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(Color.white.opacity(0.12))
                            .clipShape(Capsule())
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 12)

                Spacer()
            }
        }
    }
}

struct RemoteFullscreenImageView: View {
    let url: URL

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                Color.black
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFit()
                            .frame(width: proxy.size.width, height: proxy.size.height)
                    case .failure(_):
                        VStack(spacing: 10) {
                            Image(systemName: "photo")
                                .font(.system(size: 28))
                            Text("Could not load media")
                                .font(.system(size: 14, weight: .medium))
                        }
                        .foregroundColor(.white.opacity(0.82))
                    case .empty:
                        ProgressView()
                            .tint(.white)
                    @unknown default:
                        EmptyView()
                    }
                }
            }
        }
    }
}

struct NativeVideoPlayerView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let controller = AVPlayerViewController()
        controller.showsPlaybackControls = true
        controller.player = AVPlayer(url: url)
        controller.player?.play()
        return controller
    }

    func updateUIViewController(_ uiViewController: AVPlayerViewController, context: Context) {}

    static func dismantleUIViewController(_ uiViewController: AVPlayerViewController, coordinator: ()) {
        uiViewController.player?.pause()
        uiViewController.player = nil
    }
}

struct DraftAttachmentPreview: View {
    let attachment: DraftAttachment

    var body: some View {
        ZStack {
            if attachment.kind == .image, let uiImage = UIImage(data: attachment.data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
            } else if attachment.kind == .video, let previewURL = attachment.previewURL {
                VideoPlayer(player: AVPlayer(url: previewURL))
            } else {
                Color.zymSurfaceSoft
                VStack(spacing: 4) {
                    Image(systemName: attachment.kind == .video ? "video.fill" : "doc.fill")
                        .font(.system(size: 20))
                        .foregroundColor(Color.zymPrimary)
                    Text(attachment.kind == .video ? "Video" : "File")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(Color.zymSubtext)
                }
            }
        }
        .frame(width: 76, height: 76)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct TypingIndicatorRow: View {
    let label: String
    let isCoach: Bool
    let coachId: String?
    let avatarURL: String?
    let fallbackText: String

    var body: some View {
        HStack(alignment: .bottom, spacing: 10) {
            ConversationAvatarBadge(
                isCoach: isCoach,
                coachId: coachId ?? "zj",
                avatarURL: avatarURL,
                fallbackText: fallbackText
            )
            TypingIndicatorPill(label: label)
        }
    }
}

struct TypingIndicatorPill: View {
    let label: String
    @State private var pulse = false

    var body: some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(Color.zymSubtext)

            HStack(spacing: 4) {
                Circle().frame(width: 6, height: 6)
                Circle().frame(width: 6, height: 6)
                Circle().frame(width: 6, height: 6)
            }
            .foregroundColor(Color.zymSubtext.opacity(0.52))
            .scaleEffect(pulse ? 1 : 0.85)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color.white.opacity(0.96))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: Color.black.opacity(0.04), radius: 8, x: 0, y: 4)
        .onAppear {
            withAnimation(.easeInOut(duration: 0.82).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
    }
}

struct GroupMembersSheet: View {
    let members: [ConversationGroupMember]
    @Binding var inviteUsername: String
    let isPending: Bool
    let canManageMembers: Bool
    let onRefresh: () -> Void
    let onInvite: () -> Void
    let onRemove: (ConversationGroupMember) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                VStack(spacing: 12) {
                    HStack {
                        Text("Members")
                            .font(.custom("Syne", size: 20))
                            .foregroundColor(Color.zymText)
                        Spacer()
                        if isPending {
                            ProgressView()
                        }
                    }

                    ScrollView {
                        VStack(spacing: 8) {
                            ForEach(members) { member in
                                HStack {
                                    Text(member.username)
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundColor(Color.zymText)
                                    Spacer()
                                    HStack(spacing: 8) {
                                        Text(member.role)
                                            .font(.system(size: 11, weight: .medium))
                                            .foregroundColor(Color.zymSubtext)
                                        if canManageMembers && member.role != "owner" {
                                            Button(action: { onRemove(member) }) {
                                                Text("Remove")
                                                    .font(.system(size: 11, weight: .semibold))
                                            }
                                            .buttonStyle(ZYMGhostButton())
                                            .disabled(isPending)
                                        }
                                    }
                                }
                                .zymCard()
                            }
                        }
                    }

                    VStack(spacing: 8) {
                        TextField("Invite by username", text: $inviteUsername)
                            .padding(12)
                            .background(Color.zymSurface)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color.zymLine, lineWidth: 1)
                            )
                            .cornerRadius(12)

                        HStack(spacing: 8) {
                            Button("Refresh", action: onRefresh)
                                .buttonStyle(ZYMGhostButton())
                            Button("Invite", action: onInvite)
                                .buttonStyle(ZYMPrimaryButton())
                                .disabled(isPending)
                        }
                    }
                }
                .padding(16)
            }
            .navigationTitle("Group")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

func isVideoURL(_ url: String) -> Bool {
    let lower = url.lowercased()
    return lower.contains(".mp4") || lower.contains(".mov") || lower.contains(".webm") || lower.contains(".m4v")
}

struct Message: Identifiable, Decodable {
    let id: Int
    let topic: String?
    let from_user_id: Int
    let content: String?
    let created_at: String
    let username: String
    let avatar_url: String?
    let media_urls: [String]?
    let is_coach: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case topic
        case from_user_id
        case content
        case content_b64
        case created_at
        case username
        case avatar_url
        case media_urls
        case is_coach
    }

    init(
        id: Int,
        topic: String?,
        from_user_id: Int,
        content: String?,
        created_at: String,
        username: String,
        avatar_url: String?,
        media_urls: [String]?,
        is_coach: Bool
    ) {
        self.id = id
        self.topic = topic
        self.from_user_id = from_user_id
        self.content = content
        self.created_at = created_at
        self.username = username
        self.avatar_url = avatar_url
        self.media_urls = media_urls
        self.is_coach = is_coach
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let rawContent = try container.decodeIfPresent(String.self, forKey: .content)
        let contentB64 = try container.decodeIfPresent(String.self, forKey: .content_b64)
        self.init(
            id: try container.decode(Int.self, forKey: .id),
            topic: try container.decodeIfPresent(String.self, forKey: .topic),
            from_user_id: try container.decode(Int.self, forKey: .from_user_id),
            content: stringFromUTF8Base64(contentB64) ?? rawContent,
            created_at: try container.decode(String.self, forKey: .created_at),
            username: try container.decode(String.self, forKey: .username),
            avatar_url: try container.decodeIfPresent(String.self, forKey: .avatar_url),
            media_urls: try container.decodeIfPresent([String].self, forKey: .media_urls),
            is_coach: try container.decode(Bool.self, forKey: .is_coach)
        )
    }
}

struct MessagesResponse: Decodable {
    let messages: [Message]
}

struct ConversationGroupMember: Identifiable, Codable {
    let id: Int
    let username: String
    let avatar_url: String?
    let role: String
}

struct GroupMembersResponse: Codable {
    let members: [ConversationGroupMember]
}

struct ConversationPublicProfileResponse: Codable {
    let visibility: String
    let isFriend: Bool
    let friendship_status: String
    let profile: ConversationPublicProfile
    let today_health: ConversationPublicHealth?
    let recent_posts: [ConversationPublicPost]
}

struct ConversationPublicProfile: Codable {
    let id: Int
    let username: String
    let avatar_url: String?
    let background_url: String?
    let bio: String?
    let fitness_goal: String?
    let hobbies: String?
    let selected_coach: String?
}

struct ConversationPublicHealth: Codable {
    let date: String
    let steps: Int
    let calories_burned: Int
    let active_minutes: Int
    let synced_at: String
}

struct ConversationPublicPost: Codable, Identifiable {
    let id: Int
    let user_id: Int
    let type: String
    let content: String?
    let media_urls: [String]
    let reaction_count: Int
    let created_at: String
}

struct ConversationProfileSheet: View {
    let conversation: Conversation
    let appCoach: String
    let profile: ConversationPublicProfileResponse?
    let loading: Bool
    let primaryActionLabel: String?
    let primaryActionEnabled: Bool
    let primaryActionPending: Bool
    let onPrimaryAction: (() -> Void)?
    let canReportUser: Bool
    let reportPending: Bool
    let onReportUser: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var mediaPresentation: RemoteMediaPresentation?

    private var coachName: String {
        appCoach == "lc" ? "LC Coach" : "ZJ Coach"
    }

    private var profileMediaItems: [RemoteMediaItem] {
        guard let profile else { return [] }
        return resolvedRemoteMediaItems(
            from: [
                profile.profile.background_url,
                profile.profile.avatar_url,
            ].compactMap { value in
                guard let value, !value.isEmpty else { return nil }
                return value
            }
        )
    }

    private func presentProfileMedia(startingWith originalValue: String?) {
        guard !profileMediaItems.isEmpty else { return }
        let initialIndex = profileMediaItems.firstIndex(where: { $0.originalValue == originalValue }) ?? 0
        mediaPresentation = RemoteMediaPresentation(items: profileMediaItems, initialIndex: initialIndex)
    }

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 12) {
                        if conversation.isCoach {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(coachName)
                                    .font(.custom("Syne", size: 28))
                                    .foregroundColor(Color.zymText)
                                Text(appCoach == "lc"
                                     ? "Strict, direct, execution-first coaching style."
                                     : "Encouraging, supportive, habit-first coaching style.")
                                    .font(.system(size: 14))
                                    .foregroundColor(Color.zymSubtext)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(16)
                            .background(
                                LinearGradient(
                                    colors: [Color.white.opacity(0.96), Color.zymBackgroundSoft.opacity(0.92)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .stroke(Color.zymLine, lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .shadow(color: Color.black.opacity(0.08), radius: 14, x: 0, y: 8)
                        } else if loading {
                            ProgressView("Loading profile...")
                                .padding(.top, 18)
                        } else if let profile {
                            if let coverURL = profile.profile.background_url, let url = resolveRemoteURL(coverURL) {
                                Button {
                                    presentProfileMedia(startingWith: coverURL)
                                } label: {
                                    AsyncImage(url: url) { phase in
                                        switch phase {
                                        case .success(let image):
                                            image.resizable().scaledToFill()
                                        default:
                                            Color.zymSurfaceSoft
                                        }
                                    }
                                }
                                .frame(height: 150)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .buttonStyle(.plain)
                            }

                            HStack(spacing: 12) {
                                if let avatarURL = profile.profile.avatar_url, let url = resolveRemoteURL(avatarURL) {
                                    Button {
                                        presentProfileMedia(startingWith: avatarURL)
                                    } label: {
                                        AsyncImage(url: url) { phase in
                                            switch phase {
                                            case .success(let image):
                                                image.resizable().scaledToFill()
                                            default:
                                                Circle().fill(Color.zymSurfaceSoft)
                                            }
                                        }
                                    }
                                    .frame(width: 62, height: 62)
                                    .clipShape(Circle())
                                    .buttonStyle(.plain)
                                } else {
                                    Circle()
                                        .fill(Color.zymPrimary)
                                        .frame(width: 62, height: 62)
                                        .overlay(
                                            Text(String(profile.profile.username.prefix(2)).uppercased())
                                                .foregroundColor(.white)
                                                .font(.system(size: 14, weight: .bold))
                                        )
                                }

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(profile.profile.username)
                                        .font(.custom("Syne", size: 26))
                                        .foregroundColor(Color.zymText)
                                    Text("User ID: \(profile.profile.id)")
                                        .font(.system(size: 12))
                                        .foregroundColor(Color.zymSubtext)
                                }
                                Spacer()
                            }
                            .zymCard()

                            HStack(spacing: 8) {
                                if let primaryActionLabel {
                                    if primaryActionEnabled {
                                        Button(action: { onPrimaryAction?() }) {
                                            Text(primaryActionPending ? "Working..." : primaryActionLabel)
                                                .frame(maxWidth: .infinity)
                                        }
                                        .buttonStyle(ZYMPrimaryButton())
                                        .disabled(primaryActionPending || onPrimaryAction == nil)
                                    } else {
                                        Button(action: { onPrimaryAction?() }) {
                                            Text(primaryActionPending ? "Working..." : primaryActionLabel)
                                                .frame(maxWidth: .infinity)
                                        }
                                        .buttonStyle(ZYMGhostButton())
                                        .disabled(true)
                                    }
                                }

                                if canReportUser {
                                    Button(action: onReportUser) {
                                        Text(reportPending ? "Reporting..." : "Report")
                                            .frame(maxWidth: .infinity)
                                    }
                                    .buttonStyle(ZYMGhostButton())
                                    .disabled(reportPending)
                                }
                            }

                            VStack(alignment: .leading, spacing: 6) {
                                Text("Bio: \(profile.profile.bio ?? "Not set")")
                                    .font(.system(size: 14))
                                    .foregroundColor(Color.zymText)
                                Text("Goal: \(profile.profile.fitness_goal ?? "Not set")")
                                    .font(.system(size: 14))
                                    .foregroundColor(Color.zymText)
                                Text("Hobbies: \(profile.profile.hobbies ?? "Not set")")
                                    .font(.system(size: 14))
                                    .foregroundColor(Color.zymText)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .zymCard()

                            VStack(alignment: .leading, spacing: 8) {
                                Text("Recent Posts")
                                    .font(.custom("Syne", size: 18))
                                    .foregroundColor(Color.zymText)
                                if profile.recent_posts.isEmpty {
                                    Text("No posts yet")
                                        .font(.system(size: 13))
                                        .foregroundColor(Color.zymSubtext)
                                } else {
                                    ForEach(profile.recent_posts.prefix(6)) { post in
                                        VStack(alignment: .leading, spacing: 6) {
                                            if let content = post.content, !content.isEmpty {
                                                Text(content)
                                                    .font(.system(size: 14))
                                                    .foregroundColor(Color.zymText)
                                            }
                                            Text("\(post.reaction_count) likes")
                                                .font(.system(size: 12))
                                                .foregroundColor(Color.zymSubtext)
                                        }
                                        .zymCard()
                                    }
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        } else {
                            Text("Profile unavailable.")
                                .font(.system(size: 14))
                                .foregroundColor(Color.zymSubtext)
                        }
                    }
                    .padding(14)
                }
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .fullScreenCover(item: $mediaPresentation) { presentation in
            RemoteMediaGalleryView(presentation: presentation)
        }
    }
}
