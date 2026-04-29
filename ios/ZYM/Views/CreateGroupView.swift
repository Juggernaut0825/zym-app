import SwiftUI

struct CreateGroupView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var appState: AppState
    @State private var groupName = ""
    @State private var selectedCoachId = "zj"
    @State private var coachPickerExpanded = false
    @State private var inviteQuery = ""
    @State private var inviteResults: [Friend] = []
    @State private var invitees: [Friend] = []
    @State private var inviteSearchPending = false
    @State private var inviteSearchSequence = 0
    @State private var pending = false
    @State private var statusText = ""
    let onCreate: () -> Void

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        TextField("Group Name", text: $groupName)
                            .padding(12)
                            .background(Color.zymSurface)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color.zymLine, lineWidth: 1)
                            )
                            .cornerRadius(12)

                        GroupCoachPickerCard(
                            selectedCoachId: $selectedCoachId,
                            expanded: $coachPickerExpanded
                        )

                        VStack(alignment: .leading, spacing: 10) {
                            Text("Invite Members")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(Color.zymSubtext)

                            if invitees.isEmpty {
                                Text("Search usernames below to add people before the group is created.")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(Color.zymSubtext)
                            } else {
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 8) {
                                        ForEach(invitees) { invitee in
                                            Button {
                                                removeInvitee(invitee.id)
                                            } label: {
                                                HStack(spacing: 6) {
                                                    Text(invitee.username)
                                                    Image(systemName: "xmark")
                                                        .font(.system(size: 11, weight: .bold))
                                                }
                                                .font(.system(size: 12, weight: .semibold))
                                                .foregroundColor(Color.zymPrimaryDark)
                                                .padding(.horizontal, 12)
                                                .padding(.vertical, 8)
                                                .background(Color.white.opacity(0.9))
                                                .clipShape(Capsule())
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                }
                            }

                            TextField("Search username to invite", text: $inviteQuery)
                                .padding(12)
                                .background(Color.zymSurface)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .stroke(Color.zymLine, lineWidth: 1)
                                )
                                .cornerRadius(12)
                                .textInputAutocapitalization(.never)
                                .disableAutocorrection(true)

                            if inviteSearchPending {
                                Text("Searching usernames...")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(Color.zymSubtext)
                            } else if !inviteQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && inviteResults.isEmpty {
                                Text("No matching usernames.")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(Color.zymSubtext)
                            }

                            ForEach(inviteResults, id: \.id) { friend in
                                FriendSearchResultRow(friend: friend) {
                                    addInvitee(friend)
                                }
                            }
                        }

                        if !statusText.isEmpty {
                            Text(statusText)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Color.zymSubtext)
                        }
                    }
                    .padding(18)
                }
            }
            .navigationTitle("Create Group")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(Color.zymSubtext)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(pending ? "Creating..." : "Create") { createGroup() }
                        .disabled(pending || groupName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .foregroundColor(Color.zymPrimary)
                }
            }
        }
        .onChange(of: inviteQuery) { _, value in
            scheduleInviteSearch(for: value)
        }
        .onAppear {
            if appState.selectedCoach == "lc" {
                selectedCoachId = "lc"
            }
        }
    }

    func createGroup() {
        guard let userId = appState.userId,
              let url = apiURL("/groups/create"),
              !pending else { return }

        pending = true
        statusText = ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)

        let body = [
            "name": groupName.trimmingCharacters(in: .whitespacesAndNewlines),
            "ownerId": userId,
            "coachEnabled": selectedCoachId
        ] as [String : Any]

        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard statusCode >= 200 && statusCode < 300,
                  let data = data,
                  let payload = try? JSONDecoder().decode(CreateGroupResponse.self, from: data) else {
                DispatchQueue.main.async {
                    pending = false
                    statusText = "Failed to create group."
                }
                return
            }
            addInvitees(to: payload.groupId)
        }.resume()
    }

    func addInvitees(to groupId: Int) {
        guard !invitees.isEmpty else {
            DispatchQueue.main.async {
                pending = false
                onCreate()
                dismiss()
            }
            return
        }

        let dispatchGroup = DispatchGroup()
        let lock = NSLock()
        var firstError = ""

        for invitee in invitees {
            guard let url = apiURL("/groups/add-member") else { continue }
            dispatchGroup.enter()

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            applyAuthorizationHeader(&request, token: appState.token)
            request.httpBody = try? JSONSerialization.data(withJSONObject: [
                "groupId": groupId,
                "userId": invitee.id,
            ])

            authorizedDataTask(appState: appState, request: request) { data, response, _ in
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                if statusCode < 200 || statusCode >= 300 {
                    lock.lock()
                    if firstError.isEmpty {
                        if let data = data,
                           let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                           let message = payload["error"] as? String {
                            firstError = message
                        } else {
                            firstError = "Some members could not be invited."
                        }
                    }
                    lock.unlock()
                }
                dispatchGroup.leave()
            }.resume()
        }

        dispatchGroup.notify(queue: .main) {
            pending = false
            if !firstError.isEmpty {
                statusText = firstError
                return
            }
            onCreate()
            dismiss()
        }
    }

    func addInvitee(_ friend: Friend) {
        guard !invitees.contains(where: { $0.id == friend.id }) else { return }
        invitees.append(friend)
        inviteQuery = ""
        inviteResults = []
    }

    func removeInvitee(_ userId: Int) {
        invitees.removeAll { $0.id == userId }
    }

    func scheduleInviteSearch(for rawValue: String) {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        inviteSearchSequence += 1
        let currentSequence = inviteSearchSequence

        guard trimmed.count >= 2 else {
            inviteSearchPending = false
            inviteResults = []
            return
        }

        inviteSearchPending = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.24) {
            guard currentSequence == inviteSearchSequence else { return }
            searchInviteCandidates(query: trimmed, sequence: currentSequence)
        }
    }

    func searchInviteCandidates(query: String, sequence: Int) {
        guard let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = apiURL("/users/search?q=\(encoded)") else {
            DispatchQueue.main.async {
                inviteSearchPending = false
                inviteResults = []
            }
            return
        }

        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            guard sequence == inviteSearchSequence else { return }
            DispatchQueue.main.async {
                inviteSearchPending = false
                guard let data = data,
                      let response = try? JSONDecoder().decode(UserSearchResponse.self, from: data) else {
                    inviteResults = []
                    return
                }

                var excludedIds = Set(invitees.map(\.id))
                excludedIds.insert(appState.userId ?? -1)
                inviteResults = response.users.filter { !excludedIds.contains($0.id) }
            }
        }.resume()
    }
}

