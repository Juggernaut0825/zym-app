import SwiftUI
import AVKit

struct FeedView: View {
    @State private var posts: [Post] = []
    @State private var showCreatePost = false
    @State private var selectedPost: Post?
    @State private var reactingIds = Set<Int>()
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(Array(posts.enumerated()), id: \.element.id) { index, post in
                            PostCard(
                                post: post,
                                isReacting: reactingIds.contains(post.id),
                                onOpen: { selectedPost = post },
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
                }

                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Button(action: { showCreatePost = true }) {
                            Image(systemName: "plus")
                                .font(.system(size: 20, weight: .bold))
                                .foregroundColor(.white)
                                .frame(width: 56, height: 56)
                                .background(
                                    LinearGradient(colors: [Color.zymPrimary, Color.zymPrimaryDark], startPoint: .topLeading, endPoint: .bottomTrailing)
                                )
                                .clipShape(Circle())
                                .shadow(color: Color.black.opacity(0.2), radius: 10, x: 0, y: 5)
                                .scaleEffect(showCreatePost ? 0.94 : 1)
                        }
                        .padding(16)
                    }
                }
            }
            .navigationTitle("Feed")
            .onAppear(perform: loadFeed)
            .sheet(isPresented: $showCreatePost) {
                CreatePostView(onPost: loadFeed)
            }
            .sheet(item: $selectedPost) { post in
                FeedPostDetailSheet(
                    post: post,
                    isReacting: reactingIds.contains(post.id),
                    onReact: { reactToPost(postId: post.id) }
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
            }
        }.resume()
    }

    func reactToPost(postId: Int) {
        guard let url = apiURL("/community/react"),
              let userId = appState.userId else { return }
        if reactingIds.contains(postId) { return }

        reactingIds.insert(postId)
        if let index = posts.firstIndex(where: { $0.id == postId }) {
            let current = posts[index].reaction_count ?? 0
            posts[index].reaction_count = current + 1
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        let body = ["postId": postId, "userId": userId, "reactionType": "like"] as [String : Any]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        authorizedDataTask(appState: appState, request: request) { _, _, _ in
            DispatchQueue.main.async {
                reactingIds.remove(postId)
                loadFeed()
            }
        }.resume()
    }
}

struct PostCard: View {
    let post: Post
    let isReacting: Bool
    let onOpen: () -> Void
    let onReact: () -> Void

    var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Circle()
                        .fill(Color.zymSurfaceSoft)
                        .frame(width: 38, height: 38)
                        .overlay(
                            Text(String((post.username ?? "U").prefix(2)).uppercased())
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(Color.zymPrimary)
                        )

                    VStack(alignment: .leading, spacing: 3) {
                        Text(post.username ?? "User")
                            .font(.custom("Syne", size: 16))
                            .foregroundColor(Color.zymText)
                        Text(post.type)
                            .font(.caption)
                            .foregroundColor(Color.zymSubtext)
                    }

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
                            Image(systemName: "heart.fill")
                            Text("\(post.reaction_count ?? 0)")
                        }
                    }
                    .buttonStyle(ZYMGhostButton())
                    .disabled(isReacting)

                    Text("Comments \(post.comment_count ?? 0) · Open details")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Color.zymSubtext)
                }
            }
            .zymCard()
        }
        .buttonStyle(.plain)
    }
}

struct FeedPostDetailSheet: View {
    let post: Post
    let isReacting: Bool
    let onReact: () -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var appState: AppState
    @State private var comments: [FeedComment] = []
    @State private var commentDraft = ""
    @State private var commentsLoading = false
    @State private var commentPending = false

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text(post.username ?? "User")
                                .font(.custom("Syne", size: 22))
                                .foregroundColor(Color.zymText)
                            Spacer()
                            Text(post.type)
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(Color.zymSubtext)
                        }

                        if let content = post.content, !content.isEmpty {
                            Text(content)
                                .foregroundColor(Color.zymText)
                                .font(.system(size: 16))
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        if let mediaUrls = post.media_urls, !mediaUrls.isEmpty {
                            FeedMediaPreviewGrid(mediaUrls: mediaUrls)
                        }

                        Button(action: onReact) {
                            HStack {
                                Image(systemName: "heart.fill")
                                Text("Like · \(post.reaction_count ?? 0)")
                            }
                        }
                        .buttonStyle(ZYMPrimaryButton())
                        .disabled(isReacting)

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
                                    HStack {
                                        Text(comment.username)
                                            .font(.system(size: 12, weight: .semibold))
                                            .foregroundColor(Color.zymText)
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
                                    .background(Color.zymSurface)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 10)
                                            .stroke(Color.zymLine, lineWidth: 1)
                                    )
                                    .cornerRadius(10)
                                Button(action: addComment) {
                                    Text(commentPending ? "..." : "Send")
                                }
                                .buttonStyle(ZYMPrimaryButton())
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
                                            Image(systemName: "photo")
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
                            .stroke(Color.zymLine, lineWidth: 1)
                    )
                }
            }
        }
    }
}

struct Post: Identifiable, Codable {
    let id: Int
    let user_id: Int
    let type: String
    let content: String?
    let username: String?
    let avatar_url: String?
    var reaction_count: Int?
    let comment_count: Int?
    let media_urls: [String]?
    let created_at: String?
}

struct FeedResponse: Codable {
    let feed: [Post]
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
