import SwiftUI
import PhotosUI
import AVKit
import UniformTypeIdentifiers

enum PostAttachmentKind {
    case image
    case video
    case unknown
}

private let defaultCommunityPostVisibility = "friends"
private let defaultHotHashtags = ["gymcheck", "mealprep", "recovery", "mobility", "legday", "habits"]

private func createPostHashtagSuggestions(from content: String) -> [String] {
    let tokens = content
        .lowercased()
        .replacingOccurrences(of: "#[a-z0-9_]+", with: " ", options: .regularExpression)
        .replacingOccurrences(of: "[^a-z0-9\\s]", with: " ", options: .regularExpression)
        .components(separatedBy: .whitespacesAndNewlines)
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { $0.count >= 3 }

    let counts = Dictionary(tokens.map { ($0, 1) }, uniquingKeysWith: +)
    let keywords = counts
        .sorted { lhs, rhs in
            if lhs.value != rhs.value { return lhs.value > rhs.value }
            return lhs.key.count > rhs.key.count
        }
        .map(\.key)

    return keywords.isEmpty ? defaultHotHashtags : Array(keywords.prefix(6))
}

private func appendCreatePostHashtag(_ content: String, hashtag: String) -> String {
    let normalized = hashtag.replacingOccurrences(of: "#", with: "").lowercased()
    guard !normalized.isEmpty else { return content }
    if content.range(of: "(^|\\s)#\(normalized)(?=\\s|$)", options: .regularExpression) != nil {
        return content
    }
    let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? "#\(normalized)" : "\(trimmed) #\(normalized)"
}

struct PostDraftAttachment: Identifiable {
    let id = UUID()
    let data: Data
    let kind: PostAttachmentKind
    let filename: String
    let contentType: String
    let previewURL: URL?
}

