import SwiftUI
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

struct ConversationView: View {
    let conversation: Conversation

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
    @State private var coachWorkspaceMode: CoachWorkspaceMode?
    @State private var infoNotice = ""
    @State private var showProfileSheet = false
    @State private var profileLoading = false
    @State private var viewedProfile: ConversationPublicProfileResponse?
    @State private var profileReportPending = false

    @StateObject private var wsManager = WebSocketManager()
    @EnvironmentObject var appState: AppState

    private var groupId: Int? {
        guard conversation.isGroup, conversation.id.hasPrefix("grp_") else { return nil }
        return Int(conversation.id.replacingOccurrences(of: "grp_", with: ""))
    }

    private var groupCoachEnabled: Bool {
        conversation.coachEnabled != "none"
    }

    private var typingLabel: String {
        let activeTypers = typingUsers.filter { $0.value }.keys
        if activeTypers.isEmpty { return "" }
        if activeTypers.contains("coach") {
            return "\(conversation.name) is typing..."
        }
        return "Someone is typing..."
    }

    var body: some View {
        ZStack {
            ZYMBackgroundLayer().ignoresSafeArea()

            VStack(spacing: 0) {
                if let coachWorkspaceMode, conversation.isCoach {
                    CoachWorkspaceView(
                        mode: coachWorkspaceMode,
                        coachId: appState.selectedCoach ?? "zj",
                        onBackToChat: {
                            withAnimation(.zymSoft) {
                                self.coachWorkspaceMode = nil
                            }
                        },
                        onNotice: { notice in
                            infoNotice = notice
                        },
                        onError: { error in
                            infoNotice = error
                        }
                    )
                    .environmentObject(appState)
                    .transition(.opacity)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(Array(messages.enumerated()), id: \.element.id) { index, msg in
                                ConversationMessageBubble(message: msg, currentUserId: appState.userId ?? 0)
                                    .zymAppear(delay: Double(min(index, 5)) * 0.02)
                            }

                            if !typingLabel.isEmpty {
                                HStack {
                                    TypingIndicator(label: typingLabel)
                                    Spacer()
                                }
                                .padding(.horizontal, 12)
                                .padding(.top, 4)
                                .transition(.opacity)
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.top, 10)
                    }
                }

                if coachWorkspaceMode == nil || !infoNotice.isEmpty {
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

                        if coachWorkspaceMode == nil {
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

                            HStack(spacing: 10) {
                                Button(action: { showMediaPicker = true }) {
                                    Image(systemName: "plus.circle.fill")
                                        .font(.system(size: 24))
                                        .foregroundColor(Color.zymPrimary)
                                }

                                TextField("", text: $newMessage)
                                    .padding(12)
                                    .background(Color.zymSurface)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(Color.zymLine, lineWidth: 1)
                                    )
                                    .cornerRadius(12)
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
                                }
                                .buttonStyle(ZYMPrimaryButton())
                                .disabled(isSending)
                            }
                            .padding(.horizontal, 12)

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
                    }
                    .padding(.bottom, 10)
                    .padding(.top, 6)
                    .background(Color.zymSurface)
                    .overlay(
                        Rectangle()
                            .fill(Color.zymLine)
                            .frame(height: 1),
                        alignment: .top
                    )
                }
            }
        }
        .navigationTitle(conversation.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button(action: openProfileSheet) {
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
                                        .fill(conversation.isCoach ? Color.zymCoachAccent(appState.selectedCoach) : Color.zymSurfaceSoft)
                                }
                            }
                            .frame(width: 32, height: 32)
                            .clipShape(Circle())
                        } else {
                            Circle()
                                .fill(conversation.isCoach ? Color.zymCoachAccent(appState.selectedCoach) : Color.zymSurfaceSoft)
                                .frame(width: 32, height: 32)
                                .overlay(
                                    Text(conversation.isCoach
                                         ? ((appState.selectedCoach ?? "zj").uppercased())
                                         : String(conversation.name.prefix(2)).uppercased())
                                        .font(.system(size: 10, weight: .bold))
                                        .foregroundColor(conversation.isCoach ? .white : Color.zymPrimaryDark)
                                )
                        }
                    }
                }
                .disabled(conversation.isGroup)
            }

            if conversation.isCoach {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Menu {
                        Button("Info") {
                            withAnimation(.zymSoft) {
                                coachWorkspaceMode = .info
                            }
                        }
                        Button("Meals") {
                            withAnimation(.zymSoft) {
                                coachWorkspaceMode = .meals
                            }
                        }
                        Button("Trains") {
                            withAnimation(.zymSoft) {
                                coachWorkspaceMode = .trains
                            }
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .foregroundColor(Color.zymPrimary)
                    }
                }
            } else if groupId != nil {
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
        }
        .sheet(isPresented: $showProfileSheet) {
            ConversationProfileSheet(
                conversation: conversation,
                appCoach: appState.selectedCoach ?? "zj",
                profile: viewedProfile,
                loading: profileLoading,
                canReportUser: !conversation.isCoach && !conversation.isGroup && (conversation.otherUserId != nil),
                reportPending: profileReportPending,
                onReportUser: reportConversationUser
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
                let mapped = Message(
                    id: incomingMessage.id,
                    topic: topic,
                    from_user_id: incomingMessage.from_user_id,
                    content: incomingMessage.content,
                    created_at: createdAt,
                    username: incomingMessage.username ?? (incomingMessage.from_user_id == 0 ? "Coach" : "User"),
                    media_urls: incomingMessage.media_urls ?? []
                )

                if !messages.contains(where: { $0.id == mapped.id }) {
                    withAnimation(.zymSpring) {
                        messages.append(mapped)
                    }
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
                markConversationRead(messageId: response.messages.last?.id)
            }
        }.resume()
    }

    private func sendMessage() {
        guard let userId = appState.userId else { return }
        if isSending { return }
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
        }
        if !mediaUrls.isEmpty {
            body["mediaUrls"] = mediaUrls
        }
        if !mediaIds.isEmpty {
            body["mediaIds"] = mediaIds
        }

        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        authorizedDataTask(appState: appState, request: request) { _, _, _ in
            DispatchQueue.main.async {
                newMessage = ""
                isSending = false
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

    private func openProfileSheet() {
        guard !conversation.isGroup else { return }
        showProfileSheet = true

        if conversation.isCoach {
            profileLoading = false
            viewedProfile = nil
            return
        }

        guard let peerUserId = conversation.otherUserId,
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

    private func reportConversationUser() {
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
            "details": "Reported from iOS conversation profile (\(conversation.id))"
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

struct ConversationMessageBubble: View {
    let message: Message
    let currentUserId: Int

    var body: some View {
        let isMine = message.from_user_id == currentUserId

        return HStack {
            if isMine { Spacer() }

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Text(isMine ? "You" : message.username)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(isMine ? .white.opacity(0.9) : Color.zymSubtext)
                    Text(String(message.created_at.prefix(16)))
                        .font(.system(size: 11))
                        .foregroundColor(isMine ? .white.opacity(0.7) : Color.zymSubtext)
                }

                if let content = message.content {
                    ConversationMarkdownText(content: content, isMine: isMine)
                }

                if let mediaUrls = message.media_urls, !mediaUrls.isEmpty {
                    RemoteMediaGrid(mediaUrls: mediaUrls, isMine: isMine)
                }
            }
            .padding(12)
            .background(isMine ? Color.zymPrimary : Color.zymSurface)
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(isMine ? Color.clear : Color.zymLine, lineWidth: 1)
            )
            .cornerRadius(14)

            if !isMine { Spacer() }
        }
    }
}

private struct ConversationMarkdownText: View {
    let content: String
    let isMine: Bool

    private var attributed: AttributedString? {
        try? AttributedString(
            markdown: content,
            options: AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        )
    }

    var body: some View {
        if let attributed {
            Text(attributed)
                .font(.system(size: 15))
                .foregroundColor(isMine ? .white : Color.zymText)
                .tint(isMine ? Color.white.opacity(0.92) : Color.zymPrimaryDark)
        } else {
            Text(content)
                .font(.system(size: 15))
                .foregroundColor(isMine ? .white : Color.zymText)
                .tint(isMine ? Color.white.opacity(0.92) : Color.zymPrimaryDark)
        }
    }
}

struct RemoteMediaGrid: View {
    let mediaUrls: [String]
    let isMine: Bool

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], spacing: 8) {
            ForEach(mediaUrls, id: \.self) { mediaUrl in
                if let url = resolveRemoteURL(mediaUrl) {
                    ZStack {
                        if isVideoURL(mediaUrl) {
                            VideoPlayer(player: AVPlayer(url: url))
                                .frame(height: 110)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        } else {
                            Link(destination: url) {
                                AsyncImage(url: url) { phase in
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
                                .frame(height: 110)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            }
                        }
                    }
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(isMine ? Color.white.opacity(0.25) : Color.zymLine, lineWidth: 1)
                    )
                }
            }
        }
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
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.zymLine, lineWidth: 1)
        )
    }
}

