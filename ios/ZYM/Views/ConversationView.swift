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
    @State private var coachReplyPending = false
    @State private var infoNotice = ""
    @State private var showProfileSheet = false
    @State private var profileLoading = false
    @State private var viewedProfile: ConversationPublicProfileResponse?

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
            Color.zymBackground.ignoresSafeArea()

            VStack(spacing: 0) {
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

                        if coachReplyPending {
                            HStack {
                                Label("Coach mention sent, waiting for reply...", systemImage: "sparkles")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(Color.zymPrimaryDark)
                                Spacer()
                            }
                            .padding(10)
                            .background(Color.zymSurfaceSoft)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .padding(.horizontal, 12)
                            .zymAppear(delay: 0.02)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 10)
                }

                VStack(spacing: 8) {
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

                        TextField("Type message...", text: $newMessage)
                            .padding(12)
                            .background(Color.zymSurface)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color.zymLine, lineWidth: 1)
                            )
                            .cornerRadius(12)

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

                    if !infoNotice.isEmpty {
                        HStack {
                            Text(infoNotice)
                                .font(.system(size: 12))
                                .foregroundColor(Color.zymPrimaryDark)
                            Spacer()
                        }
                        .padding(.horizontal, 14)
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
        .navigationTitle(conversation.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button(action: openProfileSheet) {
                    HStack(spacing: 8) {
                        if let avatar = conversation.avatarUrl, let url = URL(string: avatar) {
                            AsyncImage(url: url) { phase in
                                switch phase {
                                case .success(let image):
                                    image
                                        .resizable()
                                        .scaledToFill()
                                default:
                                    Circle()
                                        .fill(conversation.isCoach ? Color.zymPrimary : Color.zymSurfaceSoft)
                                }
                            }
                            .frame(width: 32, height: 32)
                            .clipShape(Circle())
                        } else {
                            Circle()
                                .fill(conversation.isCoach ? Color.zymPrimary : Color.zymSurfaceSoft)
                                .frame(width: 32, height: 32)
                                .overlay(
                                    Text(conversation.isCoach
                                         ? ((appState.selectedCoach ?? "zj").uppercased())
                                         : String(conversation.name.prefix(2)).uppercased())
                                        .font(.system(size: 10, weight: .bold))
                                        .foregroundColor(conversation.isCoach ? .white : Color.zymPrimary)
                                )
                        }
                    }
                }
                .disabled(conversation.isGroup)
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
        }
        .sheet(isPresented: $showProfileSheet) {
            ConversationProfileSheet(
                conversation: conversation,
                appCoach: appState.selectedCoach ?? "zj",
                profile: viewedProfile,
                loading: profileLoading
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

                if mapped.from_user_id == 0 {
                    coachReplyPending = false
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
        URLSession.shared.dataTask(with: request) { data, _, _ in
            guard let data = data,
                  let response = try? JSONDecoder().decode(MessagesResponse.self, from: data) else { return }
            DispatchQueue.main.async {
                withAnimation(.zymSoft) {
                    messages = response.messages
                }
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
        clearDraftAttachments()
        for item in selectedMedia {
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
                    mediaUrls.append(response.url ?? response.path)
                    if let mediaId = response.mediaId, !mediaId.isEmpty {
                        mediaIds.append(mediaId)
                    }
                    lock.unlock()
                }
                group.leave()
            }
        }

        group.notify(queue: .main) {
            sendTextMessage(userId: userId, mediaUrls: mediaUrls, mediaIds: mediaIds)
            clearDraftAttachments()
        }
    }

    private func uploadMedia(_ attachment: DraftAttachment, completion: @escaping (UploadResponse?) -> Void) {
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
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(attachment.filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(attachment.contentType)\r\n\r\n".data(using: .utf8)!)
        body.append(attachment.data)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        URLSession.shared.dataTask(with: request) { data, _, _ in
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

        if conversation.isGroup && groupCoachEnabled && trimmed.lowercased().contains("@coach") {
            coachReplyPending = true
        }

        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { _, _, _ in
            DispatchQueue.main.async {
                newMessage = ""
                isSending = false
                lastTypingSent = false
                wsManager.sendTyping(topic: conversation.id, isTyping: false)
                loadMessages()
            }
        }.resume()
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

        URLSession.shared.dataTask(with: request) { data, _, _ in
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

    private func clearDraftAttachments() {
        for attachment in draftAttachments {
            if let previewURL = attachment.previewURL {
                try? FileManager.default.removeItem(at: previewURL)
            }
        }
        draftAttachments = []
        selectedMedia = []
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

        URLSession.shared.dataTask(with: request) { data, _, _ in
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

        URLSession.shared.dataTask(with: request) { data, response, _ in
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

        URLSession.shared.dataTask(with: request) { data, response, _ in
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
                    Text(content)
                        .font(.system(size: 15))
                        .foregroundColor(isMine ? .white : Color.zymText)
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

struct RemoteMediaGrid: View {
    let mediaUrls: [String]
    let isMine: Bool

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], spacing: 8) {
            ForEach(mediaUrls, id: \.self) { mediaUrl in
                if let url = URL(string: mediaUrl) {
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
                Color.zymBackground.ignoresSafeArea()

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
    @Environment(\.dismiss) private var dismiss

    private var coachName: String {
        appCoach == "lc" ? "LC Coach" : "ZJ Coach"
    }

    var body: some View {
        NavigationView {
            ZStack {
                Color.zymBackground.ignoresSafeArea()

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
                            .zymCard()
                        } else if loading {
                            ProgressView("Loading profile...")
                                .padding(.top, 18)
                        } else if let profile {
                            if let coverURL = profile.profile.background_url, let url = URL(string: coverURL) {
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
                                if let avatarURL = profile.profile.avatar_url, let url = URL(string: avatarURL) {
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
