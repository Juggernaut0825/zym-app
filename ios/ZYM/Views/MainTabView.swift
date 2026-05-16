import Foundation
import SwiftUI

struct MainTabView: View {
    @Environment(\.scenePhase) private var scenePhase
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var notificationManager: AppNotificationManager
    @State private var selectedTab = 0
    @State private var showCoachWelcome = false
    @State private var hasPresentedWelcomeThisSession = false
    @State private var showNotificationSettingsPrompt = false
    @State private var hasPromptedForNotificationsThisEntry = false

    var body: some View {
        ZStack {
            TabView(selection: $selectedTab) {
                TodayView()
                    .transition(.opacity.combined(with: .move(edge: .trailing)))
                    .tag(0)
                    .tabItem {
                        Image(systemName: "house.fill")
                            .symbolEffect(.bounce, value: selectedTab)
                        Text("Today")
                    }

                InboxView()
                    .transition(.opacity.combined(with: .move(edge: .trailing)))
                    .tag(1)
                    .tabItem {
                        Image(systemName: "bubble.left.and.bubble.right.fill")
                            .symbolEffect(.bounce, value: selectedTab)
                        Text("Message")
                    }

                FeedView()
                    .transition(.opacity.combined(with: .move(edge: .trailing)))
                    .tag(2)
                    .tabItem {
                        Image(systemName: "sparkles.rectangle.stack.fill")
                            .symbolEffect(.bounce, value: selectedTab)
                        Text("Community")
                    }

                CalendarView()
                    .transition(.opacity.combined(with: .move(edge: .trailing)))
                    .tag(3)
                    .tabItem {
                        Image(systemName: "chart.line.uptrend.xyaxis")
                            .symbolEffect(.bounce, value: selectedTab)
                        Text("Progress")
                    }

                ProfileView()
                    .transition(.opacity.combined(with: .move(edge: .trailing)))
                    .tag(4)
                    .tabItem {
                        Image(systemName: "person.crop.circle.fill")
                            .symbolEffect(.bounce, value: selectedTab)
                        Text("Profile")
                    }
            }
            .animation(.zymSpring, value: selectedTab)
            .tint(Color.zymPrimary)
            .background(Color.zymBackground)

            if showCoachWelcome, appState.isLoggedIn {
                CoachWelcomeFlowView(isPresented: $showCoachWelcome, onComplete: nil)
                    .environmentObject(appState)
                    .transition(.opacity.combined(with: .scale(scale: 0.98)))
                    .zIndex(10)
            }
        }
        .preferredColorScheme(.light)
        .onAppear {
            notificationManager.requestAuthorizationIfNeeded()
            notificationManager.registerForRemoteNotificationsIfAuthorized()
            notificationManager.submitDeviceTokenIfPossible(appState: appState)
            presentCoachWelcomeIfNeeded()
            promptForNotificationSettingsIfNeeded()
        }
        .onChange(of: appState.isLoggedIn) { _, isLoggedIn in
            if isLoggedIn {
                notificationManager.requestAuthorizationIfNeeded()
                notificationManager.registerForRemoteNotificationsIfAuthorized()
                notificationManager.submitDeviceTokenIfPossible(appState: appState)
                presentCoachWelcomeIfNeeded(force: true)
                promptForNotificationSettingsIfNeeded(resetForEntry: true)
            } else {
                showCoachWelcome = false
                hasPresentedWelcomeThisSession = false
                showNotificationSettingsPrompt = false
                hasPromptedForNotificationsThisEntry = false
            }
        }
        .onChange(of: notificationManager.remoteDeviceToken) { _, _ in
            notificationManager.submitDeviceTokenIfPossible(appState: appState)
        }
        .onChange(of: appState.selectedCoach) { _, nextCoach in
            if let nextCoach, !nextCoach.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                hasPresentedWelcomeThisSession = true
                withAnimation(.zymSoft) {
                    showCoachWelcome = false
                }
            }
        }
        .onChange(of: appState.requestedTabIndex) { _, nextTab in
            guard let nextTab else { return }
            selectedTab = nextTab
            DispatchQueue.main.async {
                appState.requestedTabIndex = nil
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                promptForNotificationSettingsIfNeeded(resetForEntry: true)
            } else if phase == .background {
                hasPromptedForNotificationsThisEntry = false
            }
        }
        .alert("Notifications are off", isPresented: $showNotificationSettingsPrompt) {
            Button("Open Settings") {
                notificationManager.openSystemSettings()
            }
            Button("Remind me later", role: .cancel) {}
            Button("Don\u{2019}t remind me again", role: .destructive) {
                UserDefaults.standard.set(true, forKey: "zym.notifications.neverRemind")
            }
        } message: {
            Text("Turn notifications on in Apple Settings so new messages and coach replies can alert you.")
        }
    }

    private func presentCoachWelcomeIfNeeded(force: Bool = false) {
        guard appState.isLoggedIn else { return }
        guard needsCoachWelcome else {
            hasPresentedWelcomeThisSession = true
            showCoachWelcome = false
            return
        }
        if force {
            hasPresentedWelcomeThisSession = false
        }
        guard !hasPresentedWelcomeThisSession else { return }
        hasPresentedWelcomeThisSession = true
        withAnimation(.zymSoft) {
            showCoachWelcome = true
        }
    }

    private var needsCoachWelcome: Bool {
        guard let selectedCoach = appState.selectedCoach else { return true }
        return selectedCoach.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func promptForNotificationSettingsIfNeeded(resetForEntry: Bool = false) {
        guard appState.isLoggedIn else { return }
        guard !UserDefaults.standard.bool(forKey: "zym.notifications.neverRemind") else { return }
        if resetForEntry {
            hasPromptedForNotificationsThisEntry = false
        }
        guard !hasPromptedForNotificationsThisEntry else { return }

        notificationManager.refreshAuthorizationStatus()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            guard appState.isLoggedIn,
                  !hasPromptedForNotificationsThisEntry,
                  notificationManager.shouldPromptToOpenSettings else { return }
            hasPromptedForNotificationsThisEntry = true
            showNotificationSettingsPrompt = true
        }
    }
}

