import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var appState: AppState
    @State private var profile: APIProfile?
    @State private var showEditor = false
    @State private var showSessionsSheet = false
    @State private var showCoachRecordsSheet = false
    @State private var coachPending = false
    @State private var coachError = ""
    @State private var sessions: [AuthSessionRow] = []
    @State private var sessionsLoading = false
    @State private var sessionsError = ""
    @State private var revokePendingSessionId: String?
    @State private var logoutOthersPending = false
    @State private var logoutPending = false

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 12) {
                        ZStack(alignment: .bottomLeading) {
                            if let cover = profile?.background_url, let url = resolveRemoteURL(cover) {
                                AsyncImage(url: url) { phase in
                                    switch phase {
                                    case .success(let image):
                                        image
                                            .resizable()
                                            .scaledToFill()
                                    default:
                                        LinearGradient(
                                            colors: [Color.zymSurfaceSoft, Color.zymBackground],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    }
                                }
                                .frame(height: 170)
                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            } else {
                                LinearGradient(
                                    colors: [Color.zymSurfaceSoft, Color.zymBackground],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                                .frame(height: 170)
                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            }

                            HStack(spacing: 10) {
                                if let avatar = profile?.avatar_url, let url = resolveRemoteURL(avatar) {
                                    AsyncImage(url: url) { phase in
                                        switch phase {
                                        case .success(let image):
                                            image
                                                .resizable()
                                                .scaledToFill()
                                        default:
                                            Circle().fill(Color.zymSurfaceSoft)
                                        }
                                    }
                                    .frame(width: 74, height: 74)
                                    .clipShape(Circle())
                                    .overlay(Circle().stroke(Color.white.opacity(0.8), lineWidth: 2))
                                } else {
                                    Circle()
                                        .fill(Color.zymPrimary)
                                        .frame(width: 74, height: 74)
                                        .overlay(
                                            Text(String((profile?.username ?? appState.username ?? "U").prefix(2)).uppercased())
                                                .font(.custom("Syne", size: 24))
                                                .foregroundColor(.white)
                                        )
                                        .overlay(Circle().stroke(Color.white.opacity(0.8), lineWidth: 2))
                                }

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(profile?.username ?? appState.username ?? "User")
                                        .font(.custom("Syne", size: 28))
                                        .foregroundColor(Color.zymText)
                                    Text("User ID: \(appState.userId ?? 0)")
                                        .font(.system(size: 12))
                                        .foregroundColor(Color.zymSubtext)
                                    Text("Coach: \((appState.selectedCoach ?? "zj").uppercased())")
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundColor(Color.zymSubtext)
                                }
                            }
                            .padding(12)
                        }
                        .zymCard()
                        .zymAppear(delay: 0.04)

                        VStack(alignment: .leading, spacing: 8) {
                            Text("Coach Style")
                                .font(.custom("Syne", size: 18))
                                .foregroundColor(Color.zymText)

                            HStack(spacing: 8) {
                                if (appState.selectedCoach ?? "zj") == "zj" {
                                    Button(action: { switchCoach(to: "zj") }) {
                                        Text(coachPending ? "Switching..." : "ZJ")
                                            .frame(maxWidth: .infinity)
                                    }
                                    .buttonStyle(ZYMCoachButtonStyle(coach: "zj", selected: true))
                                    .disabled(coachPending)
                                } else {
                                    Button(action: { switchCoach(to: "zj") }) {
                                        Text("ZJ")
                                            .frame(maxWidth: .infinity)
                                    }
                                    .buttonStyle(ZYMCoachButtonStyle(coach: "zj", selected: false))
                                    .disabled(coachPending)
                                }

                                if (appState.selectedCoach ?? "zj") == "lc" {
                                    Button(action: { switchCoach(to: "lc") }) {
                                        Text(coachPending ? "Switching..." : "LC")
                                            .frame(maxWidth: .infinity)
                                    }
                                    .buttonStyle(ZYMCoachButtonStyle(coach: "lc", selected: true))
                                    .disabled(coachPending)
                                } else {
                                    Button(action: { switchCoach(to: "lc") }) {
                                        Text("LC")
                                            .frame(maxWidth: .infinity)
                                    }
                                    .buttonStyle(ZYMCoachButtonStyle(coach: "lc", selected: false))
                                    .disabled(coachPending)
                                }
                            }

                            if !coachError.isEmpty {
                                Text(coachError)
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(.red)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .zymCard()
                        .zymAppear(delay: 0.08)

                        VStack(alignment: .leading, spacing: 8) {
                            Text("Bio")
                                .font(.custom("Syne", size: 18))
                                .foregroundColor(Color.zymText)
                            Text(profile?.bio?.isEmpty == false ? profile?.bio ?? "" : "No bio yet.")
                                .font(.system(size: 14))
                                .foregroundColor(Color.zymSubtext)

                            Divider()

                            Text("Fitness Goal")
                                .font(.custom("Syne", size: 18))
                                .foregroundColor(Color.zymText)
                            Text(profile?.fitness_goal?.isEmpty == false ? profile?.fitness_goal ?? "" : "Not set")
                                .font(.system(size: 14))
                                .foregroundColor(Color.zymSubtext)

                            Divider()

                            Text("Hobbies")
                                .font(.custom("Syne", size: 18))
                                .foregroundColor(Color.zymText)
                            Text(profile?.hobbies?.isEmpty == false ? profile?.hobbies ?? "" : "Not set")
                                .font(.system(size: 14))
                                .foregroundColor(Color.zymSubtext)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .zymCard()
                        .zymAppear(delay: 0.1)

                        Button(action: { showEditor = true }) {
                            Text("Edit Profile")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(ZYMPrimaryButton())
                        .zymAppear(delay: 0.14)

                        Button(action: {
                            showSessionsSheet = true
                            loadSessions()
                        }) {
                            Text("Manage Sessions")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(ZYMGhostButton())
                        .zymAppear(delay: 0.17)

                        Button(action: { showCoachRecordsSheet = true }) {
                            Text("Coach Records Details")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(ZYMGhostButton())
                        .zymAppear(delay: 0.175)

                        Button(action: performLogout) {
                            Text(logoutPending ? "Logging out..." : "Logout")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(ZYMGhostButton())
                        .disabled(logoutPending)
                        .zymAppear(delay: 0.18)
                    }
                    .padding(14)
                }
            }
            .navigationTitle("Profile")
        }
        .sheet(isPresented: $showEditor) {
            ProfileEditSheet(profile: profile, onSaved: loadProfile)
                .environmentObject(appState)
        }
        .sheet(isPresented: $showSessionsSheet) {
            SessionsManagementSheet(
                sessions: sessions,
                loading: sessionsLoading,
                errorText: sessionsError,
                revokePendingSessionId: revokePendingSessionId,
                logoutOthersPending: logoutOthersPending,
                onRefresh: loadSessions,
                onRevoke: revokeSession,
                onLogoutOthers: logoutOtherSessions
            )
        }
        .sheet(isPresented: $showCoachRecordsSheet) {
            CoachRecordsDetailsSheet()
                .environmentObject(appState)
        }
        .onAppear(perform: loadProfile)
    }

    private func loadProfile() {
        guard let userId = appState.userId,
              let url = apiURL("/profile/\(userId)") else { return }
        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            guard let data = data,
                  let response = try? JSONDecoder().decode(APIProfile.self, from: data) else { return }
            DispatchQueue.main.async {
                profile = response
            }
        }.resume()
    }

    private func switchCoach(to coach: String) {
        guard !coachPending,
              let userId = appState.userId,
              let url = apiURL("/coach/select") else { return }
        if appState.selectedCoach == coach { return }

        coachPending = true
        coachError = ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
            "coach": coach,
        ])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                coachPending = false
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard statusCode >= 200 && statusCode < 300 else {
                    if let data = data,
                       let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let message = payload["error"] as? String {
                        coachError = message
                    } else {
                        coachError = "Failed to switch coach."
                    }
                    return
                }
                appState.selectedCoach = coach
                loadProfile()
            }
        }.resume()
    }

    private func loadSessions() {
        guard let url = apiURL("/auth/sessions") else { return }
        sessionsLoading = true
        sessionsError = ""

        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)

        authorizedDataTask(appState: appState, request: request) { data, _, error in
            DispatchQueue.main.async {
                sessionsLoading = false
                if let error {
                    sessionsError = error.localizedDescription
                    return
                }
                guard let data = data,
                      let response = try? JSONDecoder().decode(AuthSessionsResponse.self, from: data) else {
                    sessionsError = "Failed to load sessions."
                    return
                }
                sessions = response.sessions
            }
        }.resume()
    }

    private func revokeSession(_ sessionId: String) {
        guard !sessionId.isEmpty,
              let url = apiURL("/auth/sessions/revoke") else { return }
        revokePendingSessionId = sessionId
        sessionsError = ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["sessionId": sessionId])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                revokePendingSessionId = nil
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard statusCode >= 200 && statusCode < 300 else {
                    if let data = data,
                       let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let message = payload["error"] as? String {
                        sessionsError = message
                    } else {
                        sessionsError = "Failed to revoke session."
                    }
                    return
                }
                loadSessions()
            }
        }.resume()
    }

    private func logoutOtherSessions() {
        guard let url = apiURL("/auth/logout-all") else { return }
        logoutOthersPending = true
        sessionsError = ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [String: Any]())

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                logoutOthersPending = false
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard statusCode >= 200 && statusCode < 300 else {
                    if let data = data,
                       let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let message = payload["error"] as? String {
                        sessionsError = message
                    } else {
                        sessionsError = "Failed to logout other sessions."
                    }
                    return
                }
                loadSessions()
            }
        }.resume()
    }

    private func performLogout() {
        if logoutPending { return }
        logoutPending = true

        guard let url = apiURL("/auth/logout") else {
            logoutPending = false
            appState.logout()
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [String: Any]())

        authorizedDataTask(appState: appState, request: request) { _, _, _ in
            DispatchQueue.main.async {
                logoutPending = false
                appState.logout()
            }
        }.resume()
    }
}

