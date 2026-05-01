import SwiftUI

private struct CoachWelcomeSetupState {
    var coach = ""
    var height = ""
    var heightUnit = "cm"
    var weight = ""
    var weightUnit = "kg"
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

enum CoachAvatarVariant {
    case profile
    case hero
}

enum CoachAnimationMode {
    case `static`
    case loop
}

enum CoachBubbleTone {
    case soft
    case strong
}

enum CoachBubbleAlignment {
    case leading
    case trailing
    case center
}

enum CoachBubbleTailDirection {
    case left
    case right
    case topLeft
    case topRight
    case none
}

private struct CoachUnitOption: Identifiable {
    let value: String
    let label: String
    var id: String { value }
}

private let coachHeightUnitOptions = [
    CoachUnitOption(value: "cm", label: "cm"),
    CoachUnitOption(value: "ft_in", label: "ft/in"),
]

private let coachWeightUnitOptions = [
    CoachUnitOption(value: "kg", label: "kg"),
    CoachUnitOption(value: "lb", label: "lb"),
]

private struct CoachArtConfig {
    let id: String
    let name: String
    let heroImageName: String
    let avatarImageName: String
}

private func coachArt(_ coach: String) -> CoachArtConfig {
    if coach == "lc" {
        return CoachArtConfig(id: "lc", name: "LC", heroImageName: "CoachLCHero", avatarImageName: "CoachLCAvatar")
    }
    return CoachArtConfig(id: "zj", name: "ZJ", heroImageName: "CoachZJHero", avatarImageName: "CoachZJAvatar")
}

struct CoachAvatar: View {
    let coach: String
    let state: CoachAvatarState
    let size: CGFloat
    var variant: CoachAvatarVariant = .profile
    var animated: Bool = true
    var bubbleText: String = ""
    var showBubble: Bool = false

    private var art: CoachArtConfig { coachArt(coach) }

    private var scale: CGFloat {
        1
    }

    private var yOffset: CGFloat {
        0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: showBubble ? 10 : 0) {
            imageView
            if showBubble && !bubbleText.isEmpty {
                CoachSpeechBubble(text: bubbleText, coach: art.id, tailDirection: .topLeft)
            }
        }
    }

    @ViewBuilder
    private var imageView: some View {
        switch variant {
        case .profile:
            Image(art.avatarImageName)
                .resizable()
                .scaledToFill()
                .frame(width: size, height: size)
                .clipShape(Circle())
                .scaleEffect(scale)
                .offset(y: yOffset)
        case .hero:
            Image(art.heroImageName)
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size * 1.35)
                .blendMode(.multiply)
                .scaleEffect(scale)
                .offset(y: yOffset)
        }
    }
}

struct CoachHero: View {
    let coach: String
    var animationMode: CoachAnimationMode = .loop
    var state: CoachAvatarState = .idle
    var size: CGFloat = 230
    var showBubble = false
    var bubbleText = ""
    var bubbleTone: CoachBubbleTone = .soft
    var bubbleAlignment: CoachBubbleAlignment = .leading
    var tailDirection: CoachBubbleTailDirection = .left

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .center, spacing: 14) {
                heroImage
                bubble(tailDirection)
            }

            VStack(alignment: .leading, spacing: 10) {
                heroImage
                bubble(.topLeft)
            }
        }
    }

    private var heroImage: some View {
        CoachAvatar(
            coach: coach,
            state: state,
            size: size,
            variant: .hero,
            animated: animationMode == .loop
        )
    }

    @ViewBuilder
    private func bubble(_ direction: CoachBubbleTailDirection) -> some View {
        if showBubble && !bubbleText.isEmpty {
            CoachSpeechBubble(
                text: bubbleText,
                coach: coach,
                tone: bubbleTone,
                alignment: bubbleAlignment,
                tailDirection: direction
            )
        }
    }
}

struct CoachSpeechBubble: View {
    let text: String
    let coach: String
    var tone: CoachBubbleTone = .soft
    var alignment: CoachBubbleAlignment = .leading
    var tailDirection: CoachBubbleTailDirection = .left

    private var coachId: String { coach == "lc" ? "lc" : "zj" }
    private var fill: Color {
        if coachId == "lc" {
            return tone == .strong ? Color(red: 1.0, green: 0.9, blue: 0.77) : Color(red: 1.0, green: 0.95, blue: 0.88)
        }
        return tone == .strong ? Color(red: 0.89, green: 0.92, blue: 1.0) : Color(red: 0.95, green: 0.96, blue: 1.0)
    }
    private var stroke: Color { Color.zymCoachAccent(coachId).opacity(coachId == "lc" ? 0.24 : 0.2) }

