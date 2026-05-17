import SwiftUI

func challengeGoalIcon(_ goalType: String) -> String {
    switch goalType {
    case "steps": return "figure.walk"
    case "workouts": return "dumbbell.fill"
    case "meals": return "fork.knife"
    case "plan_completion": return "checkmark.seal.fill"
    default: return "flag.fill"
    }
}

func challengeGoalLabel(_ goalType: String, targetCount: Int = 1) -> String {
    switch goalType {
    case "steps": return "Move \(targetCount > 1 ? "\(targetCount)" : "4k") steps today"
    case "workouts": return "Complete \(targetCount) workout\(targetCount == 1 ? "" : "s") today"
    case "meals": return "Log \(targetCount) meal\(targetCount == 1 ? "" : "s") today"
    case "plan_completion": return "Complete your training plan today"
    case "custom": return "Complete today's task"
    default: return goalType.replacingOccurrences(of: "_", with: " ").capitalized
    }
}

struct ChallengeDetailView: View {
    let challengeId: Int
    var onJoined: (() -> Void)?
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var appState: AppState
    @State private var challenge: ChallengeSummary?
    @State private var members: [ChallengeMember] = []
    @State private var loading = true
    @State private var joining = false
    @State private var statusText = ""
    @State private var isMember = false
    @State private var showInviteSearch = false