private struct ProfileEditSheet: View {
    let profile: APIProfile?
    let onSaved: () -> Void

    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var bio = ""
    @State private var fitnessGoal = ""
    @State private var hobbies = ""
    @State private var avatarURL = ""
    @State private var backgroundURL = ""
    @State private var pending = false
    @State private var errorText = ""

    var body: some View {
        NavigationView {
            Form {
                Section("Profile") {
                    TextField("Bio", text: $bio, axis: .vertical)
                        .lineLimit(3...6)
                    TextField("Fitness goal", text: $fitnessGoal)
                    TextField("Hobbies", text: $hobbies)
                }

                Section("Images (URL)") {
                    TextField("Avatar URL", text: $avatarURL)
                        .textInputAutocapitalization(.never)
                    TextField("Background URL", text: $backgroundURL)
                        .textInputAutocapitalization(.never)
                }

                if !errorText.isEmpty {
                    Section {
                        Text(errorText)
                            .foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("Edit Profile")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(pending ? "Saving..." : "Save") {
                        saveProfile()
                    }
                    .disabled(pending)
                }
            }
        }
        .onAppear {
            bio = profile?.bio ?? ""
            fitnessGoal = profile?.fitness_goal ?? ""
            hobbies = profile?.hobbies ?? ""
            avatarURL = profile?.avatar_url ?? ""
            backgroundURL = profile?.background_url ?? ""
        }
    }

    private func saveProfile() {
        guard let userId = appState.userId,
              let url = apiURL("/profile/update") else { return }

        pending = true
        errorText = ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
            "bio": bio,
            "fitness_goal": fitnessGoal,
            "hobbies": hobbies,
            "avatar_url": avatarURL,
            "avatar_visibility": "public",
            "background_url": backgroundURL,
            "background_visibility": "friends"
        ])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                pending = false
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                if statusCode < 200 || statusCode >= 300 {
                    if let data = data,
                       let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let message = payload["error"] as? String {
                        errorText = message
                    } else {
                        errorText = "Failed to save profile."
                    }
                    return
                }
                onSaved()
                dismiss()
            }
        }.resume()
    }
}

