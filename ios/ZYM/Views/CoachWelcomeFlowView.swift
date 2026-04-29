import SwiftUI

private struct CoachWelcomeSetupState {
    var coach = ""
    var height = ""
    var weight = ""
    var age = ""
    var bodyFatRange = ""
    var trainingDays = ""
    var gender = ""
    var activityLevel = ""
    var goal = ""
    var experienceLevel = ""
    var notes = ""
}

enum CoachAvatarState {
    case idle
    case talking
    case selected
    case celebrate
}

struct CoachAvatar: View {
    let coach: String
    let state: CoachAvatarState
    let size: CGFloat
    var bubbleText: String = ""
    var showBubble: Bool = false

    @State private var animated = false

    private var normalizedCoach: String { coach == "lc" ? "lc" : "zj" }
    private var isLC: Bool { normalizedCoach == "lc" }
    private var accent: Color { Color.zymCoachAccent(normalizedCoach) }
    private var accentDark: Color { Color.zymCoachAccentDark(normalizedCoach) }
    private var soft: Color { Color.zymCoachSoft(normalizedCoach) }
    private var ink: Color { Color.zymCoachInk(normalizedCoach) }

    private var animation: Animation {
        if isLC {
            return .easeInOut(duration: state == .celebrate ? 0.62 : 1.1)
        }
        return .easeInOut(duration: state == .celebrate ? 0.9 : 1.9)
    }

    private var scale: CGFloat {
        switch state {
        case .selected:
            return animated ? (isLC ? 1.045 : 1.025) : 1
        case .celebrate:
            return animated ? (isLC ? 1.08 : 1.04) : 0.99
        case .talking:
            return animated ? (isLC ? 1.035 : 1.018) : 0.995
        case .idle:
            return animated ? (isLC ? 1.018 : 1.012) : 1
        }
    }

    private var yOffset: CGFloat {
        if isLC {
            return animated ? -2 : 1
        }
        return animated ? -5 : 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: showBubble ? 10 : 0) {
            avatar
            if showBubble && !bubbleText.isEmpty {
                Text(bubbleText)
                    .font(.system(size: max(12, size * 0.13), weight: .semibold))
                    .foregroundColor(Color.zymText)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 13)
                    .padding(.vertical, 11)
                    .background(Color.white.opacity(0.95))
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(accent.opacity(isLC ? 0.22 : 0.16), lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .shadow(color: Color.black.opacity(0.06), radius: 14, x: 0, y: 8)
            }
        }
        .onAppear {
            guard !animated else { return }
            withAnimation(animation.repeatForever(autoreverses: true)) {
                animated = true
            }
        }
    }

    private var avatar: some View {
        ZStack {
            Circle()
                .stroke(Color.white.opacity(0.44), lineWidth: max(1, size * 0.012))
                .scaleEffect(x: isLC ? 1.03 : 1.12, y: isLC ? 1.08 : 0.94)
                .rotationEffect(.degrees(isLC ? 18 : -16))

            Circle()
                .stroke(Color.white.opacity(0.28), lineWidth: max(1, size * 0.01))
                .scaleEffect(x: isLC ? 0.92 : 0.96, y: isLC ? 1.04 : 1.1)
                .rotationEffect(.degrees(isLC ? -18 : 20))

            Circle()
                .fill(
                    LinearGradient(
                        colors: [soft.opacity(0.96), accent.opacity(0.95), accentDark.opacity(0.98)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay(
                    Circle()
                        .fill(Color.white.opacity(0.44))
                        .frame(width: size * 0.24, height: size * 0.24)
                        .offset(x: -size * 0.18, y: -size * 0.21)
                )

            face
                .frame(width: size * 0.68, height: size * 0.68)
        }
        .frame(width: size, height: size)
        .scaleEffect(scale)
        .offset(y: yOffset)
        .shadow(color: accent.opacity(state == .selected || state == .celebrate ? 0.28 : 0.16), radius: size * 0.18, x: 0, y: size * 0.1)
    }

    private var face: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.22, style: .continuous)
                .fill(Color.white.opacity(0.9))
                .shadow(color: Color.black.opacity(0.04), radius: 10, x: 0, y: 6)

            eye(x: -0.17)
            eye(x: 0.17)
            brow(x: -0.17, angle: isLC ? 14 : -5)
            brow(x: 0.17, angle: isLC ? -14 : 5)

            Capsule()
                .fill(ink.opacity(0.58))
                .frame(width: size * 0.14, height: (state == .talking && animated) ? size * 0.08 : size * 0.035)
                .offset(y: size * 0.1)

            Text(normalizedCoach.uppercased())
                .font(.system(size: size * 0.11, weight: .black))
                .tracking(1)
                .foregroundColor(ink)
                .offset(y: size * 0.22)
        }
    }

    private func eye(x: CGFloat) -> some View {
        Capsule()
            .fill(Color.zymText.opacity(0.82))
            .frame(width: size * 0.055, height: size * 0.075)
            .offset(x: size * x, y: -size * 0.08)
    }

    private func brow(x: CGFloat, angle: Double) -> some View {
        Capsule()
            .fill(Color.zymText.opacity(isLC ? 0.34 : 0.22))
            .frame(width: size * 0.12, height: size * 0.024)
            .rotationEffect(.degrees(angle))
            .offset(x: size * x, y: -size * 0.17)
    }
}