struct TypingIndicator: View {
    let label: String
    @State private var pulse = false

    var body: some View {
        HStack(spacing: 6) {
            HStack(spacing: 4) {
                Circle().frame(width: 5, height: 5)
                Circle().frame(width: 5, height: 5)
                Circle().frame(width: 5, height: 5)
            }
            .foregroundColor(Color.zymPrimary.opacity(0.75))
            .scaleEffect(pulse ? 1 : 0.85)

            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(Color.zymSubtext)
        }
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

struct Message: Identifiable, Codable {
    let id: Int
    let topic: String?
    let from_user_id: Int
    let content: String?
    let created_at: String
    let username: String
    let media_urls: [String]?
}

struct MessagesResponse: Codable {
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

private struct ConversationProfileSheet: View {
    let conversation: Conversation
    let appCoach: String
    let profile: ConversationPublicProfileResponse?
    let loading: Bool
    let canReportUser: Bool
    let reportPending: Bool
    let onReportUser: () -> Void
    @Environment(\.dismiss) private var dismiss

    private var coachName: String {
        appCoach == "lc" ? "LC Coach" : "ZJ Coach"
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
                                    .foregroundColor(Color.zymCoachInk(appCoach))
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(16)
                            .background(
                                LinearGradient(
                                    colors: [Color.white.opacity(0.96), Color.zymCoachSoft(appCoach).opacity(0.82)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .stroke(Color.zymCoachAccent(appCoach).opacity(0.18), lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .shadow(color: Color.zymCoachAccent(appCoach).opacity(0.12), radius: 14, x: 0, y: 8)
                        } else if loading {
                            ProgressView("Loading profile...")
                                .padding(.top, 18)
                        } else if let profile {
                            if let coverURL = profile.profile.background_url, let url = resolveRemoteURL(coverURL) {
                                AsyncImage(url: url) { phase in
                                    switch phase {
                                    case .success(let image):
                                        image.resizable().scaledToFill()
                                    default:
                                        Color.zymSurfaceSoft
                                    }
                                }
                                .frame(height: 150)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            }

                            HStack(spacing: 12) {
                                if let avatarURL = profile.profile.avatar_url, let url = resolveRemoteURL(avatarURL) {
                                    AsyncImage(url: url) { phase in
                                        switch phase {
                                        case .success(let image):
                                            image.resizable().scaledToFill()
                                        default:
                                            Circle().fill(Color.zymSurfaceSoft)
                                        }
                                    }
                                    .frame(width: 62, height: 62)
                                    .clipShape(Circle())
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

                            if canReportUser {
                                Button(action: onReportUser) {
                                    Text(reportPending ? "Reporting..." : "Report User")
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(ZYMGhostButton())
                                .disabled(reportPending)
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

                            VStack(alignment: .leading, spacing: 6) {
                                Text("Today Health")
                                    .font(.custom("Syne", size: 18))
                                    .foregroundColor(Color.zymText)
                                if let health = profile.today_health {
                                    Text("\(health.steps) steps · \(health.calories_burned) cal")
                                        .font(.system(size: 13))
                                        .foregroundColor(Color.zymSubtext)
                                } else {
                                    Text("No synced health data yet")
                                        .font(.system(size: 13))
                                        .foregroundColor(Color.zymSubtext)
                                }
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
    }
}