private struct GroupCoachPickerCard: View {
    @Binding var selectedCoachId: String
    @Binding var expanded: Bool

    private let coaches: [(id: String, name: String, detail: String)] = [
        ("zj", "ZJ", "Analytical coach"),
        ("lc", "LC", "Direct coach")
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                withAnimation(.spring(response: 0.24, dampingFraction: 0.88)) {
                    expanded.toggle()
                }
            } label: {
                HStack(spacing: 12) {
                    GroupCoachAvatar(coachId: selectedCoachId)

                    VStack(alignment: .leading, spacing: 3) {
                        Text("AI Coach")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Color.zymText)
                        Text(selectedCoachId.uppercased())
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Color.zymSubtext)
                    }

                    Spacer()

                    Image(systemName: "chevron.down")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(Color.zymSubtext)
                        .rotationEffect(.degrees(expanded ? 180 : 0))
                }
            }
            .buttonStyle(.plain)

            if expanded {
                HStack(spacing: 12) {
                    ForEach(coaches, id: \.id) { coach in
                        Button {
                            withAnimation(.spring(response: 0.22, dampingFraction: 0.9)) {
                                selectedCoachId = coach.id
                                expanded = false
                            }
                        } label: {
                            VStack(spacing: 7) {
                                GroupCoachAvatar(coachId: coach.id, selected: selectedCoachId == coach.id)
                                Text(coach.name)
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundColor(Color.zymText)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(Color.zymSurfaceSoft.opacity(selectedCoachId == coach.id ? 0.95 : 0.55))
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .stroke(selectedCoachId == coach.id ? Color.zymCoachAccent(coach.id) : Color.zymLine, lineWidth: selectedCoachId == coach.id ? 1.5 : 1)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(12)
        .background(Color.zymSurface)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.zymLine, lineWidth: 1)
        )
        .cornerRadius(12)
    }
}

private struct GroupCoachAvatar: View {
    let coachId: String
    var selected = false

    var body: some View {
        Text(coachId.uppercased())
            .font(.system(size: 12, weight: .black))
            .foregroundColor(selected ? .white : Color.zymCoachInk(coachId))
            .frame(width: 40, height: 40)
            .background(
                Circle()
                    .fill(selected ? Color.zymCoachAccent(coachId) : Color.zymCoachSoft(coachId).opacity(0.85))
            )
            .overlay(
                Circle()
                    .stroke(selected ? Color.zymCoachAccentDark(coachId) : Color.white.opacity(0.72), lineWidth: 1)
            )
    }
}

struct Group: Identifiable, Codable {
    let id: Int
    let name: String
    let coach_enabled: String?
}

struct GroupsResponse: Codable {
    let groups: [Group]
}

struct CreateGroupResponse: Codable {
    let groupId: Int
}
