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
            Button("Later", role: .cancel) {}
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
                        foodSection
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
            .navigationTitle("Today")
            .navigationBarTitleDisplayMode(.large)
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
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(Date().formatted(.dateTime.weekday(.wide).month().day()))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Color.zymSubtext)
                    Text(primaryGoalText)
                        .font(.system(size: 26, weight: .bold))
                        .foregroundColor(Color.zymText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                if hasCompletedPlan {
                    TodayTrophyMark()
                        .frame(width: 54, height: 54)
                        .transition(.scale.combined(with: .opacity))
                }
            }

            HStack(spacing: 8) {
                TodayPill(text: experienceText, systemImage: "figure.strengthtraining.traditional")
                TodayPill(text: "\(completedExercises)/\(max(totalExercises, 1)) done", systemImage: "checkmark.circle")
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
        TodaySection(title: "Training", actionTitle: "Message coach", action: openCoach) {
            if let plan = today?.trainingPlan {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(plan.title)
                            .font(.system(size: 19, weight: .bold))
                            .foregroundColor(Color.zymText)
                        if let summary = plan.summary, !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Text(summary)
                                .font(.system(size: 13))
                                .foregroundColor(Color.zymSubtext)
                        }
                    }

                    VStack(spacing: 0) {
                        ForEach(plan.exercises) { exercise in
                            TodayExerciseRow(
                                exercise: exercise,
                                isPending: completingExerciseId == exercise.id,
                                onToggle: { completeExercise(exercise) }
                            )
                            if exercise.id != plan.exercises.last?.id {
                                Divider().background(Color.zymLine)
                            }
                        }
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Text("No plan yet")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(Color.zymText)
                    Text("Ask your coach what to train today. The plan will appear here after it is saved.")
                        .font(.system(size: 13))
                        .foregroundColor(Color.zymSubtext)
                    Button("Ask for today's plan", action: openCoach)
                        .buttonStyle(ZYMPrimaryButton())
                        .padding(.top, 2)
                }
            }
        }
    }

    private var foodSection: some View {
        TodaySection(title: "Food", actionTitle: "Send meal", action: openCoach) {
            HStack(spacing: 12) {
                TodayMetricTile(title: "Calories", value: caloriesText, caption: "\(today?.record.meals.count ?? 0) meals")
                TodayMetricTile(title: "Protein", value: proteinText, caption: "logged today")
            }
        }
    }

    private var coachShortcutsSection: some View {
        TodaySection(title: "Ask coach") {
            VStack(spacing: 10) {
                TodayShortcutButton(title: "What should I train today?", systemImage: "figure.run", action: openCoach)
                TodayShortcutButton(title: "Check my last meal", systemImage: "camera.viewfinder", action: openCoach)
                TodayShortcutButton(title: "Adjust my plan", systemImage: "slider.horizontal.3", action: openCoach)
            }
        }
    }

    private var communitySection: some View {
        TodaySection(title: "Community", actionTitle: "Open", action: openCommunity) {
            if challenges.isEmpty {
                Text("No active challenges yet. Start one with a friend from Community when you are ready.")
                    .font(.system(size: 13))
                    .foregroundColor(Color.zymSubtext)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                VStack(spacing: 0) {
                    ForEach(challenges.prefix(3)) { challenge in
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(challenge.title)
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundColor(Color.zymText)
                                Text("\(challenge.member_count) members · \(challenge.today_status == "completed" ? "done today" : "open today")")
                                    .font(.system(size: 12))
                                    .foregroundColor(Color.zymSubtext)
                            }
                            Spacer()
                            Image(systemName: challenge.today_status == "completed" ? "checkmark.circle.fill" : "circle")
                                .foregroundColor(challenge.today_status == "completed" ? Color.zymSecondary : Color.zymSubtext)
                        }
                        .padding(.vertical, 9)
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

    private var caloriesText: String {
        guard let total = today?.record.total_intake else { return "0" }
        return "\(Int(total.rounded()))"
    }

    private var proteinText: String {
        let protein = today?.record.meals.reduce(0.0) { partial, meal in
            partial + (meal.protein_g ?? 0)
        } ?? 0
        return "\(Int(protein.rounded()))g"
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

    private func openCoach() {
        guard let userId = appState.userId else { return }
        let coach = today?.selectedCoach ?? appState.selectedCoach ?? "zj"
        appState.requestedConversationTopic = coach == "lc" ? "coach_lc_\(userId)" : "coach_\(userId)"
        appState.requestedTabIndex = 1
    }

    private func openCommunity() {
        appState.requestedTabIndex = 2
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
    let isPending: Bool
    let onToggle: () -> Void

    private var isDone: Bool {
        exercise.completed_at != nil
    }

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onToggle) {
                ZStack {
                    Circle()
                        .stroke(isDone ? Color.zymSecondary : Color.zymLine, lineWidth: 2)
                        .frame(width: 26, height: 26)
                    if isDone {
                        Image(systemName: "checkmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(Color.zymSecondaryDark)
                    } else if isPending {
                        ProgressView()
                            .scaleEffect(0.62)
                    }
                }
            }
            .buttonStyle(.plain)
            .disabled(isPending)

            VStack(alignment: .leading, spacing: 4) {
                Text(exercise.name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Color.zymText)
                Text(exerciseDetailText)
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
        }
        .padding(.vertical, 10)
    }

    private var exerciseDetailText: String {
        var parts = ["\(exercise.sets) sets", exercise.reps]
        if let weight = exercise.target_weight_kg, weight > 0 {
            parts.append("\(Int(weight.rounded())) kg")
        }
        if let rest = exercise.rest_seconds, rest > 0 {
            parts.append("\(rest)s rest")
        }
        return parts.joined(separator: " · ")
    }
}

private struct TodayMetricTile: View {
    let title: String
    let value: String
    let caption: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Color.zymSubtext)
            Text(value)
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(Color.zymText)
            Text(caption)
                .font(.system(size: 12))
                .foregroundColor(Color.zymSubtext)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.zymSurfaceSoft.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
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

private struct TodayTrophyMark: View {
    var body: some View {
        Canvas { context, size in
            let w = size.width
            let h = size.height
            let cupRect = CGRect(x: w * 0.28, y: h * 0.15, width: w * 0.44, height: h * 0.42)
            var cup = Path(roundedRect: cupRect, cornerRadius: w * 0.08)
            cup.addPath(Path(CGRect(x: w * 0.42, y: h * 0.55, width: w * 0.16, height: h * 0.18)))
            cup.addPath(Path(roundedRect: CGRect(x: w * 0.28, y: h * 0.72, width: w * 0.44, height: h * 0.1), cornerRadius: w * 0.04))
            context.fill(cup, with: .color(Color.zymSecondary))

            var leftHandle = Path()
            leftHandle.move(to: CGPoint(x: w * 0.28, y: h * 0.25))
            leftHandle.addCurve(
                to: CGPoint(x: w * 0.28, y: h * 0.48),
                control1: CGPoint(x: w * 0.08, y: h * 0.22),
                control2: CGPoint(x: w * 0.08, y: h * 0.48)
            )
            context.stroke(leftHandle, with: .color(Color.zymSecondaryDark), lineWidth: w * 0.07)

            var rightHandle = Path()
            rightHandle.move(to: CGPoint(x: w * 0.72, y: h * 0.25))
            rightHandle.addCurve(
                to: CGPoint(x: w * 0.72, y: h * 0.48),
                control1: CGPoint(x: w * 0.92, y: h * 0.22),
                control2: CGPoint(x: w * 0.92, y: h * 0.48)
            )
            context.stroke(rightHandle, with: .color(Color.zymSecondaryDark), lineWidth: w * 0.07)

            var shine = Path()
            shine.move(to: CGPoint(x: w * 0.39, y: h * 0.25))
            shine.addLine(to: CGPoint(x: w * 0.53, y: h * 0.25))
            context.stroke(shine, with: .color(Color.white.opacity(0.75)), lineWidth: w * 0.05)
        }
        .padding(5)
        .background(Color.zymSurfaceSoft.opacity(0.86))
        .clipShape(Circle())
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
