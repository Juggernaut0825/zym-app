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

struct CoachWelcomeFlowView: View {
    @Binding var isPresented: Bool
    let onComplete: (() -> Void)?

    @EnvironmentObject private var appState: AppState

    @State private var step = 0
    @State private var loadingExisting = true
    @State private var pending = false
    @State private var errorText = ""
    @State private var state = CoachWelcomeSetupState()

    private let totalSteps = 5

    private var progress: Double {
        Double(step + 1) / Double(totalSteps)
    }

    var body: some View {
        ZStack {
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
                                    errorText = "Finish this step before continuing."
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
                    .padding(.bottom, 8)
                }
                .padding(18)
            }
        }
        .onAppear(perform: loadExisting)
    }

    private var canContinue: Bool {
        if step == 2 {
            return !state.coach.isEmpty
        }
        return true
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
            introStep
        case 1:
            previewStep
        case 2:
            coachStep
        case 3:
            basicsStep
        default:
            readyStep
        }
    }

    private var introStep: some View {
        VStack(spacing: 14) {
            coachSampleCard(
                title: "What people type",
                accent: Color.zymPrimary,
                lines: [
                    "I am 179 cm, 83 kg, want to cut, and train 4 days a week.",
                    "Can you help me plan meals and tell me what to train today?",
                ]
            )

            coachSampleCard(
                title: "What you get back",
                accent: Color.zymSecondary,
                lines: [
                    "Meal guidance with calories, protein direction, and a believable structure for the day.",
                    "A structured training plan with sets, reps, rest time, and movement demos.",
                    "Sharper follow-up coaching because the coach already knows your baseline and goal.",
                ]
            )
        }
    }

    private var previewStep: some View {
        VStack(spacing: 14) {
            coachSampleCard(
                title: "Input example",
                accent: Color.zymSecondary,
                lines: [
                    "I want a simple upper-body workout for today. I am trying to cut, my shoulders are a little uneven, and I do not want a huge complicated plan.",
                ]
            )

            coachSampleCard(
                title: "Output example",
                accent: Color.zymPrimary,
                lines: [
                    "Upper A",
                    "1. Incline dumbbell press · 4 sets · 8 reps · 90 sec rest",
                    "2. Chest-supported row · 4 sets · 10 reps · 75 sec rest",
                    "3. Cable lateral raise · 3 sets · 12 reps · 60 sec rest",
                    "4. One-arm dumbbell shoulder press · 3 sets · 8 reps each side · 75 sec rest",
                ]
            )
        }
    }

    private var coachStep: some View {
        HStack(spacing: 12) {
            coachCard(
                coach: "zj",
                badge: "Encouraging",
                description: "Thoughtful, supportive, and steady. Best when you want consistency without feeling judged.",
                sample: "I will help you keep momentum without overcomplicating your day."
            )
            coachCard(
                coach: "lc",
                badge: "Strict",
                description: "Direct, sharper, and more demanding. Best when you want structure and accountability.",
                sample: "I will push you to stop drifting and start executing."
            )
        }
    }

    private var basicsStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                welcomeInputField("Height", text: $state.height, keyboard: .decimalPad)
                welcomeInputField("Weight", text: $state.weight, keyboard: .decimalPad)
                welcomeInputField("Age", text: $state.age, keyboard: .numberPad)
            }

            HStack(spacing: 10) {
                welcomeMenu("Gender", selection: $state.gender, options: coachGenderOptions)
                welcomeMenu("Body fat range", selection: $state.bodyFatRange, options: coachBodyFatRangeOptions.map {
                    CoachOption(value: $0.value, label: $0.label, description: nil)
                })
            }

            HStack(spacing: 10) {
                welcomeMenu("Training days / week", selection: $state.trainingDays, options: coachTrainingDayOptions)
                welcomeMenu("Activity level", selection: $state.activityLevel, options: coachActivityLevelOptions)
            }

            HStack(spacing: 10) {
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

            Text("Tell the agent your height, weight, age, goals, injuries, food preferences, or sport focus so it knows you better from the first reply.")
                .font(.system(size: 13))
                .foregroundColor(Color.zymSubtext)
        }
        .zymCard()
    }

    private var readyStep: some View {
        VStack(spacing: 14) {
            coachSampleCard(
                title: "Saved context",
                accent: Color.zymPrimary,
                lines: [
                    "Coach: \(state.coach.isEmpty ? "Not selected" : state.coach.uppercased())",
                    "Goal: \(state.goal.isEmpty ? "Not set" : state.goal)",
                    "Height: \(state.height.isEmpty ? "Not set" : state.height)",
                    "Weight: \(state.weight.isEmpty ? "Not set" : state.weight)",
                    "Age: \(state.age.isEmpty ? "Not set" : state.age)",
                    "Experience: \(state.experienceLevel.isEmpty ? "Not set" : state.experienceLevel)",
                ]
            )

            coachSampleCard(
                title: "What happens next",
                accent: Color.zymSecondary,
                lines: [
                    "The coach can now shape meal feedback, recipes, and training plans around the profile you just saved.",
                    "You can still edit all of this later inside the coach conversation.",
                ]
            )
        }
    }

    private func coachCard(coach: String, badge: String, description: String, sample: String) -> some View {
        let isSelected = state.coach == coach
        let accent = Color.zymCoachAccent(coach)

        return Button {
            withAnimation(.zymSpring) {
                state.coach = coach
            }
        } label: {
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
                    .font(.custom("Syne", size: 32))
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
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(
                LinearGradient(
                    colors: [
                        Color.white.opacity(0.96),
                        Color.zymCoachSoft(coach).opacity(isSelected ? 0.82 : 0.64),
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(accent.opacity(isSelected ? 0.34 : 0.16), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: accent.opacity(isSelected ? 0.18 : 0.06), radius: 16, x: 0, y: 10)
        }
        .buttonStyle(.plain)
    }

    private func coachSampleCard(title: String, accent: Color, lines: [String]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .bold))
                .tracking(1.4)
                .foregroundColor(Color.zymSubtext)

            ForEach(lines, id: \.self) { line in
                Text(line)
                    .font(.system(size: 14, weight: title == "Output example" && line == "Upper A" ? .semibold : .regular))
                    .foregroundColor(Color.zymText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.white.opacity(0.88))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(accent.opacity(0.14), lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
        .zymCard()
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
                    .foregroundColor(selection.wrappedValue.isEmpty ? Color.zymSubtext : Color.zymText)
                Spacer()
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

    private var stepTitle: String {
        switch step {
        case 0: return "See what this turns into"
        case 1: return "Preview the outcome"
        case 2: return "Choose your coach"
        case 3: return "Fill the basics"
        default: return "You are ready"
        }
    }

    private var stepSubtitle: String {
        switch step {
        case 0: return "A quick setup makes the first conversation feel guided instead of blank."
        case 1: return "ZYM works better when you know what kind of recipes, plans, and check-ins it can produce."
        case 2: return "Pick the coaching energy you want to hear every day."
        case 3: return "Tell the agent your height, weight, age, goal, and training context so it can personalize your output."
        default: return "We will save this into your coach profile so meals, plans, and feedback feel tailored from the start."
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
                        coach: appState.selectedCoach ?? "",
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
                } else {
                    state.coach = appState.selectedCoach ?? ""
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
            step = 2
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
