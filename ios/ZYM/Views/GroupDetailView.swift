import SwiftUI

struct GroupDetailView: View {
    let group: ExploreGroupResult
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var appState: AppState
    @State private var members: [ConversationGroupMember] = []
    @State private var loading = true
    @State private var joining = false
    @State private var statusText = ""
    @State private var isMember = false

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 18) {
                        // Header
                        VStack(spacing: 10) {
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .fill(Color.zymSurfaceSoft)
                                .frame(width: 72, height: 72)
                                .overlay(
                                    Image(systemName: "person.3.fill")
                                        .font(.system(size: 24))
                                        .foregroundColor(Color.zymPrimary)
                                )

                            Text(group.name)
                                .font(.custom("Syne", size: 24))
                                .foregroundColor(Color.zymText)

                            if let count = group.member_count {
                                Text("\(count) members")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(Color.zymSubtext)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 12)

                        // Location
                        if let label = group.location_label ?? group.location_city, !label.isEmpty {
                            HStack(spacing: 8) {
                                Image(systemName: "mappin.circle.fill")
                                    .font(.system(size: 16))
                                    .foregroundColor(Color.zymPrimary)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(label)
                                        .font(.system(size: 14, weight: .medium))
                                        .foregroundColor(Color.zymText)
                                    if let precision = group.location_precision {
                                        Text(precision == "city" ? "City-level" : "Precise location")
                                            .font(.system(size: 12))
                                            .foregroundColor(Color.zymSubtext)
                                    }
                                }
                                Spacer()
                                if let dist = group.distance_km {
                                    Text(nearbyDistanceText(dist))
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(Color.zymSubtext)
                                }
                            }
                            .padding(14)
                            .background(Color.zymSurface)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .stroke(Color.zymLine, lineWidth: 1)
                            )
                            .padding(.horizontal, 16)
                        }

                        // Join button
                        if !isMember {
                            Button(joining ? "Joining..." : "Join Group") {
                                joinGroup()
                            }
                            .buttonStyle(ZYMPrimaryButton())
                            .disabled(joining)
                            .padding(.horizontal, 16)
                        } else {
                            Text("You're a member of this group")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(Color.zymPrimary)
                                .frame(maxWidth: .infinity, alignment: .center)
                        }

                        if !statusText.isEmpty {
                            Text(statusText)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Color.zymSubtext)
                                .padding(.horizontal, 16)
                        }

                        // Members list
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
                                ForEach(members, id: \.id) { member in
                                    HStack(spacing: 10) {
                                        Circle()
                                            .fill(Color.zymSurfaceSoft)
                                            .frame(width: 36, height: 36)
                                            .overlay(
                                                Text(String(member.username.prefix(2)).uppercased())
                                                    .font(.system(size: 11, weight: .semibold))
                                                    .foregroundColor(Color.zymPrimary)
                                            )
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(member.display_name ?? member.username)
                                                .font(.system(size: 14, weight: .semibold))
                                                .foregroundColor(Color.zymText)
                                            if member.role == "owner" {
                                                Text("Owner")
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
            .navigationTitle("Group Info")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") { dismiss() }
                        .foregroundColor(Color.zymSubtext)
                }
            }
            .onAppear {
                loadGroupMembers()
            }
        }
    }

    private func loadGroupMembers() {
        guard let url = apiURL("/groups/\(group.id)/members") else {
            loading = false
            return
        }

        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async { loading = false }
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard statusCode >= 200 && statusCode < 300,
                  let data = data,
                  let payload = try? JSONDecoder().decode(GroupMembersResponse.self, from: data) else {
                return
            }
            DispatchQueue.main.async {
                members = payload.members
                isMember = payload.members.contains { $0.id == appState.userId }
            }
        }.resume()
    }

    private func joinGroup() {
        guard let userId = appState.userId,
              let url = apiURL("/groups/add-member") else { return }

        joining = true
        statusText = ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "groupId": group.id,
            "userId": userId,
        ])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                joining = false
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                if statusCode >= 200 && statusCode < 300 {
                    isMember = true
                    statusText = "Joined!"
                    loadGroupMembers()
                } else {
                    if let data = data,
                       let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let message = payload["error"] as? String {
                        statusText = message
                    } else {
                        statusText = "Failed to join group."
                    }
                }
            }
        }.resume()
    }

    private func nearbyDistanceText(_ distance: Double) -> String {
        if distance < 1 {
            return "\(max(100, Int((distance * 1000).rounded()))) m"
        }
        return distance >= 10 ? "\(Int(distance.rounded())) km" : String(format: "%.1f km", distance)
    }
}

