import SwiftUI

struct InboxView: View {
    @State private var conversations: [Conversation] = []
    @State private var showAddMenu = false
    @State private var showAddFriend = false
    @State private var showCreateGroup = false
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationView {
            ZStack {
                Color.zymBackground.ignoresSafeArea()

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
            .onAppear(perform: loadInbox)
        }
    }

    func loadInbox() {
        guard let userId = appState.userId else { return }

        var convs: [Conversation] = []
        let coachName = appState.selectedCoach == "lc" ? "LC Coach" : "ZJ Coach"
        convs.append(Conversation(id: "coach_\(userId)", name: coachName, isGroup: false, isCoach: true, coachEnabled: nil, avatarUrl: nil, otherUserId: nil))

        guard let url = apiURL("/messages/inbox/\(userId)") else { return }
        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        URLSession.shared.dataTask(with: request) { data, _, _ in
            guard let data = data,
                  let response = try? JSONDecoder().decode(InboxResponse.self, from: data) else {
                DispatchQueue.main.async { conversations = convs }
                return
            }

            DispatchQueue.main.async {
                for dm in response.dms {
                    convs.append(
                        Conversation(
                            id: dm.topic,
                            name: dm.username ?? "User \(dm.other_user_id)",
                            isGroup: false,
                            isCoach: false,
                            coachEnabled: nil,
                            avatarUrl: dm.avatar_url,
                            otherUserId: Int(dm.other_user_id)
                        )
                    )
                }
                for group in response.groups {
                    convs.append(
                        Conversation(
                            id: group.topic,
                            name: group.name,
                            isGroup: true,
                            isCoach: false,
                            coachEnabled: group.coach_enabled,
                            avatarUrl: nil,
                            otherUserId: nil
                        )
                    )
                }
                conversations = convs
            }
        }.resume()
    }
}

struct ConversationRow: View {
    let conversation: Conversation
    @EnvironmentObject var appState: AppState

    var body: some View {
        HStack(spacing: 12) {
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
                .frame(width: 46, height: 46)
                .clipShape(Circle())
                .overlay(
                    Circle()
                        .stroke(Color.zymLine, lineWidth: 1)
                )
            } else {
                Circle()
                    .fill(conversation.isCoach ? Color.zymPrimary : Color.zymSurfaceSoft)
                    .frame(width: 46, height: 46)
                    .overlay(
                        Text(conversation.isCoach ? (appState.selectedCoach == "lc" ? "LC" : "ZJ") : (conversation.isGroup ? "GR" : "DM"))
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(conversation.isCoach ? .white : Color.zymPrimary)
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
}

struct InboxResponse: Codable {
    let dms: [DMConv]
    let groups: [GroupConv]
}

struct DMConv: Codable {
    let topic: String
    let other_user_id: String
    let username: String?
    let avatar_url: String?
    let last_message_at: String?
}

struct GroupConv: Codable {
    let id: Int
    let topic: String
    let name: String
    let last_message_at: String?
    let coach_enabled: String?
}
