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

private struct CoachArtConfig {
    let id: String
    let name: String
    let heroImageName: String
    let faceCenterX: CGFloat
    let faceCenterY: CGFloat
    let zoom: CGFloat
}

private func coachArt(_ coach: String) -> CoachArtConfig {
    if coach == "lc" {
        return CoachArtConfig(id: "lc", name: "LC", heroImageName: "CoachLCHero", faceCenterX: 0.5, faceCenterY: 0.38, zoom: 2.08)
    }
    return CoachArtConfig(id: "zj", name: "ZJ", heroImageName: "CoachZJHero", faceCenterX: 0.5, faceCenterY: 0.38, zoom: 2.08)
}

struct CoachAvatar: View {
    let coach: String
    let state: CoachAvatarState
    let size: CGFloat
    var variant: CoachAvatarVariant = .profile
    var animated: Bool = true
    var bubbleText: String = ""
    var showBubble: Bool = false

    @State private var animationTick = false

    private var art: CoachArtConfig { coachArt(coach) }
    private var isLC: Bool { art.id == "lc" }
    private var accent: Color { Color.zymCoachAccent(art.id) }

    private var animation: Animation {
        if isLC {
            return .easeInOut(duration: state == .celebrate ? 0.72 : 1.25)
        }
        return .easeInOut(duration: state == .celebrate ? 0.9 : 2.2)
    }

    private var scale: CGFloat {
        guard animated else { return 1 }
        switch state {
        case .selected:
            return animationTick ? (isLC ? 1.045 : 1.025) : 1
        case .celebrate:
            return animationTick ? (isLC ? 1.08 : 1.04) : 0.99
        case .talking:
            return animationTick ? (isLC ? 1.035 : 1.018) : 0.995
        case .idle:
            return animationTick ? (isLC ? 1.018 : 1.012) : 1
        }
    }

    private var yOffset: CGFloat {
        guard animated else { return 0 }
        if isLC {
            return animationTick ? -2 : 1
        }
        return animationTick ? -5 : 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: showBubble ? 10 : 0) {
            imageView
            if showBubble && !bubbleText.isEmpty {
                CoachSpeechBubble(text: bubbleText, coach: art.id, tailDirection: .topLeft)
            }
        }
        .onAppear {
            guard animated, !animationTick else { return }
            withAnimation(animation.repeatForever(autoreverses: true)) {
                animationTick = true
            }
        }
    }

    @ViewBuilder
    private var imageView: some View {
        switch variant {
        case .profile:
            Circle()
                .fill(Color.white)
                .overlay(
                    Image(art.heroImageName)
                        .resizable()
                        .scaledToFit()
                        .scaleEffect(art.zoom)
                        .offset(
                            x: (0.5 - art.faceCenterX) * size * art.zoom,
                            y: (0.5 - art.faceCenterY) * size * art.zoom
                        )
                )
                .clipShape(Circle())
                .overlay(
                    Circle()
                        .stroke(Color.white.opacity(0.9), lineWidth: max(2, size * 0.035))
                )
                .frame(width: size, height: size)
                .scaleEffect(scale)
                .offset(y: yOffset)
                .shadow(color: accent.opacity(state == .selected || state == .celebrate ? 0.3 : 0.16), radius: size * 0.18, x: 0, y: size * 0.1)
        case .hero:
            Image(art.heroImageName)
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
                .scaleEffect(scale)
                .offset(y: yOffset)
                .shadow(color: accent.opacity(state == .selected || state == .celebrate ? 0.24 : 0.12), radius: size * 0.1, x: 0, y: size * 0.06)
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
            .overlay(alignment: tailAlignment) {
                if tailDirection != .none {
                    CoachBubbleTail()
                        .fill(fill)
                        .frame(width: 18, height: 18)
                        .rotationEffect(.degrees(tailRotation))
                        .overlay(
                            CoachBubbleTail()
                                .stroke(stroke, lineWidth: 1)
                                .rotationEffect(.degrees(tailRotation))
                        )
                        .offset(tailOffset)
                }
            }
            .frame(maxWidth: .infinity, alignment: frameAlignment)
    }

    private var frameAlignment: Alignment {
        switch alignment {
        case .leading: return .leading
        case .trailing: return .trailing
        case .center: return .center
        }
    }

    private var tailAlignment: Alignment {
        switch tailDirection {
        case .left: return .leading
        case .right: return .trailing
        case .topLeft: return .topLeading
        case .topRight: return .topTrailing
        case .none: return .center
        }
    }

    private var tailRotation: Double {
        switch tailDirection {
        case .left: return 45
        case .right: return 225
        case .topLeft, .topRight: return 135
        case .none: return 0
        }
    }

    private var tailOffset: CGSize {
        switch tailDirection {
        case .left: return CGSize(width: -8, height: 0)
        case .right: return CGSize(width: 8, height: 0)
        case .topLeft: return CGSize(width: 22, height: -8)
        case .topRight: return CGSize(width: -22, height: -8)
        case .none: return .zero
        }
    }
}