private struct TodayView: View {
    @EnvironmentObject private var appState: AppState

    @State private var today: TodayResponse?
    @State private var challenges: [ChallengeSummary] = []
    @State private var isLoading = true
    @State private var errorText = ""
    @State private var completingExerciseId: String?
    @State private var completingChallengeId: Int?
    @State private var trainingExpanded = true

    private var completedExercises: Int {
        today?.trainingPlan?.exercises.filter { $0.completed_at != nil }.count ?? 0
    }

    private var totalExercises: Int {
        today?.trainingPlan?.exercises.count ?? 0
    }

    private var hasCompletedPlan: Bool {
        totalExercises > 0 && completedExercises == totalExercises
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.zymBackground.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        headerSection
                        trainingSection
                        coachShortcutsSection
                        communitySection
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 12)
                    .padding(.bottom, 28)
                }
                .refreshable {
                    loadAll()
                }
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: loadAll) {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(isLoading)
                }
            }
            .onAppear(perform: loadAll)
            .onChange(of: appState.userId) { _, _ in
                loadAll()
            }
        }
    }

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Today")
                    .font(.system(size: 34, weight: .bold))
                    .foregroundColor(Color.zymText)
                Text(Date().formatted(.dateTime.weekday(.wide).month().day()))
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(Color.zymSubtext)
            }

            HStack(spacing: 8) {
                if experienceMissing {
                    Button(action: openCoachProfile) {
                        TodayPill(text: experienceText, systemImage: "figure.strengthtraining.traditional")
                    }
                    .buttonStyle(.plain)
                } else {
                    TodayPill(text: experienceText, systemImage: "figure.strengthtraining.traditional")
                }
            }

            if isLoading && today == nil {
                ProgressView("Loading Today...")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Color.zymSubtext)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else if !errorText.isEmpty {
                Text(errorText)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.red)
            }
        }
    }

    private var trainingSection: some View {
        TodayCardSection(title: "Training") {
            if let plan = today?.trainingPlan {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .center, spacing: 12) {
                        ZStack {
                            Circle()
                                .fill(Color.zymSurfaceSoft.opacity(0.92))
                                .frame(width: 52, height: 52)
                            Image(systemName: "dumbbell")
                                .font(.system(size: 21, weight: .semibold))
                                .foregroundColor(Color.zymPrimaryDark)
                        }
                        VStack(alignment: .leading, spacing: 3) {
                            Text(plan.title)
                                .font(.system(size: 20, weight: .bold))
                                .foregroundColor(Color.zymText)
                                .fixedSize(horizontal: false, vertical: true)
                            if trainingExpanded, let summary = plan.summary, !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                Text(summary)
                                    .font(.system(size: 12))
                                    .foregroundColor(Color.zymSubtext)
                                    .lineLimit(2)
                            }
                        }
                        Spacer(minLength: 8)
                        Button {
                            withAnimation(.zymSpring) {
                                trainingExpanded.toggle()
                            }
                        } label: {
                            Image(systemName: "chevron.down")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundColor(Color.zymPrimaryDark)
                                .frame(width: 38, height: 38)
                                .background(Color.zymSurfaceSoft.opacity(0.82))
                                .clipShape(Circle())
                                .rotationEffect(.degrees(trainingExpanded ? 0 : -90))
                        }
                        .buttonStyle(.plain)
                    }

                    if trainingExpanded {
                        if hasCompletedPlan {
                            HStack(spacing: 14) {
                                TodayPlanCompleteGraphic()
                                    .frame(width: 116, height: 86)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Plan complete")
                                        .font(.system(size: 16, weight: .bold))
                                        .foregroundColor(Color.zymText)
                                    Text("You finished every exercise today.")
                                        .font(.system(size: 12))
                                        .foregroundColor(Color.zymSubtext)
                                }
                            }
                            .padding(12)
                            .background(Color.zymSurfaceSoft.opacity(0.54))
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .transition(.opacity.combined(with: .scale(scale: 0.98)))
                        }

                        VStack(spacing: 0) {
                            ForEach(plan.exercises) { exercise in
                                TodayExerciseRow(
                                    exercise: exercise,
                                    weightUnit: preferredWeightUnit,
                                    isPending: completingExerciseId == exercise.id,
                                    onToggle: { completeExercise(exercise) }
                                )
                                if exercise.id != plan.exercises.last?.id {
                                    Divider().background(Color.zymLine)
                                }
                            }
                        }
                    }
                }
            } else {
                HStack(alignment: .center, spacing: 16) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("No plan yet")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(Color.zymText)
                        Button("Ask for today's plan", action: openCoach)
                            .buttonStyle(ZYMPrimaryButton())
                            .padding(.top, 2)
                    }
                    Spacer()
                    TodayPlanEmptyGraphic()
                        .frame(width: 108, height: 92)
                }
            }
        }
    }

    private var coachShortcutsSection: some View {
        TodaySection(title: "Ask coach") {
            VStack(spacing: 10) {
                TodayShortcutButton(title: "I don’t know this exercise", systemImage: "questionmark.circle", action: openCoach)
                TodayShortcutButton(title: "Adjust my plan", systemImage: "slider.horizontal.3", action: openCoach)
            }
        }
    }

    private var communitySection: some View {
        TodaySection(title: "Challenge") {
            if challenges.isEmpty {
                Text("No active challenges yet.")
                    .font(.system(size: 13))
                    .foregroundColor(Color.zymSubtext)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                VStack(spacing: 0) {
                    ForEach(challenges.prefix(3)) { challenge in
                        TodayChallengeRow(
                            challenge: challenge,
                            isOwner: challenge.owner_user_id == appState.userId,
                            isPending: completingChallengeId == challenge.id,
                            onUpdateVisibility: { newVisibility in
                                updateChallengeVisibility(challenge, visibility: newVisibility)
                            },
                            onDelete: {
                                deleteChallenge(challenge)
                            }
                        )
                        if challenge.id != challenges.prefix(3).last?.id {
                            Divider().background(Color.zymLine)
                        }
                    }
                }
            }
        }
    }

    private var primaryGoalText: String {
        let goal = today?.profile.goal?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let goal, !goal.isEmpty {
            return goal
        }
        return "Your next action"
    }

    private var experienceText: String {
        let raw = today?.profile.experience_level?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if raw.isEmpty { return "Experience not set" }
        return coachExperienceLevelOptions.first(where: { $0.value == raw })?.label ?? raw.capitalized
    }

    private var experienceMissing: Bool {
        (today?.profile.experience_level?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "").isEmpty
    }

    private var preferredWeightUnit: String {
        let raw = today?.profile.weight?.lowercased() ?? ""
        return raw.contains("lb") || raw.contains("pound") ? "lb" : "kg"
    }

    private func loadAll() {
        guard appState.userId != nil else { return }
        isLoading = true
        errorText = ""
        loadToday()
        loadChallenges()
    }

    private func loadToday() {
        guard let userId = appState.userId,
              let url = apiURL("/today/\(userId)?timezone=\(urlEncoded(TimeZone.current.identifier))") else { return }
        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, error in
            DispatchQueue.main.async {
                isLoading = false
                if let error {
                    errorText = error.localizedDescription
                    return
                }
                guard let data,
                      let response = try? JSONDecoder().decode(TodayResponse.self, from: data) else {
                    errorText = "Could not load Today."
                    return
                }
                withAnimation(.zymSoft) {
                    today = response
                }
            }
        }.resume()
    }

    private func loadChallenges() {
        guard let userId = appState.userId,
              let url = apiURL("/challenges/\(userId)?day=\(today?.day ?? todayLocalDay())") else { return }
        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            guard let data,
                  let response = try? JSONDecoder().decode(ChallengesResponse.self, from: data) else { return }
            DispatchQueue.main.async {
                challenges = response.challenges
            }
        }.resume()
    }

    private func completeExercise(_ exercise: TrainingPlanExercise) {
        guard let userId = appState.userId,
              let today,
              let url = apiURL("/coach/training-plan/exercise/complete") else { return }
        completingExerciseId = exercise.id
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
            "day": today.day,
            "exerciseId": exercise.id,
            "completed": exercise.completed_at == nil,
            "timezone": TimeZone.current.identifier,
        ])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                completingExerciseId = nil
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard statusCode >= 200 && statusCode < 300,
                      let data,
                      let mutation = try? JSONDecoder().decode(TodayPlanMutationResponse.self, from: data),
                      let plan = mutation.plan else {
                    errorText = "Could not update the plan."
                    return
                }
                withAnimation(.zymSpring) {
                    self.today = TodayResponse(
                        day: today.day,
                        timezone: today.timezone,
                        selectedCoach: today.selectedCoach,
                        profile: today.profile,
                        progress: today.progress,
                        record: today.record,
                        trainingPlan: plan
                    )
                }
            }
        }.resume()
    }

    private func updateChallengeVisibility(_ challenge: ChallengeSummary, visibility: String) {
        guard let userId = appState.userId,
              let url = apiURL("/challenges/\(challenge.id)/visibility") else { return }
        completingChallengeId = challenge.id
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
            "visibility": visibility,
        ])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                completingChallengeId = nil
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard statusCode >= 200 && statusCode < 300 else {
                    errorText = parseAPIError(data) ?? "Could not update challenge visibility."
                    return
                }
                loadChallenges()
            }
        }.resume()
    }

    private func deleteChallenge(_ challenge: ChallengeSummary) {
        guard let userId = appState.userId,
              let url = apiURL("/challenges/\(challenge.id)/delete") else { return }
        completingChallengeId = challenge.id
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
        ])

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                completingChallengeId = nil
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard statusCode >= 200 && statusCode < 300 else {
                    errorText = parseAPIError(data) ?? "Could not delete challenge."
                    return
                }
                loadChallenges()
            }
        }.resume()
    }

    private func openCoach() {
        guard let userId = appState.userId else { return }
        let coach = today?.selectedCoach ?? appState.selectedCoach ?? "zj"
        appState.requestedConversationTopic = coach == "lc" ? "coach_lc_\(userId)" : "coach_\(userId)"
        appState.requestedTabIndex = 1
    }

    private func openCommunity() {
        appState.requestedTabIndex = 2
    }

    private func openCoachProfile() {
        appState.requestedCoachProfileEditor = true
        appState.requestedTabIndex = 4
    }
}

