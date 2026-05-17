import SwiftUI
import UIKit

struct WorkoutShareSheet: View {
    let plan: TrainingPlan
    let day: String
    let userDisplayName: String?

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var appState: AppState

    @State private var renderedImage: UIImage?
    @State private var statusText: String?
    @State private var statusKind: StatusKind = .info
    @State private var systemSharePayload: SystemShareSnapshot?
    @State private var showGroupPicker = false

    private enum StatusKind {
        case info
        case error
    }

    private struct SystemShareSnapshot: Identifiable {
        let id = UUID()
        let image: UIImage
    }

    var body: some View {
        NavigationView {
            ZStack {
                Color.zymBackgroundSoft.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 20) {
                        cardPreview
                            .padding(.top, 12)

                        if let statusText {
                            Text(statusText)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(statusKind == .error ? Color.red : Color.zymPrimary)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 10)
                                .background(
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .fill((statusKind == .error ? Color.red : Color.zymPrimary).opacity(0.08))
                                )
                                .padding(.horizontal, 18)
                                .multilineTextAlignment(.center)
                        }

                        VStack(spacing: 12) {
                            shareButton(
                                title: "Share to ZYM Community",
                                subtitle: "Card auto-attached; you can edit the caption.",
                                systemImage: "person.3.fill",
                                tint: Color.zymPrimaryDark,
                                action: shareToCommunity
                            )

                            shareButton(
                                title: "Share to Group Chat",
                                subtitle: "Send the card image to one of your groups.",
                                systemImage: "bubble.left.and.bubble.right.fill",
                                tint: Color(red: 0.38, green: 0.55, blue: 0.92),
                                action: { showGroupPicker = true }
                            )

                            shareButton(
                                title: "Instagram Story",
                                subtitle: "Opens Instagram with the card as your story background.",
                                systemImage: "camera.fill",
                                tint: Color(red: 0.91, green: 0.30, blue: 0.55),
                                action: shareToInstagramStory
                            )

                            shareButton(
                                title: "Save to Photos",
                                subtitle: "Saves the card image to your camera roll.",
                                systemImage: "square.and.arrow.down.fill",
                                tint: Color(red: 0.36, green: 0.74, blue: 0.47),
                                action: saveToPhotos
                            )

                            shareButton(
                                title: "More\u{2026} (X, Facebook, DMs)",
                                subtitle: "Use the iOS share sheet to send anywhere.",
                                systemImage: "square.and.arrow.up",
                                tint: Color.zymPrimary,
                                action: presentSystemShare
                            )
                        }
                        .padding(.horizontal, 18)
                        .padding(.bottom, 24)
                    }
                }
            }
            .navigationTitle("Share workout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Close") { dismiss() }
                }
            }
            .onAppear(perform: ensureRender)
            .sheet(item: $systemSharePayload) { snapshot in
                ShareSheet(activityItems: [snapshot.image])
            }
            .sheet(isPresented: $showGroupPicker) {
                WorkoutGroupPickerSheet(
                    onSelect: { topic in
                        shareToGroup(topic: topic)
                    }
                )
                .environmentObject(appState)
            }
        }
    }

    private var cardPreview: some View {
        ZStack {
            WorkoutShareCard(plan: plan, day: day, userDisplayName: userDisplayName)
                .scaleEffect(0.32, anchor: .center)
                .frame(width: WorkoutShareCard.renderSize.width * 0.32,
                       height: WorkoutShareCard.renderSize.height * 0.32)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .shadow(color: .black.opacity(0.22), radius: 22, x: 0, y: 12)
        }
    }

    private func shareButton(
        title: String,
        subtitle: String,
        systemImage: String,
        tint: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(tint.opacity(0.16))
                        .frame(width: 44, height: 44)
                    Image(systemName: systemImage)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(tint)
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(Color.zymText)
                    Text(subtitle)
                        .font(.system(size: 12))
                        .foregroundColor(Color.zymSubtext)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)

                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Color.zymSubtext)
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Color.white.opacity(0.86))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color.zymLine.opacity(0.6), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    @MainActor
    private func ensureRender() {
        guard renderedImage == nil else { return }
        if let image = WorkoutShareImageRenderer.renderImage(
            for: plan,
            day: day,
            userDisplayName: userDisplayName
        ) {
            renderedImage = image
        }
    }

    @MainActor
    private func renderOrShowError() -> UIImage? {
        if let renderedImage { return renderedImage }
        let image = WorkoutShareImageRenderer.renderImage(
            for: plan,
            day: day,
            userDisplayName: userDisplayName
        )
        if image == nil {
            statusKind = .error
            statusText = "Could not render share card."
        }
        renderedImage = image
        return image
    }

    @MainActor
    private func shareToCommunity() {
        guard let image = renderOrShowError(),
              let pngData = image.pngData() else { return }
        appState.pendingPostInitialContent = defaultCaption()
        appState.pendingPostAttachmentPNG = pngData
        appState.requestedTabIndex = 2
        dismiss()
    }

    @MainActor
    private func shareToInstagramStory() {
        guard let image = renderOrShowError(),
              let pngData = image.pngData() else { return }
        guard let url = URL(string: "instagram-stories://share") else {
            showError("Instagram link unavailable.")
            return
        }
        guard UIApplication.shared.canOpenURL(url) else {
            showError("Instagram is not installed.")
            return
        }
        let items: [[String: Any]] = [
            [
                "com.instagram.sharedSticker.backgroundImage": pngData,
                "com.instagram.sharedSticker.backgroundTopColor": "#0F0524",
                "com.instagram.sharedSticker.backgroundBottomColor": "#0A031C",
            ]
        ]
        let options: [UIPasteboard.OptionsKey: Any] = [
            .expirationDate: Date().addingTimeInterval(60 * 5)
        ]
        UIPasteboard.general.setItems(items, options: options)
        UIApplication.shared.open(url, options: [:]) { success in
            DispatchQueue.main.async {
                if success {
                    dismiss()
                } else {
                    showError("Could not open Instagram.")
                }
            }
        }
    }

    @MainActor
    private func saveToPhotos() {
        guard let image = renderOrShowError() else { return }
        let saver = WorkoutShareImageSaver { result in
            DispatchQueue.main.async {
                switch result {
                case .success:
                    statusKind = .info
                    statusText = "Saved to Photos."
                case .failure(let error):
                    statusKind = .error
                    statusText = "Could not save: \(error.localizedDescription)"
                }
            }
        }
        saver.save(image)
    }

    @MainActor
    private func presentSystemShare() {
        guard let image = renderOrShowError() else { return }
        systemSharePayload = SystemShareSnapshot(image: image)
    }

    private func showError(_ message: String) {
        statusKind = .error
        statusText = message
    }

    @MainActor
    private func shareToGroup(topic: String) {
        guard let image = renderOrShowError(),
              let pngData = image.pngData(),
              let userId = appState.userId else { return }

        statusKind = .info
        statusText = "Uploading to group..."

        guard let uploadURL = apiURL("/media/upload") else {
            showError("Upload URL unavailable.")
            return
        }

        let boundary = UUID().uuidString
        var uploadRequest = URLRequest(url: uploadURL)
        uploadRequest.httpMethod = "POST"
        uploadRequest.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&uploadRequest, token: appState.token)

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"userId\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(userId)\r\n".data(using: .utf8)!)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"workout-card.png\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/png\r\n\r\n".data(using: .utf8)!)
        body.append(pngData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        uploadRequest.httpBody = body

        authorizedDataTask(appState: appState, request: uploadRequest) { data, response, _ in
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard statusCode >= 200 && statusCode < 300,
                  let data = data,
                  let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let mediaUrl = payload["url"] as? String else {
                DispatchQueue.main.async { showError("Failed to upload card image.") }
                return
            }

            let mediaId = payload["mediaId"] as? String

            guard let sendURL = apiURL("/messages/send") else {
                DispatchQueue.main.async { showError("Send URL unavailable.") }
                return
            }

            var sendRequest = URLRequest(url: sendURL)
            sendRequest.httpMethod = "POST"
            sendRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
            applyAuthorizationHeader(&sendRequest, token: appState.token)

            var sendBody: [String: Any] = [
                "fromUserId": userId,
                "topic": topic,
                "content": defaultCaption(),
                "mediaUrls": [mediaUrl],
            ]
            if let mediaId {
                sendBody["mediaIds"] = [mediaId]
            }
            sendRequest.httpBody = try? JSONSerialization.data(withJSONObject: sendBody)

            authorizedDataTask(appState: appState, request: sendRequest) { _, sendResponse, _ in
                DispatchQueue.main.async {
                    let sendStatus = (sendResponse as? HTTPURLResponse)?.statusCode ?? 0
                    if sendStatus >= 200 && sendStatus < 300 {
                        statusKind = .info
                        statusText = "Shared to group!"
                    } else {
                        showError("Failed to send message.")
                    }
                }
            }.resume()
        }.resume()
    }

    private func defaultCaption() -> String {
        let title = plan.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if title.isEmpty {
            return "Today's training is in the books."
        }
        return "Finished today's plan: \(title)"
    }
}