private struct CoachBubbleTail: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
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
                    "I'm ZJ. I'll help you build steady habits without making fitness feel overwhelming.",
                    "Share your goal, schedule, meals, and training context."
                ]
            )

            coachIntroCard(
                coach: "lc",
                lines: [
                    "I'm LC. I'll keep the plan sharp and call out drift before it becomes a pattern.",
                    "Then ZYM turns it into meals, workouts, check-ins, and feedback."
                ]
            )
        }
    }

    private func coachIntroCard(coach: String, lines: [String]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            CoachHero(
                coach: coach,
                state: .talking,
                size: 204,
                showBubble: true,
                bubbleText: lines.first ?? "",
                bubbleTone: coach == "lc" ? .strong : .soft,
                tailDirection: .left
            )

            if lines.count > 1 {
                CoachSpeechBubble(
                    text: lines[1],
                    coach: coach,
                    tone: coach == "lc" ? .strong : .soft,
                    tailDirection: .topLeft
                )
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
                welcomeInputField("Height", text: $state.height, keyboard: .decimalPad, unit: "cm")
                welcomeInputField("Weight", text: $state.weight, keyboard: .decimalPad, unit: "kg")
                welcomeInputField("Age", text: $state.age, keyboard: .numberPad, unit: "years")
                welcomeMenu("Gender", selection: $state.gender, options: coachGenderOptions)
                welcomeMenu("Body fat range", selection: $state.bodyFatRange, options: coachBodyFatRangeOptions.map {
                    CoachOption(value: $0.value, label: $0.label, description: nil)
                })
                welcomeMenu("Training days / week", selection: $state.trainingDays, options: coachTrainingDayOptions)
                welcomeMenu("Activity level", selection: $state.activityLevel, options: coachActivityLevelOptions)
                welcomeMenu("Experience level", selection: $state.experienceLevel, options: coachExperienceLevelOptions)
            }

            welcomeInputField("Goal, in your own words", text: $state.goal, keyboard: .default)

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
            CoachHero(
                coach: selectedCoach,
                state: .celebrate,
                size: 204,
                showBubble: true,
                bubbleText: selectedCoach == "lc"
                    ? "Profile saved. Now stop guessing and start executing."
                    : "You're ready. I'll help you build this step by step.",
                bubbleTone: .strong,
                tailDirection: .left
            )

            VStack(alignment: .leading, spacing: 10) {
                Text("COACH PROFILE CARD")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(1.4)
                    .foregroundColor(Color.zymSubtext)

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    readySummaryTile("Coach", state.coach.isEmpty ? "Not selected" : state.coach.uppercased())
                    readySummaryTile("Goal", state.goal)
                    readySummaryTile("Height", state.height.isEmpty ? "" : "\(state.height) cm")
                    readySummaryTile("Weight", state.weight.isEmpty ? "" : "\(state.weight) kg")
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

    private func coachCard(coach: String, badge: String, description: String, sample: String) -> some View {
        let isSelected = state.coach == coach
        let accent = Color.zymCoachAccent(coach)

        return Button {
            withAnimation(.zymSpring) {
                state.coach = coach
            }
        } label: {
            VStack(alignment: .leading, spacing: 14) {
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
                    }
                }

                CoachHero(
                    coach: coach,
                    animationMode: isSelected ? .loop : .static,
                    state: isSelected ? .selected : .idle,
                    size: 148,
                    showBubble: true,
                    bubbleText: sample,
                    bubbleTone: isSelected ? .strong : .soft,
                    tailDirection: .left
                )
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

    private func welcomeInputField(_ placeholder: String, text: Binding<String>, keyboard: UIKeyboardType, unit: String? = nil) -> some View {
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