private struct TodayPlanMutationResponse: Decodable {
    let plan: TrainingPlan?
}

private struct TodaySection<Content: View>: View {
    let title: String
    var actionTitle: String?
    var action: (() -> Void)?
    let content: Content

    init(
        title: String,
        actionTitle: String? = nil,
        action: (() -> Void)? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.actionTitle = actionTitle
        self.action = action
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center) {
                Text(title)
                    .font(.system(size: 12, weight: .bold))
                    .tracking(1.1)
                    .foregroundColor(Color.zymSubtext)
                Spacer()
                if let actionTitle, let action {
                    Button(actionTitle, action: action)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color.zymPrimaryDark)
                }
            }

            content
        }
        .padding(.vertical, 4)
    }
}

private struct TodayCardSection<Content: View>: View {
    let title: String
    var actionTitle: String?
    var action: (() -> Void)?
    let content: Content

    init(
        title: String,
        actionTitle: String? = nil,
        action: (() -> Void)? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.actionTitle = actionTitle
        self.action = action
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center) {
                Text(title)
                    .font(.system(size: 12, weight: .bold))
                    .tracking(1.1)
                    .foregroundColor(Color.zymSubtext)
                Spacer()
                if let actionTitle, let action {
                    Button(actionTitle, action: action)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color.zymPrimaryDark)
                }
            }

            content
        }
        .padding(18)
        .background(Color.zymSurface)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.zymLine.opacity(0.75), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.035), radius: 18, x: 0, y: 10)
    }
}