    var body: some View {
        Text(text)
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(Color.zymCoachInk(coachId))
            .lineSpacing(4)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 15)
            .padding(.vertical, 12)
            .frame(maxWidth: 270, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(fill)
                    .shadow(color: Color.black.opacity(0.06), radius: 16, x: 0, y: 9)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(stroke, lineWidth: 1)
            )
            .frame(maxWidth: .infinity, alignment: frameAlignment)
    }

    private var frameAlignment: Alignment {
        switch alignment {
        case .leading: return .leading
        case .trailing: return .trailing
        case .center: return .center
        }
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
    @State private var introComplete = false
    @State private var state = CoachWelcomeSetupState()

    private let totalSteps = 3

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
        .onAppear {
            loadExisting()
            scheduleIntroReveal()
        }
    }

    private var canContinue: Bool {
        if step == 0 {
            return introComplete && !state.coach.isEmpty
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
                .disabled(pending || loadingExisting || (step == 0 && !introComplete))
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
                    Text(stepTitle)
                        .font(.custom("Syne", size: 32))
                        .foregroundColor(Color.zymText)
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
            basicsStep
        default:
            readyStep
        }
    }

    private var meetCoachesStep: some View {
        VStack(spacing: 18) {
            VStack(spacing: 12) {
                coachDialogueRow(
                    coach: "zj",
                    text: "Hi, I'm ZJ! I'll help you build steady habits and encourage you in the process.",
                    delay: 0
                )

                coachDialogueRow(
                    coach: "lc",
                    text: "Hey, I'm LC! I'll keep the plan sharp and call out drift before it becomes a pattern.",
                    delay: 2
                )

                coachDialogueRow(
                    coach: "zj",
                    text: "Share your goal, schedule, meals, and training context. Then we can turn it into records, check-ins, and feedback!",
                    delay: 4
                )
            }
            .opacity(introComplete ? 0.34 : 1)
            .blur(radius: introComplete ? 1.2 : 0)
            .scaleEffect(introComplete ? 0.985 : 1)
            .animation(.zymSoft, value: introComplete)

            if introComplete {
                VStack(spacing: 12) {
                    HStack(spacing: 12) {
                        compactCoachChoice(coach: "zj", badge: "Gentle encouragement")
                        compactCoachChoice(coach: "lc", badge: "Tough accountability")
                    }
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .zymCard()
    }

    private func coachDialogueRow(coach: String, text: String, delay: Double) -> some View {
        HStack(alignment: .center, spacing: 12) {
            if coach == "lc" {
                Spacer(minLength: 0)
                CoachSpeechBubble(text: text, coach: coach, tone: .strong, tailDirection: .right)
                CoachAvatar(coach: coach, state: .talking, size: 58)
            } else {
                CoachAvatar(coach: coach, state: .talking, size: 58)
                CoachSpeechBubble(text: text, coach: coach, tailDirection: .left)
                Spacer(minLength: 0)
            }
        }
        .zymAppear(delay: delay)
    }

    private func compactCoachChoice(coach: String, badge: String) -> some View {
        let isSelected = state.coach == coach
        let accent = Color.zymCoachAccent(coach)

        return Button {
            withAnimation(.zymSpring) {
                state.coach = coach
            }
        } label: {
            VStack(spacing: 10) {
                CoachAvatar(coach: coach, state: isSelected ? .selected : .idle, size: 68)
                Text(coach.uppercased())
                    .font(.custom("Syne", size: 26))
                    .foregroundColor(Color.zymText)
                Text(badge.uppercased())
                    .font(.system(size: 9, weight: .bold))
                    .tracking(1.0)
                    .foregroundColor(Color.zymCoachInk(coach))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity, minHeight: 136)
            .padding(12)
            .background(Color.white.opacity(isSelected ? 0.96 : 0.74))
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(accent.opacity(isSelected ? 0.42 : 0.16), lineWidth: isSelected ? 2 : 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: Color.black.opacity(isSelected ? 0.08 : 0.03), radius: 14, x: 0, y: 8)
        }
        .buttonStyle(.plain)
    }

    private var basicsStep: some View {
        let weightUnitBinding = Binding<String>(
            get: { state.weightUnit },
            set: { newUnit in
                let oldUnit = state.weightUnit
                state.weight = coachWelcomeConvertWeight(state.weight, from: oldUnit, to: newUnit)
                state.weightUnit = newUnit
            }
        )

        return VStack(alignment: .leading, spacing: 14) {
            CoachAvatar(
                coach: selectedCoach,
                state: state.goal.isEmpty && state.trainingDays.isEmpty ? .idle : .talking,
                size: 92,
                bubbleText: coachProfilePrompt,
                showBubble: true
            )

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                welcomeMeasurementField(
                    "Height",
                    text: $state.height,
                    unit: $state.heightUnit,
                    options: coachHeightUnitOptions,
                    placeholder: state.heightUnit == "cm" ? "180" : "5'11\"",
                    keyboard: state.heightUnit == "cm" ? .decimalPad : .default,
                    suffix: state.heightUnit == "cm" ? "cm" : "ft/in"
                )
                welcomeMeasurementField(
                    "Weight",
                    text: $state.weight,
                    unit: weightUnitBinding,
                    options: coachWeightUnitOptions,
                    placeholder: state.weightUnit == "kg" ? "81.5" : "180",
                    keyboard: .decimalPad,
                    suffix: state.weightUnit
                )
                welcomeInputField("Age", text: $state.age, keyboard: .numberPad, unit: "years")
                welcomeMenu("Gender", selection: $state.gender, options: coachGenderOptions)
                welcomeMenu("Body fat range", selection: $state.bodyFatRange, options: coachBodyFatRangeOptions.map {
                    CoachOption(value: $0.value, label: $0.label, description: nil)
                })
                welcomeMenu("Training days / week", selection: $state.trainingDays, options: coachTrainingDayOptions)
                welcomeMenu("Activity level", selection: $state.activityLevel, options: coachActivityLevelOptions)
                welcomeMenu("Experience level", selection: $state.experienceLevel, options: coachExperienceLevelOptions)
            }

            welcomeInputField("Goal", text: $state.goal, keyboard: .default, placeholder: "Maintain strength while leaning out")

            VStack(alignment: .leading, spacing: 6) {
                Text("EXTRA NOTES")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1.1)
                    .foregroundColor(Color.zymSubtext)

                ZStack(alignment: .topLeading) {
                    if state.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text("Injuries, sport focus, schedule, food preferences...")
                            .font(.system(size: 13))
                            .foregroundColor(Color.zymSubtext.opacity(0.78))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 16)
                    }

                    TextEditor(text: $state.notes)
                        .frame(minHeight: 110)
                        .padding(10)
                        .scrollContentBackground(.hidden)
                }
                .background(Color.white.opacity(0.82))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Color.zymLine, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
        .zymCard()
    }

    private var readyStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            CoachAvatar(
                coach: selectedCoach,
                state: .celebrate,
                size: 92,
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
                    readySummaryTile("Goal", state.goal)
                    readySummaryTile("Height", coachWelcomeHeightDisplay(state.height, unit: state.heightUnit))
                    readySummaryTile("Weight", coachWelcomeWeightDisplay(state.weight, unit: state.weightUnit))
                    readySummaryTile("Age", state.age.isEmpty ? "" : "\(state.age) years")
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

    private func welcomeMeasurementField(
        _ label: String,
        text: Binding<String>,
        unit: Binding<String>,
        options: [CoachUnitOption],
        placeholder: String,
        keyboard: UIKeyboardType,
        suffix: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(label.uppercased())
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1.1)
                    .foregroundColor(Color.zymSubtext)
                Spacer(minLength: 6)
                Picker("", selection: unit) {
                    ForEach(options) { option in
                        Text(option.label).tag(option.value)
                    }
                }
                .pickerStyle(.segmented)
                .frame(width: label == "Height" ? 114 : 90)
            }

            welcomeInputBody(placeholder: placeholder, text: text, keyboard: keyboard, unit: suffix)
        }
    }

    private func welcomeInputField(_ label: String, text: Binding<String>, keyboard: UIKeyboardType, placeholder: String? = nil, unit: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .bold))
                .tracking(1.1)
                .foregroundColor(Color.zymSubtext)
            welcomeInputBody(placeholder: placeholder ?? label, text: text, keyboard: keyboard, unit: unit)
        }
    }

    private func welcomeInputBody(placeholder: String, text: Binding<String>, keyboard: UIKeyboardType, unit: String? = nil) -> some View {
        ZStack(alignment: .trailing) {
            TextField(placeholder, text: text)
                .keyboardType(keyboard)
                .padding(12)
                .padding(.trailing, unit == nil ? 0 : 54)
                .background(Color.white.opacity(0.82))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Color.zymLine, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            if let unit {
                Text(unit)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color.zymSubtext)
                    .padding(.trailing, 12)
            }
        }
    }

    private func welcomeMenu(_ label: String, selection: Binding<String>, options: [CoachOption]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .bold))
                .tracking(1.1)
                .foregroundColor(Color.zymSubtext)

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
                    Text(selection.wrappedValue.isEmpty ? "Select \(label.lowercased())" : (options.first(where: { $0.value == selection.wrappedValue })?.label ?? selection.wrappedValue))
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
    }

    private func optionLabel(_ value: String, options: [CoachOption]) -> String {
        guard !value.isEmpty else { return "" }
        return options.first(where: { $0.value == value })?.label ?? value
    }

    private var stepTitle: String {
        switch step {
        case 0: return "Meet your coaches"
        case 1: return "Build your coach profile"
        default: return "You are ready"
        }
    }

    private func scheduleIntroReveal() {
        introComplete = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 6.0) {
            withAnimation(.zymSoft) {
                introComplete = true
            }
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
                    let height = coachWelcomeHeightValue(profile.height, fallbackCm: profile.height_cm)
                    let weight = coachWelcomeWeightValue(profile.weight, fallbackKg: profile.weight_kg)
                    state = CoachWelcomeSetupState(
                        coach: decoded?.selectedCoach ?? appState.selectedCoach ?? "",
                        height: height.value,
                        heightUnit: height.unit,
                        weight: weight.value,
                        weightUnit: weight.unit,
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
            step = 0
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
            if let height = coachWelcomeHeightPayload(state.height, unit: state.heightUnit) { body["height"] = height }
            if let weight = coachWelcomeWeightPayload(state.weight, unit: state.weightUnit) { body["weight"] = weight }
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

private func coachWelcomeHeightValue(_ value: String?, fallbackCm: Double?) -> (value: String, unit: String) {
    guard let raw = coachWelcomeString(value) else {
        return (coachWelcomeNumber(fallbackCm), "cm")
    }
    let lower = raw.lowercased()
    if lower.contains("'") || lower.contains("\"") || lower.contains("ft") || lower.contains("inch") || lower.contains(" in") {
        return (raw.replacingOccurrences(of: " ", with: ""), "ft_in")
    }
    return (coachWelcomeStripSuffix(raw, suffixes: ["centimeters", "centimeter", "cm"]), "cm")
}

private func coachWelcomeWeightValue(_ value: String?, fallbackKg: Double?) -> (value: String, unit: String) {
    guard let raw = coachWelcomeString(value) else {
        return (coachWelcomeNumber(fallbackKg), "kg")
    }
    let lower = raw.lowercased()
    if lower.hasSuffix("lb") || lower.hasSuffix("lbs") || lower.hasSuffix("pound") || lower.hasSuffix("pounds") {
        return (coachWelcomeStripSuffix(raw, suffixes: ["pounds", "pound", "lbs", "lb"]), "lb")
    }
    return (coachWelcomeStripSuffix(raw, suffixes: ["kilograms", "kilogram", "kgs", "kg"]), "kg")
}

private func coachWelcomeHeightPayload(_ value: String, unit: String) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    return unit == "ft_in" ? trimmed : "\(trimmed) cm"
}

private func coachWelcomeWeightPayload(_ value: String, unit: String) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    return "\(trimmed) \(unit == "lb" ? "lb" : "kg")"
}

private func coachWelcomeHeightDisplay(_ value: String, unit: String) -> String {
    coachWelcomeHeightPayload(value, unit: unit) ?? ""
}

private func coachWelcomeWeightDisplay(_ value: String, unit: String) -> String {
    coachWelcomeWeightPayload(value, unit: unit) ?? ""
}

private func coachWelcomeConvertWeight(_ value: String, from oldUnit: String, to newUnit: String) -> String {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard oldUnit != newUnit, let numeric = Double(trimmed), numeric > 0 else {
        return value
    }
    let converted = newUnit == "lb" ? numeric * 2.2046226218 : numeric * 0.45359237
    if abs(converted.rounded() - converted) < 0.00001 {
        return String(Int(converted.rounded()))
    }
    return String(format: "%.1f", converted)
}

private func coachWelcomeStripSuffix(_ value: String, suffixes: [String]) -> String {
    var output = value.trimmingCharacters(in: .whitespacesAndNewlines)
    let lower = output.lowercased()
    if let suffix = suffixes.first(where: { lower.hasSuffix($0) }) {
        output = String(output.dropLast(suffix.count))
    }
    return output.trimmingCharacters(in: .whitespacesAndNewlines)
}
