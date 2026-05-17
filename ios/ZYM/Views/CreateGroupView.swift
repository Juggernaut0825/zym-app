import SwiftUI
import CoreLocation

struct CreateGroupView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var appState: AppState
    @StateObject private var locationCoordinator = AppLocationPermissionCoordinator()
    @State private var groupName = ""
    @State private var inviteQuery = ""
    @State private var inviteResults: [Friend] = []
    @State private var invitees: [Friend] = []
    @State private var inviteSearchPending = false
    @State private var inviteSearchSequence = 0
    @State private var pending = false
    @State private var statusText = ""
    @State private var selectedLocation: SharedLocationSelectionPayload?
    @State private var showLocationSheet = false
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

                        GroupLocationCard(
                            selectedLocation: selectedLocation,
                            onTap: { showLocationSheet = true },
                            onRemove: { selectedLocation = nil }
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
            .sheet(isPresented: $showLocationSheet) {
                GroupLocationSheet(
                    selectedLocation: selectedLocation,
                    locationCoordinator: locationCoordinator,
                    onSelected: { location in
                        selectedLocation = location
                    }
                )
                .environmentObject(appState)
            }
        }
        .onChange(of: inviteQuery) { _, value in
            scheduleInviteSearch(for: value)
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

        var body: [String: Any] = [
            "name": groupName.trimmingCharacters(in: .whitespacesAndNewlines),
            "ownerId": userId,
            "coachEnabled": "none"
        ]

        if let loc = selectedLocation {
            body["locationLabel"] = loc.label
            body["locationCity"] = loc.city
            body["locationLatitude"] = loc.latitude
            body["locationLongitude"] = loc.longitude
            body["locationPrecision"] = loc.precision
        }

        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard statusCode >= 200 && statusCode < 300,
                  let data = data,
                  let payload = try? JSONDecoder().decode(CreateGroupResponse.self, from: data) else {
                let serverError: String? = {
                    guard let data = data,
                          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                          let msg = json["error"] as? String else { return nil }
                    return msg
                }()
                DispatchQueue.main.async {
                    pending = false
                    statusText = serverError ?? "Failed to create group."
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

// MARK: - Location Card

private struct GroupLocationCard: View {
    let selectedLocation: SharedLocationSelectionPayload?
    let onTap: () -> Void
    let onRemove: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let location = selectedLocation {
                HStack {
                    Image(systemName: "mappin.circle.fill")
                        .font(.system(size: 18))
                        .foregroundColor(Color.zymPrimary)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(location.label)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Color.zymText)
                        Text(location.precision == "city" ? "City-level" : "Precise location")
                            .font(.system(size: 12))
                            .foregroundColor(Color.zymSubtext)
                    }
                    Spacer()
                    Button { onRemove() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 18))
                            .foregroundColor(Color.zymSubtext)
                    }
                    .buttonStyle(.plain)
                }
            } else {
                Button(action: onTap) {
                    HStack(spacing: 10) {
                        Image(systemName: "mappin.circle")
                            .font(.system(size: 18))
                            .foregroundColor(Color.zymPrimary)
                        Text("Add Location")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(Color.zymText)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(Color.zymSubtext)
                    }
                }
                .buttonStyle(.plain)
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

// MARK: - Location Sheet

private struct GroupLocationSheet: View {
    let selectedLocation: SharedLocationSelectionPayload?
    @ObservedObject var locationCoordinator: AppLocationPermissionCoordinator
    let onSelected: (SharedLocationSelectionPayload?) -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var appState: AppState
    @State private var query = ""
    @State private var results: [SharedLocationSelectionPayload] = []
    @State private var loading = false
    @State private var statusText = ""

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                VStack(alignment: .leading, spacing: 14) {
                    Text("Add a location so nearby users can discover this group.")
                        .font(.system(size: 13))
                        .foregroundColor(Color.zymSubtext)

                    HStack(spacing: 8) {
                        Button("Use Current City") {
                            requestCurrentLocation(precise: false)
                        }
                        .buttonStyle(ZYMGhostButton())
                        .disabled(loading)

                        Button("Use Precise") {
                            requestCurrentLocation(precise: true)
                        }
                        .buttonStyle(ZYMGhostButton())
                        .disabled(loading)
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
                        Text("No matching locations.")
                            .font(.system(size: 13))
                            .foregroundColor(Color.zymSubtext)
                    }

                    ScrollView {
                        VStack(spacing: 8) {
                            ForEach(results, id: \.label) { result in
                                Button {
                                    onSelected(result)
                                    dismiss()
                                } label: {
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
            .navigationTitle("Group Location")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") { dismiss() }
                }
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
            DispatchQueue.main.async { loading = false }
            guard let data = data,
                  let response = try? JSONDecoder().decode(LocationSearchResponse.self, from: data) else { return }
            DispatchQueue.main.async { results = response.results }
        }.resume()
    }

    private func requestCurrentLocation(precise: Bool) {
        loading = true
        statusText = ""
        locationCoordinator.requestCurrentCoordinate(precise: precise) { result in
            switch result {
            case .success(let coordinate):
                reverseLocation(latitude: coordinate.latitude, longitude: coordinate.longitude, precise: precise)
            case .failure(let error):
                DispatchQueue.main.async {
                    loading = false
                    statusText = error.localizedDescription
                }
            }
        }
    }

    private func reverseLocation(latitude: Double, longitude: Double, precise: Bool) {
        guard let url = apiURL("/location/reverse") else {
            loading = false
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
                    loading = false
                    statusText = "Failed to resolve location."
                }
                return
            }
            let selection = precise ? response.precise : response.city
            DispatchQueue.main.async {
                loading = false
                if let selection {
                    onSelected(selection)
                    dismiss()
                } else {
                    statusText = "Failed to resolve location."
                }
            }
        }.resume()
    }
}

struct Group: Identifiable, Codable {
    let id: Int
    let name: String
    let coach_enabled: String?
    let location_label: String?
    let location_city: String?
    let location_latitude: Double?
    let location_longitude: Double?
    let location_precision: String?

    enum CodingKeys: String, CodingKey {
        case id, name, coach_enabled, location_label, location_city, location_latitude, location_longitude, location_precision
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        coach_enabled = try container.decodeIfPresent(String.self, forKey: .coach_enabled)
        location_label = try container.decodeIfPresent(String.self, forKey: .location_label)
        location_city = try container.decodeIfPresent(String.self, forKey: .location_city)
        location_latitude = try container.decodeIfPresent(Double.self, forKey: .location_latitude)
        location_longitude = try container.decodeIfPresent(Double.self, forKey: .location_longitude)
        location_precision = try container.decodeIfPresent(String.self, forKey: .location_precision)
    }
}

struct GroupsResponse: Codable {
    let groups: [Group]
}

struct CreateGroupResponse: Codable {
    let groupId: Int
}