private struct TodayPill: View {
    let text: String
    let systemImage: String

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.system(size: 12, weight: .bold))
            Text(text)
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(1)
        }
        .foregroundColor(Color.zymPrimaryDark)
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(Color.zymSurfaceSoft.opacity(0.82))
        .clipShape(Capsule())
    }
}

private struct TodayExerciseRow: View {
    let exercise: TrainingPlanExercise
    let weightUnit: String
    let isPending: Bool
    let onToggle: () -> Void

    private var isDone: Bool {
        exercise.completed_at != nil
    }

    var body: some View {
        HStack(spacing: 12) {
            ZYMCelebratingCheckButton(
                isDone: isDone,
                isPending: isPending,
                size: 26,
                action: onToggle
            )

            VStack(alignment: .leading, spacing: 4) {
                Text(exercise.name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Color.zymText)
                Text(exerciseSubtitleText)
                    .font(.system(size: 12))
                    .foregroundColor(Color.zymSubtext)
                if let cue = exercise.cue, !cue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text(cue)
                        .font(.system(size: 12))
                        .foregroundColor(Color.zymSubtext.opacity(0.86))
                        .lineLimit(2)
                }
            }
            Spacer()
            Text(exerciseDoseText)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Color.zymPrimaryDark)
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(Color.zymSurfaceSoft.opacity(0.78))
                .clipShape(Capsule())
        }
        .padding(.vertical, 10)
    }

    private var exerciseSubtitleText: String {
        var parts: [String] = []
        if let weight = exercise.target_weight_kg, weight > 0 {
            if weightUnit == "lb" {
                parts.append("\(Int((weight * 2.20462).rounded())) lb")
            } else {
                parts.append("\(Int(weight.rounded())) kg")
            }
        }
        if let rest = exercise.rest_seconds, rest > 0 {
            parts.append("\(rest)s rest")
        }
        return parts.isEmpty ? "Ready" : parts.joined(separator: " · ")
    }

    private var exerciseDoseText: String {
        "\(exercise.sets) x \(exercise.reps)"
    }
}