    private var challengeTitle: String {
        challenge?.title ?? "Challenge"
    }

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 18) {
                        VStack(spacing: 10) {
                            Image(systemName: challengeGoalIcon(challenge?.goal_type ?? ""))
                                .font(.system(size: 24))
                                .foregroundColor(Color.zymPrimaryDark)
                                .frame(width: 60, height: 60)
                                .background(Color.zymSurfaceSoft)
                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                            Text(challengeTitle)
                                .font(.custom("Syne", size: 22))
                                .foregroundColor(Color.zymText)
                                .multilineTextAlignment(.center)

                            if let desc = challenge?.description, !desc.isEmpty {
                                Text(desc)
                                    .font(.system(size: 14))
                                    .foregroundColor(Color.zymSubtext)
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal, 16)
                            }

                            if let c = challenge {
                                HStack(spacing: 16) {
                                    ChallengeDetailChip(
                                        icon: "person.2.fill",
                                        text: "\(c.member_count) members"
                                    )
                                    ChallengeDetailChip(
                                        icon: "calendar",
                                        text: "\(c.start_date) → \(c.end_date)"
                                    )
                                    ChallengeDetailChip(
                                        icon: c.visibility == "public" ? "globe" : "lock.fill",
                                        text: c.visibility == "public" ? "Public" : "Friends"
                                    )
                                }
                                .padding(.top, 4)

                                HStack(spacing: 6) {
                                    Image(systemName: challengeGoalIcon(c.goal_type))
                                        .font(.system(size: 13))
                                        .foregroundColor(Color.zymPrimary)
                                    Text(challengeGoalLabel(c.goal_type, targetCount: c.target_count))
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundColor(Color.zymSubtext)
                                }
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 12)

                        if !isMember {
                            Button(joining ? "Joining..." : "Join Challenge") {
                                joinChallenge()
                            }
                            .buttonStyle(ZYMPrimaryButton())
                            .disabled(joining)
                            .padding(.horizontal, 16)
                        } else {
                            HStack(spacing: 12) {
                                Text("You're in this challenge")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundColor(Color.zymPrimary)

                                Button {
                                    showInviteSearch = true
                                } label: {
                                    HStack(spacing: 5) {
                                        Image(systemName: "person.badge.plus")
                                            .font(.system(size: 13, weight: .semibold))
                                        Text("Invite")
                                            .font(.system(size: 13, weight: .semibold))
                                    }
                                    .foregroundColor(Color.zymPrimaryDark)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 8)
                                    .background(Color.zymSurfaceSoft)
                                    .clipShape(Capsule())
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .center)
                        }

                        if !statusText.isEmpty {
                            Text(statusText)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Color.zymSubtext)
                                .padding(.horizontal, 16)
                        }

                        VStack(alignment: .leading, spacing: 10) {
                            Text("Members")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(Color.zymText)

                            if loading {
                                ProgressView()
                                    .frame(maxWidth: .infinity, alignment: .center)
                                    .padding(.vertical, 12)
                            } else if members.isEmpty {
                                Text("No members yet.")
                                    .font(.system(size: 13))
                                    .foregroundColor(Color.zymSubtext)
                            } else {
                                ForEach(members) { member in
                                    HStack(spacing: 10) {
                                        ZStack {
                                            if let avatarURL = member.avatar_url, let url = resolveRemoteURL(avatarURL) {
                                                AsyncImage(url: url) { phase in
                                                    switch phase {
                                                    case .success(let image):
                                                        image.resizable().scaledToFill()
                                                    default:
                                                        Circle().fill(Color.zymSurfaceSoft)
                                                            .overlay(
                                                                Text(String(member.username.prefix(2)).uppercased())
                                                                    .font(.system(size: 11, weight: .semibold))
                                                                    .foregroundColor(Color.zymPrimary)
                                                            )
                                                    }
                                                }
                                            } else {
                                                Circle().fill(Color.zymSurfaceSoft)
                                                    .overlay(
                                                        Text(String(member.username.prefix(2)).uppercased())
                                                            .font(.system(size: 11, weight: .semibold))
                                                            .foregroundColor(Color.zymPrimary)
                                                    )
                                            }
                                        }
                                        .frame(width: 36, height: 36)
                                        .clipShape(Circle())

                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(member.display_name)
                                                .font(.system(size: 14, weight: .semibold))
                                                .foregroundColor(Color.zymText)
                                            if member.role == "owner" {
                                                Text("Creator")
                                                    .font(.system(size: 11, weight: .medium))
                                                    .foregroundColor(Color.zymPrimary)
                                            }
                                        }
                                        Spacer()
                                    }
                                    .padding(.vertical, 4)
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    .padding(.bottom, 24)
                }
            }
            .navigationTitle("Challenge")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") { dismiss() }
                        .foregroundColor(Color.zymSubtext)
                }
            }
            .onAppear {
                loadChallengeDetail()
            }
            .sheet(isPresented: $showInviteSearch) {
                ChallengeInviteSearchSheet(
                    challengeId: challengeId,
                    visibility: challenge?.visibility ?? "friends"
                )
                .environmentObject(appState)
            }
        }
    }

    private func loadChallengeDetail() {
        guard let url = apiURL("/challenges/\(challengeId)/members") else {
            loading = false
            return
        }

        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            DispatchQueue.main.async { loading = false }
            guard let data = data,
                  let response = try? JSONDecoder().decode(ChallengeMembersResponse.self, from: data) else { return }
            DispatchQueue.main.async {
                members = response.members
                isMember = response.members.contains { $0.id == appState.userId }
            }
        }.resume()

        if let userId = appState.userId,
           let challengeURL = apiURL("/challenges/\(userId)") {
            var challengeRequest = URLRequest(url: challengeURL)
            applyAuthorizationHeader(&challengeRequest, token: appState.token)
            authorizedDataTask(appState: appState, request: challengeRequest) { data, _, _ in
                guard let data = data,
                      let response = try? JSONDecoder().decode(ChallengesResponse.self, from: data) else { return }
                DispatchQueue.main.async {
                    challenge = response.challenges.first { $0.id == challengeId }
                }
            }.resume()
        }
    }

    private func joinChallenge() {
        guard let userId = appState.userId,
              let url = apiURL("/challenges/\(challengeId)/join") else { return }
        joining = true
        statusText = ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["userId": userId])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                joining = false
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                if statusCode >= 200 && statusCode < 300 {
                    isMember = true
                    statusText = "Joined!"
                    onJoined?()
                    loadChallengeDetail()
                } else {
                    statusText = parseAPIError(data) ?? "Failed to join challenge."
                }
            }
        }.resume()
    }
}

private struct ChallengeDetailChip: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .semibold))
            Text(text)
                .font(.system(size: 11, weight: .medium))
        }
        .foregroundColor(Color.zymSubtext)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color.zymSurfaceSoft.opacity(0.86))
        .clipShape(Capsule())
    }
}