private final class WorkoutShareImageSaver: NSObject {
    private let completion: (Result<Void, Error>) -> Void
    private var strongSelf: WorkoutShareImageSaver?

    init(completion: @escaping (Result<Void, Error>) -> Void) {
        self.completion = completion
        super.init()
    }

    func save(_ image: UIImage) {
        strongSelf = self
        UIImageWriteToSavedPhotosAlbum(image, self, #selector(didFinishSaving(_:didFinishSavingWithError:contextInfo:)), nil)
    }

    @objc private func didFinishSaving(_ image: UIImage, didFinishSavingWithError error: Error?, contextInfo: UnsafeRawPointer) {
        if let error {
            completion(.failure(error))
        } else {
            completion(.success(()))
        }
        strongSelf = nil
    }
}

private struct ShareSheet: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

struct WorkoutGroupPickerSheet: View {
    let onSelect: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var appState: AppState
    @State private var groups: [WorkoutShareGroup] = []
    @State private var loading = true

    var body: some View {
        NavigationView {
            ZStack {
                Color.zymBackgroundSoft.ignoresSafeArea()

                if loading {
                    ProgressView()
                } else if groups.isEmpty {
                    VStack(spacing: 10) {
                        Text("No groups yet")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(Color.zymSubtext)
                        Text("Create a group first to share your workout card there.")
                            .font(.system(size: 13))
                            .foregroundColor(Color.zymSubtext)
                            .multilineTextAlignment(.center)
                    }
                    .padding(24)
                } else {
                    ScrollView {
                        VStack(spacing: 8) {
                            ForEach(groups, id: \.id) { group in
                                Button {
                                    dismiss()
                                    onSelect("grp_\(group.id)")
                                } label: {
                                    HStack(spacing: 12) {
                                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                                            .fill(Color.zymSurfaceSoft)
                                            .frame(width: 40, height: 40)
                                            .overlay(
                                                Image(systemName: "person.3.fill")
                                                    .font(.system(size: 14))
                                                    .foregroundColor(Color.zymPrimary)
                                            )
                                        Text(group.name)
                                            .font(.system(size: 15, weight: .semibold))
                                            .foregroundColor(Color.zymText)
                                        Spacer()
                                        Image(systemName: "paperplane.fill")
                                            .font(.system(size: 14))
                                            .foregroundColor(Color.zymPrimary)
                                    }
                                    .padding(12)
                                    .background(Color.white.opacity(0.86))
                                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(16)
                    }
                }
            }
            .navigationTitle("Choose a Group")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(Color.zymSubtext)
                }
            }
            .onAppear(perform: loadGroups)
        }
    }

    private func loadGroups() {
        guard let userId = appState.userId,
              let url = apiURL("/groups/user/\(userId)") else {
            loading = false
            return
        }

        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            DispatchQueue.main.async { loading = false }
            guard let data = data,
                  let response = try? JSONDecoder().decode(WorkoutShareGroupsResponse.self, from: data) else { return }
            DispatchQueue.main.async { groups = response.groups }
        }.resume()
    }
}

private struct WorkoutShareGroup: Codable, Identifiable {
    let id: Int
    let name: String
}

private struct WorkoutShareGroupsResponse: Codable {
    let groups: [WorkoutShareGroup]
}