struct CreatePostView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var appState: AppState
    @State private var content = ""
    @State private var selectedMedia: [PhotosPickerItem] = []
    @State private var draftAttachments: [PostDraftAttachment] = []
    @State private var isPosting = false
    @State private var selectedLocation: SharedLocationSelectionPayload?
    @State private var showLocationSheet = false
    @State private var shareLocationWithNearby = true
    @State private var composerStatusText = ""
    @StateObject private var locationCoordinator = AppLocationPermissionCoordinator()
    let onPost: () -> Void

    private var hashtagSuggestions: [String] {
        createPostHashtagSuggestions(from: content)
    }

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                VStack(spacing: 14) {
                    TextField("What's on your mind?", text: $content, axis: .vertical)
                        .foregroundColor(Color.zymText)
                        .padding(12)
                        .background(Color.zymSurface)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.zymLine, lineWidth: 1)
                        )
                        .cornerRadius(12)
                        .lineLimit(5...10)

                    HStack(spacing: 8) {
                        PhotosPicker(selection: $selectedMedia, maxSelectionCount: 5, matching: .any(of: [.images, .videos])) {
                            HStack(spacing: 6) {
                                Image(systemName: "photo.on.rectangle.angled")
                                Text("Media")
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(ZYMGhostButton())
                        .onChange(of: selectedMedia) { _, _ in
                            loadMedia()
                        }

                        Button(action: {
                            if let first = hashtagSuggestions.first {
                                content = appendCreatePostHashtag(content, hashtag: first)
                            }
                        }) {
                            HStack(spacing: 6) {
                                Text("#").font(.system(size: 15, weight: .bold))
                                Text("Hashtag")
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(ZYMGhostButton())

                        Button(action: {
                            showLocationSheet = true
                        }) {
                            HStack(spacing: 6) {
                                Image(systemName: "location.north.line")
                                Text(selectedLocation == nil ? "Location" : "Edit")
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(ZYMGhostButton())
                    }

                    if let selectedLocation {
                        HStack(spacing: 8) {
                            Image(systemName: "location.fill")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(Color.zymPrimary)
                            Text(selectedLocation.label)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(Color.zymText)
                            Spacer()
                            Button("Clear") {
                                self.selectedLocation = nil
                            }
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Color.zymSubtext)
                        }
                        .padding(12)
                        .background(Color.white.opacity(0.9))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }

                    if !hashtagSuggestions.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(hashtagSuggestions, id: \.self) { tag in
                                    Button(action: {
                                        content = appendCreatePostHashtag(content, hashtag: tag)
                                    }) {
                                        Text("#\(tag)")
                                            .font(.system(size: 12, weight: .semibold))
                                    }
                                    .buttonStyle(ZYMGhostButton())
                                }
                            }
                        }
                    }

                    if !draftAttachments.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(draftAttachments) { attachment in
                                    if attachment.kind == .image, let uiImage = UIImage(data: attachment.data) {
                                        Image(uiImage: uiImage)
                                            .resizable()
                                            .scaledToFill()
                                            .frame(width: 100, height: 100)
                                            .cornerRadius(8)
                                    } else if attachment.kind == .video, let previewURL = attachment.previewURL {
                                        VideoPlayer(player: AVPlayer(url: previewURL))
                                            .frame(width: 100, height: 100)
                                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                    } else {
                                        ZStack {
                                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                                .fill(Color.zymSurfaceSoft)
                                            Image(systemName: "doc")
                                                .foregroundColor(Color.zymSubtext)
                                        }
                                        .frame(width: 100, height: 100)
                                    }
                                }
                            }
                        }
                    }

                    if !composerStatusText.isEmpty {
                        Text(composerStatusText)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Color.zymPrimary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Spacer()
                }
                .padding(18)
            }
            .navigationTitle("Create Post")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        clearDraftAttachments()
                        dismiss()
                    }
                        .foregroundColor(Color.zymSubtext)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Post") { createPost() }
                        .disabled(isPosting || (content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && draftAttachments.isEmpty))
                        .foregroundColor(Color.zymPrimary)
                }
            }
            .onDisappear {
                clearDraftAttachments()
            }
            .sheet(isPresented: $showLocationSheet) {
                PostLocationSheet(
                    selectedLocation: selectedLocation,
                    shareLocationWithNearby: shareLocationWithNearby,
                    onSaved: { selection, alsoShare in
                        selectedLocation = selection
                        shareLocationWithNearby = alsoShare
                        composerStatusText = "Location updated."
                    },
                    locationCoordinator: locationCoordinator
                )
                .environmentObject(appState)
            }
        }
    }

    func loadMedia() {
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
                            PostDraftAttachment(
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

    func createPost() {
        guard let userId = appState.userId else { return }
        if isPosting { return }

        isPosting = true

        var mediaUrls: [String] = []
        var mediaIds: [String] = []
        let group = DispatchGroup()

        for attachment in draftAttachments {
            group.enter()
            uploadMedia(attachment) { response in
                DispatchQueue.main.async {
                    if let response {
                        let resolvedURL = response.path.isEmpty ? (response.url ?? response.path) : response.path
                        if !resolvedURL.isEmpty {
                            mediaUrls.append(resolvedURL)
                        }
                        if let mediaId = response.mediaId, !mediaId.isEmpty {
                            mediaIds.append(mediaId)
                        } else if let assetId = response.assetId, !assetId.isEmpty {
                            mediaIds.append(assetId)
                        }
                    }
                    group.leave()
                }
            }
        }

        group.notify(queue: .main) {
            let trimmedContent = content.trimmingCharacters(in: .whitespacesAndNewlines)
            if mediaUrls.isEmpty && mediaIds.isEmpty && trimmedContent.isEmpty && !draftAttachments.isEmpty {
                self.isPosting = false
                return
            }
            guard let url = apiURL("/community/post") else {
                self.isPosting = false
                return
            }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            applyAuthorizationHeader(&request, token: self.appState.token)
            var body: [String: Any] = [
                "userId": userId,
                "type": mediaUrls.isEmpty ? "text" : "media",
                "content": trimmedContent,
                "mediaUrls": mediaUrls,
                "mediaIds": mediaIds,
                "visibility": defaultCommunityPostVisibility,
            ]
            if let selectedLocation {
                body["locationLabel"] = selectedLocation.label
                body["locationCity"] = selectedLocation.city
                body["locationLatitude"] = selectedLocation.latitude
                body["locationLongitude"] = selectedLocation.longitude
                body["locationPrecision"] = selectedLocation.precision
            }
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
            authorizedDataTask(appState: self.appState, request: request) { _, _, _ in
                DispatchQueue.main.async {
                    self.isPosting = false
                    self.clearDraftAttachments()
                    self.selectedLocation = nil
                    self.composerStatusText = ""
                    self.onPost()
                    self.dismiss()
                }
            }.resume()
        }
    }

    func uploadMedia(_ attachment: PostDraftAttachment, completion: @escaping (UploadResponse?) -> Void) {
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

    func requestUploadIntent(for attachment: PostDraftAttachment, completion: @escaping (UploadIntentResponse?) -> Void) {
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
            "source": "ios_community_post",
            "visibility": defaultCommunityPostVisibility,
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

    func finalizeUploadedMedia(assetId: String, completion: @escaping (UploadResponse?) -> Void) {
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

    func shouldAuthorizeUploadTarget(_ url: URL) -> Bool {
        guard let apiBase = apiURL("/") else { return false }
        return url.host == apiBase.host && url.port == apiBase.port
    }

    func uploadMediaLegacy(_ attachment: PostDraftAttachment, completion: @escaping (UploadResponse?) -> Void) {
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
        body.append("ios_community_post\r\n".data(using: .utf8)!)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"visibility\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(defaultCommunityPostVisibility)\r\n".data(using: .utf8)!)
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

    func clearDraftAttachments(resetSelection: Bool = true) {
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

    func makeTempPreviewURL(for data: Data, fileExtension: String) -> URL? {
        let ext = fileExtension.isEmpty ? "mov" : fileExtension
        let fileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("zym-post-preview-\(UUID().uuidString)")
            .appendingPathExtension(ext)
        do {
            try data.write(to: fileURL, options: .atomic)
            return fileURL
        } catch {
            return nil
        }
    }
}

struct PostLocationSheet: View {
    let selectedLocation: SharedLocationSelectionPayload?
    let shareLocationWithNearby: Bool
    let onSaved: (SharedLocationSelectionPayload?, Bool) -> Void
    @ObservedObject var locationCoordinator: AppLocationPermissionCoordinator
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var appState: AppState
    @State private var query = ""
    @State private var results: [SharedLocationSelectionPayload] = []
    @State private var loading = false
    @State private var saving = false
    @State private var shareNearby = true
    @State private var statusText = ""

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                VStack(alignment: .leading, spacing: 14) {
                    Text("Add a city or a more precise area to this post. You can also sync it to nearby discovery.")
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

                    Toggle(isOn: $shareNearby) {
                        Text("Also use this for nearby discovery")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(Color.zymText)
                    }
                    .tint(Color.zymPrimary)

                    if let selectedLocation {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(selectedLocation.label)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(Color.zymText)
                                Text(selectedLocation.precision == "city" ? "City-level" : "Precise")
                                    .font(.system(size: 12))
                                    .foregroundColor(Color.zymSubtext)
                            }
                            Spacer()
                            Button("Remove") {
                                onSaved(nil, shareNearby)
                                dismiss()
                            }
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Color.zymPrimary)
                        }
                        .padding(12)
                        .background(Color.white.opacity(0.9))
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }

                    TextField("Search city or neighborhood", text: $query)
                        .padding(12)
                        .background(Color.zymSurface)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
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
                                    saveSelection(result)
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
            .navigationTitle("Post Location")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") { dismiss() }
                }
            }
            .onAppear {
                shareNearby = shareLocationWithNearby
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
            saveSelection(selection)
        }.resume()
    }

    private func saveSelection(_ selection: SharedLocationSelectionPayload) {
        saving = true
        if !shareNearby {
            DispatchQueue.main.async {
                saving = false
                onSaved(selection, false)
                dismiss()
            }
            return
        }

        guard let userId = appState.userId,
              let url = apiURL("/location/profile") else {
            saving = false
            return
        }

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

        authorizedDataTask(appState: appState, request: request) { _, response, _ in
            DispatchQueue.main.async {
                saving = false
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard (200...299).contains(statusCode) else {
                    statusText = "Failed to sync nearby location."
                    return
                }
                onSaved(selection, true)
                dismiss()
            }
        }.resume()
    }
}