struct CoachWelcomeFlowView: View {
    @Binding var isPresented: Bool
    let onComplete: (() -> Void)?

    @EnvironmentObject private var appState: AppState

    @State private var step = 0
    @State private var loadingExisting = true
    @State private var pending = false
    @State private var errorText = ""
    @State private var state = CoachWelcomeSetupState()

    private let totalSteps = 4

    private var progress: Double {
        Double(step + 1) / Double(totalSteps)
    }

    private var selectedCoach: String {
        state.coach.isEmpty ? (appState.selectedCoach ?? "zj") : state.coach
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            ZYMBackgroundLayer().ignoresSafeArea()

            ScrollView {
                VStack(spacing: 18) {
                    headerCard

                    if loadingExisting {
                        ProgressView("Loading your saved coach profile...")
                            .frame(maxWidth: .infinity, minHeight: 280)
                            .zymCard()
                    } else {
                        currentStepView
                    }

                    if !errorText.isEmpty {
                        Text(errorText)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(18)
                .padding(.bottom, 104)
            }

            footerBar
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .onAppear(perform: loadExisting)
    }

    private var canContinue: Bool {
        if step == 1 {
            return !state.coach.isEmpty
        }
        return true
    }

    private var footerBar: some View {
        HStack(spacing: 12) {
            Button("Back") {
                withAnimation(.zymSoft) {
                    step = max(0, step - 1)
                }
            }
            .buttonStyle(ZYMGhostButton())
            .disabled(step == 0 || pending || loadingExisting)

            Spacer()

            if step < totalSteps - 1 {
                Button("Continue") {
                    guard canContinue else {
                        errorText = "Choose a coach before continuing."
                        return
                    }
                    errorText = ""
                    withAnimation(.zymSoft) {
                        step = min(totalSteps - 1, step + 1)
                    }
                }
                .buttonStyle(ZYMPrimaryButton())
                .disabled(pending || loadingExisting)
            } else {
                Button(pending ? "Saving..." : "Enter ZYM") {
                    saveAndFinish()
                }
                .buttonStyle(ZYMPrimaryButton())
                .disabled(pending || loadingExisting)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
        .padding(.bottom, 14)
        .background(
            LinearGradient(
                colors: [Color.white.opacity(0), Color.white.opacity(0.92), Color.white],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea(edges: .bottom)
        )
    }

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("WELCOME SETUP")
                        .font(.system(size: 11, weight: .bold))
                        .tracking(1.6)
                        .foregroundColor(Color.zymSubtext)
                    Text(stepTitle)
                        .font(.custom("Syne", size: 32))
                        .foregroundColor(Color.zymText)
                    Text(stepSubtitle)
                        .font(.system(size: 14))
                        .foregroundColor(Color.zymSubtext)
                }
                Spacer()
                Text("\(step + 1) / \(totalSteps)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Color.zymSubtext)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.white.opacity(0.75))
                    .clipShape(Capsule())
            }

            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.white.opacity(0.7))
                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [Color.zymPrimary, Color.zymSecondary],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: max(32, proxy.size.width * progress))
                }
            }
            .frame(height: 8)
        }
        .zymCard()
    }

    @ViewBuilder
    private var currentStepView: some View {
        switch step {
        case 0:
            meetCoachesStep
        case 1:
            coachStep
        case 2:
            basicsStep
        default:
            readyStep
        }
    }

    private var meetCoachesStep: some View {
        VStack(spacing: 14) {
            coachIntroCard(
                coach: "zj",
                lines: [
                    "I'm ZJ. I'll help you stay consistent without making fitness feel overwhelming.",
                    "Tell us your goal, schedule, meals, and training context."
                ]
            )

            coachIntroCard(
                coach: "lc",
                lines: [
                    "I'm LC. I'll keep you accountable and push you when you start drifting.",
                    "Then we turn that into daily meals, workouts, check-ins, and feedback."
                ]
            )
        }
    }

    private func coachIntroCard(coach: String, lines: [String]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            CoachAvatar(
                coach: coach,
                state: .talking,
                size: 104,
                bubbleText: lines.first ?? "",
                showBubble: true
            )

            if lines.count > 1 {
                Text(lines[1])
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color.zymCoachInk(coach))
                    .lineSpacing(4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(Color.zymCoachSoft(coach).opacity(0.74))
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
        }
        .zymCard()
    }

    private var coachStep: some View {
        VStack(spacing: 12) {
            coachCard(
                coach: "zj",
                badge: "Gentle encouragement",
                description: "Warm, supportive, and steady.",
                sample: "I'll help you keep momentum without overcomplicating your day."
            )
            coachCard(
                coach: "lc",
                badge: "Tough accountability",
                description: "Direct, sharp, and demanding.",
                sample: "I'll push you to stop drifting and start executing."
            )
        }
    }

    private var basicsStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            CoachAvatar(
                coach: selectedCoach,
                state: state.goal.isEmpty && state.trainingDays.isEmpty ? .idle : .talking,
                size: 92,
                bubbleText: coachProfilePrompt,
                showBubble: true
            )

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                welcomeInputField("Height", text: $state.height, keyboard: .decimalPad)
                welcomeInputField("Weight", text: $state.weight, keyboard: .decimalPad)
                welcomeInputField("Age", text: $state.age, keyboard: .numberPad)
                welcomeMenu("Gender", selection: $state.gender, options: coachGenderOptions)
                welcomeMenu("Body fat range", selection: $state.bodyFatRange, options: coachBodyFatRangeOptions.map {
                    CoachOption(value: $0.value, label: $0.label, description: nil)
                })
                welcomeMenu("Training days / week", selection: $state.trainingDays, options: coachTrainingDayOptions)
                welcomeMenu("Activity level", selection: $state.activityLevel, options: coachActivityLevelOptions)
                welcomeMenu("Goal", selection: $state.goal, options: coachGoalOptions)
                welcomeMenu("Experience level", selection: $state.experienceLevel, options: coachExperienceLevelOptions)
            }

            TextEditor(text: $state.notes)
                .frame(minHeight: 110)
                .padding(10)
                .background(Color.white.opacity(0.82))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Color.zymLine, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .zymCard()
    }

    private var readyStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            CoachAvatar(
                coach: selectedCoach,
                state: .celebrate,
                size: 118,
                bubbleText: selectedCoach == "lc"
                    ? "Profile saved. Now stop guessing and start executing."
                    : "You're ready. I'll help you build this step by step.",
                showBubble: true
            )

            VStack(alignment: .leading, spacing: 10) {
                Text("COACH PROFILE CARD")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(1.4)
                    .foregroundColor(Color.zymSubtext)

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    readySummaryTile("Coach", state.coach.isEmpty ? "Not selected" : state.coach.uppercased())
                    readySummaryTile("Goal", optionLabel(state.goal, options: coachGoalOptions))
                    readySummaryTile("Height", state.height)
                    readySummaryTile("Weight", state.weight)
                    readySummaryTile("Age", state.age)
                    readySummaryTile("Training days", optionLabel(state.trainingDays, options: coachTrainingDayOptions))
                    readySummaryTile("Activity", optionLabel(state.activityLevel, options: coachActivityLevelOptions))
                    readySummaryTile("Experience", optionLabel(state.experienceLevel, options: coachExperienceLevelOptions))
                }

                if !state.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text(state.notes.trimmingCharacters(in: .whitespacesAndNewlines))
                        .font(.system(size: 13))
                        .foregroundColor(Color.zymText)
                        .lineSpacing(4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(Color.white.opacity(0.84))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            }
        }
        .zymCard()
    }

    private func readySummaryTile(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .bold))
                .tracking(1.2)
                .foregroundColor(Color.zymSubtext)
            Text(value.isEmpty ? "Not set" : value)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(Color.zymText)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color.white.opacity(0.86))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var coachProfilePrompt: String {
        if !state.trainingDays.isEmpty {
            return "I'll build your weekly structure around your available days."
        }
        if !state.goal.isEmpty {
            return "Got it. I'll shape your plan around this goal."
        }
        return selectedCoach == "lc"
            ? "Give me the basics. I'll use this to set your calories and training structure."
            : "Let's set your baseline so I can guide you from the first reply."
    }

    private func coachCard(coach: String, badge: String, description: String, sample: String) -> some View {
        let isSelected = state.coach == coach
        let accent = Color.zymCoachAccent(coach)

        return Button {
            withAnimation(.zymSpring) {
                state.coach = coach
            }
        } label: {
            HStack(alignment: .top, spacing: 14) {
                CoachAvatar(coach: coach, state: isSelected ? .selected : .idle, size: 78)

                VStack(alignment: .leading, spacing: 10) {
                    Text(badge.uppercased())
                        .font(.system(size: 10, weight: .bold))
                        .tracking(1.2)
                        .foregroundColor(Color.zymCoachInk(coach))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.white.opacity(0.82))
                        .clipShape(Capsule())

                    Text(coach.uppercased())
                        .font(.custom("Syne", size: 30))
                        .foregroundColor(Color.zymText)

                    Text(description)
                        .font(.system(size: 13))
                        .foregroundColor(Color.zymSubtext)
                        .multilineTextAlignment(.leading)

                    Text(sample)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Color.zymCoachInk(coach))
                        .multilineTextAlignment(.leading)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(
                LinearGradient(
                    colors: [
                        Color.white.opacity(0.96),
                        Color.zymCoachSoft(coach).opacity(isSelected ? 0.86 : 0.58),
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(accent.opacity(isSelected ? 0.42 : 0.16), lineWidth: isSelected ? 2 : 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .scaleEffect(isSelected ? (coach == "lc" ? 1.018 : 1.01) : 1)
            .shadow(color: accent.opacity(isSelected ? 0.2 : 0.06), radius: 18, x: 0, y: 10)
        }
        .buttonStyle(.plain)
    }

    private func welcomeInputField(_ placeholder: String, text: Binding<String>, keyboard: UIKeyboardType) -> some View {
        TextField(placeholder, text: text)
            .keyboardType(keyboard)
            .padding(12)
            .background(Color.white.opacity(0.82))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.zymLine, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func welcomeMenu(_ label: String, selection: Binding<String>, options: [CoachOption]) -> some View {
        Menu {
            Button("Not set") {
                selection.wrappedValue = ""
            }
            ForEach(options) { option in
                Button(option.label) {
                    selection.wrappedValue = option.value
                }
            }
        } label: {
            HStack {
                Text(selection.wrappedValue.isEmpty ? label : (options.first(where: { $0.value == selection.wrappedValue })?.label ?? selection.wrappedValue))
                    .font(.system(size: 13))
                    .foregroundColor(selection.wrappedValue.isEmpty ? Color.zymSubtext : Color.zymText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
                Spacer(minLength: 6)
                Image(systemName: "chevron.down")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color.zymSubtext)
            }
            .padding(12)
            .background(Color.white.opacity(0.82))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.zymLine, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    private func optionLabel(_ value: String, options: [CoachOption]) -> String {
        guard !value.isEmpty else { return "" }
        return options.first(where: { $0.value == value })?.label ?? value
    }

    private var stepTitle: String {
        switch step {
        case 0: return "Meet your coaches"
        case 1: return "Choose your coach"
        case 2: return "Build your coach profile"
        default: return "You are ready"
        }
    }

    private var stepSubtitle: String {
        switch step {
        case 0: return "A quick hello from the two coaching styles inside ZYM."
        case 1: return "Pick the voice you want to hear when the day gets noisy."
        case 2: return "Give your coach enough context to make the first plan useful."
        default: return "Your coach profile is ready to guide meals, workouts, check-ins, and feedback."
        }
    }

    private func loadExisting() {
        guard let userId = appState.userId,
              let url = apiURL("/coach/records/\(userId)?days=45") else {
            loadingExisting = false
            return
        }

        loadingExisting = true
        errorText = ""

        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            let decoded = data.flatMap { try? JSONDecoder().decode(CoachRecordsResponse.self, from: $0) }

            DispatchQueue.main.async {
                loadingExisting = false
                if let profile = decoded?.profile {
                    state = CoachWelcomeSetupState(
                        coach: decoded?.selectedCoach ?? appState.selectedCoach ?? "",
                        height: coachWelcomeString(profile.height) ?? coachWelcomeNumber(profile.height_cm),
                        weight: coachWelcomeString(profile.weight) ?? coachWelcomeNumber(profile.weight_kg),
                        age: profile.age.map(String.init) ?? "",
                        bodyFatRange: coachBodyFatValueToRange(profile.body_fat_pct),
                        trainingDays: profile.training_days.map(String.init) ?? "",
                        gender: profile.gender ?? "",
                        activityLevel: profile.activity_level ?? "",
                        goal: profile.goal ?? "",
                        experienceLevel: profile.experience_level ?? "",
                        notes: profile.notes ?? ""
                    )
                    if let selectedCoach = decoded?.selectedCoach, !selectedCoach.isEmpty {
                        appState.selectedCoach = selectedCoach
                    }
                } else {
                    state.coach = decoded?.selectedCoach ?? appState.selectedCoach ?? ""
                }
            }
        }.resume()
    }

    private func saveAndFinish() {
        guard let userId = appState.userId,
              let selectURL = apiURL("/coach/select"),
              let updateURL = apiURL("/coach/records/profile/update"),
              !state.coach.isEmpty else {
            errorText = "Choose a coach before finishing setup."
            step = 1
            return
        }

        pending = true
        errorText = ""

        var selectRequest = URLRequest(url: selectURL)
        selectRequest.httpMethod = "POST"
        selectRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&selectRequest, token: appState.token)
        selectRequest.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
            "coach": state.coach,
        ])

        authorizedDataTask(appState: appState, request: selectRequest) { data, response, _ in
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard statusCode >= 200 && statusCode < 300 else {
                DispatchQueue.main.async {
                    pending = false
                    errorText = (data.flatMap { try? JSONDecoder().decode(APIErrorResponse.self, from: $0).error }) ?? "Failed to select coach."
                }
                return
            }

            var body: [String: Any] = [
                "userId": userId,
                "timezone": TimeZone.current.identifier,
                "seed_initial_check_in": true,
            ]
            if !state.height.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { body["height"] = state.height.trimmingCharacters(in: .whitespacesAndNewlines) }
            if !state.weight.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { body["weight"] = state.weight.trimmingCharacters(in: .whitespacesAndNewlines) }
            if let age = Int(state.age.trimmingCharacters(in: .whitespacesAndNewlines)) { body["age"] = age }
            if let trainingDays = Int(state.trainingDays.trimmingCharacters(in: .whitespacesAndNewlines)) { body["training_days"] = trainingDays }
            if let bodyFat = coachBodyFatRangeToValue(state.bodyFatRange) { body["body_fat_pct"] = bodyFat }
            if !state.gender.isEmpty { body["gender"] = state.gender }
            if !state.activityLevel.isEmpty { body["activity_level"] = state.activityLevel }
            if !state.goal.isEmpty { body["goal"] = state.goal }
            if !state.experienceLevel.isEmpty { body["experience_level"] = state.experienceLevel }
            if !state.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { body["notes"] = state.notes.trimmingCharacters(in: .whitespacesAndNewlines) }

            var updateRequest = URLRequest(url: updateURL)
            updateRequest.httpMethod = "POST"
            updateRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
            applyAuthorizationHeader(&updateRequest, token: appState.token)
            updateRequest.httpBody = try? JSONSerialization.data(withJSONObject: body)

            authorizedDataTask(appState: appState, request: updateRequest) { updateData, updateResponse, _ in
                DispatchQueue.main.async {
                    pending = false
                    let updateStatus = (updateResponse as? HTTPURLResponse)?.statusCode ?? 0
                    guard updateStatus >= 200 && updateStatus < 300 else {
                        errorText = (updateData.flatMap { try? JSONDecoder().decode(APIErrorResponse.self, from: $0).error }) ?? "Failed to save your coach profile."
                        return
                    }

                    appState.selectedCoach = state.coach
                    isPresented = false
                    onComplete?()
                }
            }.resume()
        }.resume()
    }
}

private func coachWelcomeNumber(_ value: Double?) -> String {
    guard let value, value.isFinite else { return "" }
    if abs(value.rounded() - value) < 0.00001 {
        return String(Int(value.rounded()))
    }
    return String(format: "%.1f", value)
}

private func coachWelcomeString(_ value: String?) -> String? {
    let trimmed = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
}