private struct CoachRecordsDetailsSheet: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var loading = false
    @State private var saving = false
    @State private var errorText = ""
    @State private var noticeText = ""
    @State private var payload: CoachRecordsPayload?
    @State private var profileDraft = CoachProfileDraft()
    @State private var mealDraft: CoachMealEditDraft?
    @State private var trainingDraft: CoachTrainingEditDraft?

    private let gridColumns: [GridItem] = [
        GridItem(.flexible(minimum: 100, maximum: 240), spacing: 8),
        GridItem(.flexible(minimum: 100, maximum: 240), spacing: 8),
    ]

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Coach Records Details")
                                        .font(.custom("Syne", size: 22))
                                        .foregroundColor(Color.zymText)
                                    Text("Visualized log corrections for profile, meals, and training.")
                                        .font(.system(size: 13))
                                        .foregroundColor(Color.zymSubtext)
                                }
                                Spacer()
                                Button(action: loadRecords) {
                                    Text(loading ? "Refreshing..." : "Refresh")
                                }
                                .buttonStyle(ZYMGhostButton())
                                .disabled(loading || saving)
                            }

                            if let stats = payload?.stats {
                                HStack(spacing: 10) {
                                    coachStatPill(title: "Days", value: "\(stats.days)")
                                    coachStatPill(title: "Meals", value: "\(stats.mealCount)")
                                    coachStatPill(title: "Training", value: "\(stats.trainingCount)")
                                }
                            } else if loading {
                                Text("Loading records...")
                                    .font(.system(size: 13))
                                    .foregroundColor(Color.zymSubtext)
                            } else {
                                Text("No records available yet.")
                                    .font(.system(size: 13))
                                    .foregroundColor(Color.zymSubtext)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .zymCard()

                        VStack(alignment: .leading, spacing: 10) {
                            Text("Profile Record")
                                .font(.custom("Syne", size: 18))
                                .foregroundColor(Color.zymText)

                            LazyVGrid(columns: gridColumns, spacing: 8) {
                                coachInputField("Height cm", text: binding(for: \.heightCm, max: 6), keyboard: .decimalPad)
                                coachInputField("Weight kg", text: binding(for: \.weightKg, max: 6), keyboard: .decimalPad)
                                coachInputField("Age", text: binding(for: \.age, max: 3), keyboard: .numberPad)
                                coachInputField("Body fat %", text: binding(for: \.bodyFatPct, max: 5), keyboard: .decimalPad)
                                coachInputField("Training days", text: binding(for: \.trainingDays, max: 2), keyboard: .numberPad)
                                coachInputField("Timezone", text: binding(for: \.timezone, max: 80), keyboard: .default)
                            }

                            Picker("Gender", selection: $profileDraft.gender) {
                                Text("Gender not set").tag("")
                                Text("Male").tag("male")
                                Text("Female").tag("female")
                            }
                            .pickerStyle(.menu)

                            Picker("Activity level", selection: $profileDraft.activityLevel) {
                                Text("Activity not set").tag("")
                                Text("Sedentary").tag("sedentary")
                                Text("Light").tag("light")
                                Text("Moderate").tag("moderate")
                                Text("Active").tag("active")
                                Text("Very active").tag("very_active")
                            }
                            .pickerStyle(.menu)

                            Picker("Goal", selection: $profileDraft.goal) {
                                Text("Goal not set").tag("")
                                Text("Cut").tag("cut")
                                Text("Maintain").tag("maintain")
                                Text("Bulk").tag("bulk")
                            }
                            .pickerStyle(.menu)

                            Button(action: saveProfileDraft) {
                                Text(saving ? "Saving..." : "Save profile record")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(ZYMPrimaryButton())
                            .disabled(saving || loading)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .zymCard()

                        if let records = payload?.records {
                            ForEach(records, id: \.day) { day in
                                VStack(alignment: .leading, spacing: 10) {
                                    HStack(alignment: .top) {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(formatCoachDay(day.day))
                                                .font(.custom("Syne", size: 16))
                                                .foregroundColor(Color.zymText)
                                            Text("Intake \(coachRounded(day.totalIntake)) kcal · Burned \(coachRounded(day.totalBurned)) kcal")
                                                .font(.system(size: 12))
                                                .foregroundColor(Color.zymSubtext)
                                        }
                                        Spacer()
                                    }

                                    Divider()

                                    Text("Meals")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(Color.zymText)
                                    if day.meals.isEmpty {
                                        Text("No meals logged.")
                                            .font(.system(size: 12))
                                            .foregroundColor(Color.zymSubtext)
                                    }
                                    ForEach(Array(day.meals.enumerated()), id: \.offset) { (_, meal) in
                                        VStack(alignment: .leading, spacing: 4) {
                                            HStack {
                                                Text((meal.description?.isEmpty == false) ? (meal.description ?? "") : "Meal")
                                                    .font(.system(size: 13, weight: .medium))
                                                    .foregroundColor(Color.zymText)
                                                Spacer()
                                                Button(action: { mealDraft = CoachMealEditDraft(day: day.day, meal: meal) }) {
                                                    Text("Edit")
                                                }
                                                .buttonStyle(ZYMGhostButton())
                                                .disabled(saving || loading || (meal.id ?? "").isEmpty)
                                            }
                                            Text("\(meal.time ?? "--:--") · C \(coachRounded(meal.calories)) · P \(coachRounded(meal.proteinG)) · Cb \(coachRounded(meal.carbsG)) · F \(coachRounded(meal.fatG))")
                                                .font(.system(size: 12))
                                                .foregroundColor(Color.zymSubtext)
                                        }
                                        .padding(10)
                                        .background(Color.zymSurfaceSoft)
                                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                    }

                                    Divider()

                                    Text("Training")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(Color.zymText)
                                    if day.training.isEmpty {
                                        Text("No training logged.")
                                            .font(.system(size: 12))
                                            .foregroundColor(Color.zymSubtext)
                                    }
                                    ForEach(Array(day.training.enumerated()), id: \.offset) { (_, training) in
                                        VStack(alignment: .leading, spacing: 4) {
                                            HStack {
                                                Text((training.name?.isEmpty == false) ? (training.name ?? "") : "Training entry")
                                                    .font(.system(size: 13, weight: .medium))
                                                    .foregroundColor(Color.zymText)
                                                Spacer()
                                                Button(action: { trainingDraft = CoachTrainingEditDraft(day: day.day, entry: training) }) {
                                                    Text("Edit")
                                                }
                                                .buttonStyle(ZYMGhostButton())
                                                .disabled(saving || loading || (training.id ?? "").isEmpty)
                                            }
                                            Text("\(training.time ?? "--:--") · \(coachRounded(training.sets)) sets × \((training.reps?.isEmpty == false) ? (training.reps ?? "") : "0") reps @ \(coachRounded(training.weightKg)) kg")
                                                .font(.system(size: 12))
                                                .foregroundColor(Color.zymSubtext)
                                        }
                                        .padding(10)
                                        .background(Color.zymSurfaceSoft)
                                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .zymCard()
                            }
                        }

                        if mealDraft != nil {
                            mealEditCard
                                .zymCard()
                        }

                        if trainingDraft != nil {
                            trainingEditCard
                                .zymCard()
                        }

                        if !noticeText.isEmpty {
                            Text(noticeText)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Color.zymPrimaryDark)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 6)
                        }

                        if !errorText.isEmpty {
                            Text(errorText)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.red)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 6)
                        }
                    }
                    .padding(14)
                }
            }
            .navigationTitle("Coach Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .onAppear {
            if profileDraft.timezone.isEmpty {
                profileDraft.timezone = TimeZone.current.identifier
            }
            if payload == nil {
                loadRecords()
            }
        }
    }

    private var mealEditCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Edit Meal Record")
                .font(.custom("Syne", size: 18))
                .foregroundColor(Color.zymText)
            Text(formatCoachDay(mealDraft?.day ?? ""))
                .font(.system(size: 12))
                .foregroundColor(Color.zymSubtext)

            TextEditor(text: Binding(
                get: { mealDraft?.description ?? "" },
                set: { mealDraft?.description = String($0.prefix(500)) }
            ))
            .frame(minHeight: 84, maxHeight: 120)
            .padding(8)
            .background(Color.zymSurfaceSoft)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            LazyVGrid(columns: gridColumns, spacing: 8) {
                coachInputField("Calories", text: Binding(
                    get: { mealDraft?.calories ?? "" },
                    set: { mealDraft?.calories = String($0.prefix(8)) }
                ), keyboard: .decimalPad)
                coachInputField("Protein g", text: Binding(
                    get: { mealDraft?.proteinG ?? "" },
                    set: { mealDraft?.proteinG = String($0.prefix(8)) }
                ), keyboard: .decimalPad)
                coachInputField("Carbs g", text: Binding(
                    get: { mealDraft?.carbsG ?? "" },
                    set: { mealDraft?.carbsG = String($0.prefix(8)) }
                ), keyboard: .decimalPad)
                coachInputField("Fat g", text: Binding(
                    get: { mealDraft?.fatG ?? "" },
                    set: { mealDraft?.fatG = String($0.prefix(8)) }
                ), keyboard: .decimalPad)
                coachInputField("Time HH:mm", text: Binding(
                    get: { mealDraft?.time ?? "" },
                    set: { mealDraft?.time = String($0.prefix(5)) }
                ), keyboard: .numbersAndPunctuation)
                coachInputField("Timezone", text: Binding(
                    get: { mealDraft?.timezone ?? "" },
                    set: { mealDraft?.timezone = String($0.prefix(80)) }
                ), keyboard: .default)
            }

            HStack(spacing: 8) {
                Button(action: saveMealDraft) {
                    Text(saving ? "Saving..." : "Save meal update")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(ZYMPrimaryButton())
                .disabled(saving || loading)

                Button(action: { mealDraft = nil }) {
                    Text("Cancel")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(ZYMGhostButton())
                .disabled(saving)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var trainingEditCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Edit Training Record")
                .font(.custom("Syne", size: 18))
                .foregroundColor(Color.zymText)
            Text(formatCoachDay(trainingDraft?.day ?? ""))
                .font(.system(size: 12))
                .foregroundColor(Color.zymSubtext)

            LazyVGrid(columns: gridColumns, spacing: 8) {
                coachInputField("Exercise name", text: Binding(
                    get: { trainingDraft?.name ?? "" },
                    set: { trainingDraft?.name = String($0.prefix(120)) }
                ), keyboard: .default)
                coachInputField("Sets", text: Binding(
                    get: { trainingDraft?.sets ?? "" },
                    set: { trainingDraft?.sets = String($0.prefix(2)) }
                ), keyboard: .numberPad)
                coachInputField("Reps", text: Binding(
                    get: { trainingDraft?.reps ?? "" },
                    set: { trainingDraft?.reps = String($0.prefix(20)) }
                ), keyboard: .numbersAndPunctuation)
                coachInputField("Weight kg", text: Binding(
                    get: { trainingDraft?.weightKg ?? "" },
                    set: { trainingDraft?.weightKg = String($0.prefix(8)) }
                ), keyboard: .decimalPad)
                coachInputField("Time HH:mm", text: Binding(
                    get: { trainingDraft?.time ?? "" },
                    set: { trainingDraft?.time = String($0.prefix(5)) }
                ), keyboard: .numbersAndPunctuation)
                coachInputField("Timezone", text: Binding(
                    get: { trainingDraft?.timezone ?? "" },
                    set: { trainingDraft?.timezone = String($0.prefix(80)) }
                ), keyboard: .default)
            }

            TextEditor(text: Binding(
                get: { trainingDraft?.notes ?? "" },
                set: { trainingDraft?.notes = String($0.prefix(500)) }
            ))
            .frame(minHeight: 84, maxHeight: 120)
            .padding(8)
            .background(Color.zymSurfaceSoft)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            HStack(spacing: 8) {
                Button(action: saveTrainingDraft) {
                    Text(saving ? "Saving..." : "Save training update")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(ZYMPrimaryButton())
                .disabled(saving || loading)

                Button(action: { trainingDraft = nil }) {
                    Text("Cancel")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(ZYMGhostButton())
                .disabled(saving)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func coachStatPill(title: String, value: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(Color.zymText)
            Text(title)
                .font(.system(size: 11))
                .foregroundColor(Color.zymSubtext)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(Color.zymSurfaceSoft)
        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
    }

    private func coachInputField(_ title: String, text: Binding<String>, keyboard: UIKeyboardType) -> some View {
        TextField(title, text: text)
            .font(.system(size: 14))
            .padding(10)
            .background(Color.zymSurfaceSoft)
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(Color.zymLine, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .keyboardType(keyboard)
            .textInputAutocapitalization(.never)
    }

    private func binding(for keyPath: WritableKeyPath<CoachProfileDraft, String>, max: Int) -> Binding<String> {
        Binding(
            get: { profileDraft[keyPath: keyPath] },
            set: { profileDraft[keyPath: keyPath] = String($0.prefix(max)) }
        )
    }

    private func loadRecords() {
        guard !loading,
              let userId = appState.userId,
              userId > 0,
              let url = apiURL("/coach/records/\(userId)?days=28") else { return }

        loading = true
        errorText = ""
        noticeText = ""

        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)

        authorizedDataTask(appState: appState, request: request) { data, response, error in
            DispatchQueue.main.async {
                loading = false
                if let error {
                    errorText = error.localizedDescription
                    return
                }
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard statusCode >= 200 && statusCode < 300 else {
                    errorText = parseAPIError(data) ?? "Failed to load coach records."
                    return
                }
                guard let data,
                      let decoded = try? JSONDecoder().decode(CoachRecordsPayload.self, from: data) else {
                    errorText = "Invalid coach records payload."
                    return
                }
                payload = decoded
                profileDraft = CoachProfileDraft(profile: decoded.profile)
                validateSelectedDrafts(decoded.records)
            }
        }.resume()
    }

    private func saveProfileDraft() {
        guard let userId = appState.userId, userId > 0 else { return }
        var body: [String: Any] = ["userId": userId]

        if let value = coachDouble(profileDraft.heightCm) { body["height_cm"] = value }
        if let value = coachDouble(profileDraft.weightKg) { body["weight_kg"] = value }
        if let value = coachInt(profileDraft.age) { body["age"] = value }
        if let value = coachDouble(profileDraft.bodyFatPct) { body["body_fat_pct"] = value }
        if let value = coachInt(profileDraft.trainingDays) { body["training_days"] = value }

        let gender = coachTrim(profileDraft.gender, limit: 16)
        if !gender.isEmpty { body["gender"] = gender }
        let activity = coachTrim(profileDraft.activityLevel, limit: 20)
        if !activity.isEmpty { body["activity_level"] = activity }
        let goal = coachTrim(profileDraft.goal, limit: 20)
        if !goal.isEmpty { body["goal"] = goal }
        let timezone = coachTrim(profileDraft.timezone, limit: 80)
        if !timezone.isEmpty { body["timezone"] = timezone }

        if body.count <= 1 {
            errorText = "No valid profile fields to save."
            return
        }

        submit(path: "/coach/records/profile/update", body: body, success: "Profile record updated.") {
            loadRecords()
        }
    }

    private func saveMealDraft() {
        guard let userId = appState.userId,
              userId > 0,
              var draft = mealDraft else { return }

        draft.description = coachTrim(draft.description, limit: 500)
        draft.time = coachTrim(draft.time, limit: 5)
        draft.timezone = coachTrim(draft.timezone, limit: 80)
        mealDraft = draft

        guard !draft.day.isEmpty, !draft.mealId.isEmpty else {
            errorText = "Meal record is missing day or id."
            return
        }

        var body: [String: Any] = [
            "userId": userId,
            "day": draft.day,
            "mealId": draft.mealId,
            "description": draft.description,
        ]
        if let value = coachDouble(draft.calories) { body["calories"] = value }
        if let value = coachDouble(draft.proteinG) { body["protein_g"] = value }
        if let value = coachDouble(draft.carbsG) { body["carbs_g"] = value }
        if let value = coachDouble(draft.fatG) { body["fat_g"] = value }
        if let time = coachValidHHMM(draft.time) { body["time"] = time }
        if !draft.timezone.isEmpty { body["timezone"] = draft.timezone }

        submit(path: "/coach/records/meal/update", body: body, success: "Meal record updated.") {
            mealDraft = nil
            loadRecords()
        }
    }

    private func saveTrainingDraft() {
        guard let userId = appState.userId,
              userId > 0,
              var draft = trainingDraft else { return }

        draft.name = coachTrim(draft.name, limit: 120)
        draft.reps = coachTrim(draft.reps, limit: 20)
        draft.notes = coachTrim(draft.notes, limit: 500)
        draft.time = coachTrim(draft.time, limit: 5)
        draft.timezone = coachTrim(draft.timezone, limit: 80)
        trainingDraft = draft

        guard !draft.day.isEmpty, !draft.trainingId.isEmpty else {
            errorText = "Training record is missing day or id."
            return
        }

        var body: [String: Any] = [
            "userId": userId,
            "day": draft.day,
            "trainingId": draft.trainingId,
            "name": draft.name,
            "notes": draft.notes,
        ]
        if let value = coachInt(draft.sets) { body["sets"] = value }
        if !draft.reps.isEmpty { body["reps"] = draft.reps }
        if let value = coachDouble(draft.weightKg) { body["weight_kg"] = value }
        if let time = coachValidHHMM(draft.time) { body["time"] = time }
        if !draft.timezone.isEmpty { body["timezone"] = draft.timezone }

        submit(path: "/coach/records/training/update", body: body, success: "Training record updated.") {
            trainingDraft = nil
            loadRecords()
        }
    }

    private func submit(path: String, body: [String: Any], success: String, completion: @escaping () -> Void) {
        guard !saving, let url = apiURL(path) else { return }
        saving = true
        errorText = ""
        noticeText = ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        authorizedDataTask(appState: appState, request: request) { data, response, error in
            DispatchQueue.main.async {
                saving = false
                if let error {
                    errorText = error.localizedDescription
                    return
                }
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard statusCode >= 200 && statusCode < 300 else {
                    errorText = parseAPIError(data) ?? "Request failed."
                    return
                }
                noticeText = success
                completion()
            }
        }.resume()
    }

    private func validateSelectedDrafts(_ records: [CoachDayRecordEntry]) {
        if let draft = mealDraft {
            let stillExists = records.contains { day in
                day.day == draft.day && day.meals.contains { String($0.id ?? "") == draft.mealId }
            }
            if !stillExists {
                mealDraft = nil
            }
        }
        if let draft = trainingDraft {
            let stillExists = records.contains { day in
                day.day == draft.day && day.training.contains { String($0.id ?? "") == draft.trainingId }
            }
            if !stillExists {
                trainingDraft = nil
            }
        }
    }
}

private struct CoachRecordsPayload: Codable {
    var profile: CoachRecordProfile
    var records: [CoachDayRecordEntry]
    var stats: CoachRecordsStats

    init(profile: CoachRecordProfile = CoachRecordProfile(), records: [CoachDayRecordEntry] = [], stats: CoachRecordsStats = CoachRecordsStats()) {
        self.profile = profile
        self.records = records
        self.stats = stats
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        profile = (try? container.decode(CoachRecordProfile.self, forKey: .profile)) ?? CoachRecordProfile()
        records = (try? container.decode([CoachDayRecordEntry].self, forKey: .records)) ?? []
        stats = (try? container.decode(CoachRecordsStats.self, forKey: .stats)) ?? CoachRecordsStats()
    }
}

private struct CoachRecordsStats: Codable {
    var days: Int
    var mealCount: Int
    var trainingCount: Int

    init(days: Int = 0, mealCount: Int = 0, trainingCount: Int = 0) {
        self.days = days
        self.mealCount = mealCount
        self.trainingCount = trainingCount
    }
}

private struct CoachRecordProfile: Codable {
    var height_cm: Double?
    var weight_kg: Double?
    var age: Double?
    var body_fat_pct: Double?
    var training_days: Double?
    var gender: String?
    var activity_level: String?
    var goal: String?
    var timezone: String?
}

private struct CoachDayRecordEntry: Codable {
    var day: String
    var totalIntake: Double?
    var totalBurned: Double?
    var meals: [CoachMealRecordEntry]
    var training: [CoachTrainingRecordEntry]

    enum CodingKeys: String, CodingKey {
        case day
        case totalIntake = "total_intake"
        case totalBurned = "total_burned"
        case meals
        case training
    }

    init(day: String = "", totalIntake: Double? = 0, totalBurned: Double? = 0, meals: [CoachMealRecordEntry] = [], training: [CoachTrainingRecordEntry] = []) {
        self.day = day
        self.totalIntake = totalIntake
        self.totalBurned = totalBurned
        self.meals = meals
        self.training = training
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        day = (try? container.decode(String.self, forKey: .day)) ?? ""
        totalIntake = try? container.decode(Double.self, forKey: .totalIntake)
        totalBurned = try? container.decode(Double.self, forKey: .totalBurned)
        meals = (try? container.decode([CoachMealRecordEntry].self, forKey: .meals)) ?? []
        training = (try? container.decode([CoachTrainingRecordEntry].self, forKey: .training)) ?? []
    }
}

private struct CoachMealRecordEntry: Codable {
    var id: String?
    var time: String?
    var timezone: String?
    var calories: Double?
    var proteinG: Double?
    var carbsG: Double?
    var fatG: Double?
    var description: String?

    enum CodingKeys: String, CodingKey {
        case id
        case time
        case timezone
        case calories
        case proteinG = "protein_g"
        case carbsG = "carbs_g"
        case fatG = "fat_g"
        case description
    }
}

private struct CoachTrainingRecordEntry: Codable {
    var id: String?
    var time: String?
    var timezone: String?
    var name: String?
    var sets: Double?
    var reps: String?
    var weightKg: Double?
    var notes: String?

    enum CodingKeys: String, CodingKey {
        case id
        case time
        case timezone
        case name
        case sets
        case reps
        case weightKg = "weight_kg"
        case notes
    }
}

private struct CoachProfileDraft {
    var heightCm = ""
    var weightKg = ""
    var age = ""
    var bodyFatPct = ""
    var trainingDays = ""
    var gender = ""
    var activityLevel = ""
    var goal = ""
    var timezone = ""

    init() {}

    init(profile: CoachRecordProfile) {
        heightCm = coachNumberString(profile.height_cm)
        weightKg = coachNumberString(profile.weight_kg)
        age = coachNumberString(profile.age)
        bodyFatPct = coachNumberString(profile.body_fat_pct)
        trainingDays = coachNumberString(profile.training_days)
        gender = profile.gender ?? ""
        activityLevel = profile.activity_level ?? ""
        goal = profile.goal ?? ""
        timezone = profile.timezone ?? TimeZone.current.identifier
    }
}

private struct CoachMealEditDraft {
    var day: String
    var mealId: String
    var description: String
    var calories: String
    var proteinG: String
    var carbsG: String
    var fatG: String
    var time: String
    var timezone: String

    init(day: String, meal: CoachMealRecordEntry) {
        self.day = day
        self.mealId = meal.id ?? ""
        self.description = coachTrim(meal.description ?? "", limit: 500)
        self.calories = coachNumberString(meal.calories)
        self.proteinG = coachNumberString(meal.proteinG)
        self.carbsG = coachNumberString(meal.carbsG)
        self.fatG = coachNumberString(meal.fatG)
        self.time = coachTrim(meal.time ?? "", limit: 5)
        self.timezone = coachTrim(meal.timezone ?? TimeZone.current.identifier, limit: 80)
    }
}

private struct CoachTrainingEditDraft {
    var day: String
    var trainingId: String
    var name: String
    var sets: String
    var reps: String
    var weightKg: String
    var notes: String
    var time: String
    var timezone: String

    init(day: String, entry: CoachTrainingRecordEntry) {
        self.day = day
        self.trainingId = entry.id ?? ""
        self.name = coachTrim(entry.name ?? "", limit: 120)
        self.sets = coachNumberString(entry.sets)
        self.reps = coachTrim(entry.reps ?? "", limit: 20)
        self.weightKg = coachNumberString(entry.weightKg)
        self.notes = coachTrim(entry.notes ?? "", limit: 500)
        self.time = coachTrim(entry.time ?? "", limit: 5)
        self.timezone = coachTrim(entry.timezone ?? TimeZone.current.identifier, limit: 80)
    }
}

private func coachTrim(_ value: String, limit: Int) -> String {
    String(value.trimmingCharacters(in: .whitespacesAndNewlines).prefix(limit))
}

private func coachDouble(_ value: String) -> Double? {
    let trimmed = coachTrim(value, limit: 24)
    if trimmed.isEmpty { return nil }
    let number = Double(trimmed)
    return number?.isFinite == true ? number : nil
}

private func coachInt(_ value: String) -> Int? {
    guard let parsed = coachDouble(value) else { return nil }
    return Int(parsed.rounded(.towardZero))
}

private func coachValidHHMM(_ value: String) -> String? {
    let text = coachTrim(value, limit: 5)
    if text.isEmpty { return nil }
    let regex = #"^\d{2}:\d{2}$"#
    if text.range(of: regex, options: .regularExpression) == nil { return nil }
    return text
}

private func coachNumberString(_ value: Double?) -> String {
    guard let value else { return "" }
    if abs(value - value.rounded()) < 0.00001 {
        return String(Int(value.rounded()))
    }
    return String(format: "%.2f", value).replacingOccurrences(of: "\\.?0+$", with: "", options: .regularExpression)
}

private func coachRounded(_ value: Double?) -> Int {
    Int((value ?? 0).rounded())
}

private func formatCoachDay(_ day: String) -> String {
    if day.isEmpty { return "-" }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    if let parsed = formatter.date(from: day) {
        let out = DateFormatter()
        out.dateStyle = .medium
        out.timeStyle = .none
        return out.string(from: parsed)
    }
    return day
}

private func parseAPIError(_ data: Data?) -> String? {
    guard let data,
          let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let error = payload["error"] as? String,
          !error.isEmpty else { return nil }
    return error
}

struct APIProfile: Codable {
    let id: Int
    let username: String
    let avatar_url: String?
    let background_url: String?
    let bio: String?
    let fitness_goal: String?
    let hobbies: String?
    let selected_coach: String?
}

struct AuthSessionsResponse: Codable {
    let sessions: [AuthSessionRow]
}

struct AuthSessionRow: Codable, Identifiable {
    var id: String { sessionId }
    let sessionId: String
    let deviceName: String?
    let ipAddress: String?
    let createdAt: String
    let expiresAt: String
    let revokedAt: String?
    let lastSeenAt: String?
    let current: Bool
}

private struct SessionsManagementSheet: View {
    let sessions: [AuthSessionRow]
    let loading: Bool
    let errorText: String
    let revokePendingSessionId: String?
    let logoutOthersPending: Bool
    let onRefresh: () -> Void
    let onRevoke: (String) -> Void
    let onLogoutOthers: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 10) {
                        if loading && sessions.isEmpty {
                            Text("Loading sessions...")
                                .font(.system(size: 13))
                                .foregroundColor(Color.zymSubtext)
                        }

                        ForEach(sessions) { session in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text((session.deviceName?.isEmpty == false) ? (session.deviceName ?? "Unknown device") : "Unknown device")
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundColor(Color.zymText)
                                    Spacer()
                                    if session.current {
                                        Text("Current")
                                            .font(.system(size: 10, weight: .bold))
                                            .foregroundColor(Color.zymPrimaryDark)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(Color.zymSurfaceSoft)
                                            .clipShape(Capsule())
                                    }
                                }

                                Text("\(session.ipAddress ?? "IP unavailable") · Last seen \(formatSessionTime(session.lastSeenAt))")
                                    .font(.system(size: 12))
                                    .foregroundColor(Color.zymSubtext)

                                Text("Created \(formatSessionTime(session.createdAt)) · Expires \(formatSessionTime(session.expiresAt))")
                                    .font(.system(size: 12))
                                    .foregroundColor(Color.zymSubtext)

                                if !session.current {
                                    HStack {
                                        Spacer()
                                        Button(action: { onRevoke(session.sessionId) }) {
                                            Text(revokePendingSessionId == session.sessionId ? "Revoking..." : "Revoke")
                                        }
                                        .buttonStyle(ZYMGhostButton())
                                        .disabled(revokePendingSessionId == session.sessionId || session.revokedAt != nil)
                                    }
                                }
                            }
                            .zymCard()
                        }

                        if !errorText.isEmpty {
                            Text(errorText)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.red)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 8)
                        }
                    }
                    .padding(14)
                }
            }
            .navigationTitle("Sessions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(loading ? "Loading..." : "Refresh") {
                        onRefresh()
                    }
                    .disabled(loading)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(logoutOthersPending ? "Processing..." : "Logout Others") {
                        onLogoutOthers()
                    }
                    .disabled(logoutOthersPending)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

private func formatSessionTime(_ iso: String?) -> String {
    guard let iso, !iso.isEmpty else { return "-" }
    let isoFormatter = ISO8601DateFormatter()
    let displayFormatter = DateFormatter()
    displayFormatter.dateStyle = .medium
    displayFormatter.timeStyle = .short

    if let date = isoFormatter.date(from: iso) {
        return displayFormatter.string(from: date)
    }

    let sqliteFormatter = DateFormatter()
    sqliteFormatter.locale = Locale(identifier: "en_US_POSIX")
    sqliteFormatter.timeZone = TimeZone(secondsFromGMT: 0)
    sqliteFormatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
    if let date = sqliteFormatter.date(from: iso) {
        return displayFormatter.string(from: date)
    }

    return iso
}
