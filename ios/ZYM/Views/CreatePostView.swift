import SwiftUI
import PhotosUI
import AVKit
import UniformTypeIdentifiers

enum PostAttachmentKind {
    case image
    case video
    case unknown
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
    let onPost: () -> Void

    var body: some View {
        NavigationView {
            ZStack {
                Color.zymBackground.ignoresSafeArea()

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

                    PhotosPicker(selection: $selectedMedia, maxSelectionCount: 5, matching: .any(of: [.images, .videos])) {
                        HStack {
                            Image(systemName: "photo.on.rectangle.angled")
                            Text("Add Media")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(ZYMGhostButton())
                    .onChange(of: selectedMedia) { _, _ in
                        loadMedia()
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
        }
    }

    func loadMedia() {
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
        let group = DispatchGroup()

        for attachment in draftAttachments {
            group.enter()
            uploadMedia(attachment) { url in
                if let url = url {
                    mediaUrls.append(url)
                }
                group.leave()
            }
        }

        group.notify(queue: .main) {
            guard let url = apiURL("/community/post") else {
                isPosting = false
                return
            }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            applyAuthorizationHeader(&request, token: appState.token)
            let body = [
                "userId": userId,
                "type": mediaUrls.isEmpty ? "text" : "media",
                "content": content.trimmingCharacters(in: .whitespacesAndNewlines),
                "mediaUrls": mediaUrls
            ] as [String : Any]
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
            authorizedDataTask(appState: appState, request: request) { _, _, _ in
                DispatchQueue.main.async {
                    isPosting = false
                    clearDraftAttachments()
                    onPost()
                    dismiss()
                }
            }.resume()
        }
    }

    func uploadMedia(_ attachment: PostDraftAttachment, completion: @escaping (String?) -> Void) {
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

        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            guard let data = data,
                  let response = try? JSONDecoder().decode(UploadResponse.self, from: data) else {
                completion(nil)
                return
            }
            completion(response.path.isEmpty ? (response.url ?? response.path) : response.path)
        }.resume()
    }

    func clearDraftAttachments() {
        for attachment in draftAttachments {
            if let previewURL = attachment.previewURL {
                try? FileManager.default.removeItem(at: previewURL)
            }
        }
        draftAttachments = []
        selectedMedia = []
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