private struct TodayChallengeRow: View {
    let challenge: ChallengeSummary
    let isOwner: Bool
    let isPending: Bool
    let onUpdateVisibility: (String) -> Void
    let onDelete: () -> Void

    @State private var showDeleteConfirm = false
    @State private var showVisibilityConfirm = false
    @State private var pendingVisibility: String?

    private var isDone: Bool {
        challenge.today_status == "completed"
    }

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(isDone ? Color.zymSecondary.opacity(0.16) : Color.clear)
                    .frame(width: 26, height: 26)
                Circle()
                    .stroke(isDone ? Color.zymSecondary : Color.zymLine, lineWidth: 2)
                    .frame(width: 26, height: 26)
                if isPending {
                    ProgressView().scaleEffect(0.58)
                } else if isDone {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(Color.zymSecondaryDark)
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(challenge.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Color.zymText)
                Text("\(challenge.member_count) members · \(isDone ? "done today" : "open today")")
                    .font(.system(size: 12))
                    .foregroundColor(Color.zymSubtext)
            }

            Spacer()

            if isOwner {
                Menu {
                    let currentVisibility = challenge.visibility ?? "friends"
                    let nextVisibility = currentVisibility == "public" ? "friends" : "public"
                    Button {
                        pendingVisibility = nextVisibility
                        showVisibilityConfirm = true
                    } label: {
                        Label(
                            nextVisibility == "public" ? "Make Public" : "Make Friends Only",
                            systemImage: nextVisibility == "public" ? "globe" : "person.2.fill"
                        )
                    }
                    Button(role: .destructive) {
                        showDeleteConfirm = true
                    } label: {
                        Label("Delete Challenge", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Color.zymSubtext)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 10)
        .alert("Delete this challenge?", isPresented: $showDeleteConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { onDelete() }
        } message: {
            Text("This will permanently remove the challenge and its progress.")
        }
        .alert(
            pendingVisibility == "public" ? "Make challenge public?" : "Make challenge friends only?",
            isPresented: $showVisibilityConfirm
        ) {
            Button("Cancel", role: .cancel) { pendingVisibility = nil }
            Button("Confirm") {
                if let next = pendingVisibility {
                    onUpdateVisibility(next)
                }
                pendingVisibility = nil
            }
        } message: {
            Text(pendingVisibility == "public"
                 ? "Anyone on ZYM will be able to see this challenge."
                 : "Only your friends will see this challenge.")
        }
    }
}

private struct TodayShortcutButton: View {
    let title: String
    let systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: systemImage)
                    .font(.system(size: 14, weight: .semibold))
                    .frame(width: 22)
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .bold))
            }
            .foregroundColor(Color.zymText)
            .padding(13)
            .background(Color.zymSurfaceSoft.opacity(0.62))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