struct ChallengeInviteSearchSheet: View {
    let challengeId: Int
    let visibility: String
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var appState: AppState
    @State private var searchText = ""
    @State private var results: [Friend] = []
    @State private var searching = false
    @State private var invitedIds = Set<Int>()
    @State private var invitingId: Int?
    @State private var statusText = ""

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                VStack(spacing: 0) {
                    HStack(spacing: 10) {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(Color.zymSubtext)
                        TextField("Search users to invite...", text: $searchText)
                            .foregroundColor(Color.zymText)
                            .autocapitalization(.none)
                            .disableAutocorrection(true)
                            .onChange(of: searchText) { _, newValue in
                                searchUsers(query: newValue)
                            }
                        if searching {
                            ProgressView()
                                .scaleEffect(0.72)
                        }
                    }
                    .padding(12)
                    .background(Color.white.opacity(0.86))
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .padding(.horizontal, 16)
                    .padding(.top, 8)

                    if !statusText.isEmpty {
                        Text(statusText)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Color.zymPrimary)
                            .padding(.top, 8)
                    }

                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(results, id: \.id) { user in
                                HStack(spacing: 10) {
                                    ZStack {
                                        if let avatarURL = user.avatar_url, let url = resolveRemoteURL(avatarURL) {
                                            AsyncImage(url: url) { phase in
                                                switch phase {
                                                case .success(let image):
                                                    image.resizable().scaledToFill()
                                                default:
                                                    Circle().fill(Color.zymSurfaceSoft)
                                                }
                                            }
                                        } else {
                                            Circle().fill(Color.zymSurfaceSoft)
                                                .overlay(
                                                    Text(String(user.username.prefix(2)).uppercased())
                                                        .font(.system(size: 11, weight: .semibold))
                                                        .foregroundColor(Color.zymPrimary)
                                                )
                                        }
                                    }
                                    .frame(width: 36, height: 36)
                                    .clipShape(Circle())

                                    Text(user.username)
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundColor(Color.zymText)

                                    Spacer()

                                    if invitedIds.contains(user.id) {
                                        Text("Invited")
                                            .font(.system(size: 12, weight: .semibold))
                                            .foregroundColor(Color.zymPrimary)
                                    } else {
                                        Button {
                                            inviteUser(userId: user.id)
                                        } label: {
                                            if invitingId == user.id {
                                                ProgressView().scaleEffect(0.7)
                                            } else {
                                                Image(systemName: "plus.circle.fill")
                                                    .font(.system(size: 22))
                                                    .foregroundColor(Color.zymPrimary)
                                            }
                                        }
                                        .disabled(invitingId != nil)
                                    }
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 10)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Invite to Challenge")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Done") { dismiss() }
                        .foregroundColor(Color.zymSubtext)
                }
            }
        }
    }

    private func searchUsers(query: String) {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else {
            results = []
            return
        }

        let endpoint = visibility == "public" ? "/users/search" : "/friends/search"
        guard let userId = appState.userId else { return }
        let searchPath = visibility == "public"
            ? "\(endpoint)?q=\(trimmed.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? trimmed)&limit=15"
            : "/friends/\(userId)"
        guard let url = apiURL(searchPath) else { return }

        searching = true
        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            DispatchQueue.main.async { searching = false }
            guard let data = data else { return }

            if visibility == "public" {
                if let response = try? JSONDecoder().decode(UserSearchResponse.self, from: data) {
                    DispatchQueue.main.async { results = response.users }
                }
            } else {
                if let response = try? JSONDecoder().decode(FriendsResponse.self, from: data) {
                    let filtered = response.friends.filter {
                        $0.username.localizedCaseInsensitiveContains(trimmed)
                    }
                    DispatchQueue.main.async { results = Array(filtered.prefix(15)) }
                }
            }
        }.resume()
    }

    private func inviteUser(userId: Int) {
        guard let myUserId = appState.userId,
              let url = apiURL("/challenges/\(challengeId)/invite") else { return }
        invitingId = userId

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": myUserId,
            "targetUserId": userId,
        ])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                invitingId = nil
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                if statusCode >= 200 && statusCode < 300 {
                    invitedIds.insert(userId)
                    statusText = "Invite sent!"
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        statusText = ""
                    }
                } else {
                    statusText = parseAPIError(data) ?? "Failed to invite."
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                        statusText = ""
                    }
                }
            }
        }.resume()
    }
}