private struct TodayPlanCompleteGraphic: View {
    var body: some View {
        Canvas { context, size in
            let w = size.width
            let h = size.height
            var base = Path()
            base.move(to: CGPoint(x: w * 0.15, y: h * 0.88))
            base.addLine(to: CGPoint(x: w * 0.85, y: h * 0.88))
            context.stroke(base, with: .color(Color.zymSubtext.opacity(0.22)), lineWidth: 5)

            let board = CGRect(x: w * 0.34, y: h * 0.16, width: w * 0.42, height: h * 0.64)
            context.fill(Path(roundedRect: board, cornerRadius: 10), with: .color(Color.zymSurface))
            context.stroke(Path(roundedRect: board, cornerRadius: 10), with: .color(Color.zymLine), lineWidth: 1.4)

            let clip = CGRect(x: w * 0.45, y: h * 0.08, width: w * 0.2, height: h * 0.15)
            context.fill(Path(roundedRect: clip, cornerRadius: 6), with: .color(Color.zymPrimaryDark))

            for index in 0..<3 {
                let y = h * (0.33 + Double(index) * 0.16)
                let checkStart = CGPoint(x: w * 0.41, y: y + h * 0.04)
                var check = Path()
                check.move(to: checkStart)
                check.addLine(to: CGPoint(x: w * 0.45, y: y + h * 0.08))
                check.addLine(to: CGPoint(x: w * 0.53, y: y - h * 0.02))
                context.stroke(check, with: .color(Color.green.opacity(0.82)), lineWidth: 3)

                var line = Path()
                line.move(to: CGPoint(x: w * 0.58, y: y + h * 0.03))
                line.addLine(to: CGPoint(x: w * 0.69, y: y + h * 0.03))
                context.stroke(line, with: .color(Color.zymSubtext.opacity(0.24)), lineWidth: 3)
            }

            let weight = CGRect(x: w * 0.14, y: h * 0.62, width: w * 0.25, height: h * 0.17)
            context.fill(Path(roundedRect: weight, cornerRadius: 10), with: .color(Color.zymPrimaryDark.opacity(0.9)))
            context.fill(Path(ellipseIn: CGRect(x: w * 0.08, y: h * 0.74, width: w * 0.15, height: w * 0.15)), with: .color(Color.zymPrimary.opacity(0.85)))
            context.fill(Path(ellipseIn: CGRect(x: w * 0.29, y: h * 0.74, width: w * 0.15, height: w * 0.15)), with: .color(Color.zymPrimary.opacity(0.85)))
        }
    }
}

private struct TodayPlanEmptyGraphic: View {
    var body: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [Color.zymCoachBlue.opacity(0.16), Color.zymPrimary.opacity(0.06)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 92, height: 92)

            Image(systemName: "figure.run")
                .font(.system(size: 38, weight: .light))
                .foregroundStyle(
                    LinearGradient(
                        colors: [Color.zymPrimaryDark, Color.zymPrimary],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
        }
    }
}

private func todayLocalDay() -> String {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = .current
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: Date())
}

private func urlEncoded(_ value: String) -> String {
    value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value
}
