import SwiftUI
import AVKit

enum CoachWorkspaceMode: String, CaseIterable {
    case info = "Info"
    case meals = "Meals"
    case trains = "Trains"
    case progress = "Progress"
}

private struct CoachWorkspaceProfileDraft {
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

private struct CoachWorkspaceMealDraft: Identifiable {
    let id = UUID()
    var day: String
    var mealId: String
    var description: String
    var calories: String
    var proteinG: String
    var carbsG: String
    var fatG: String
    var time: String
    var timezone: String

    init(day: String, meal: CoachMealRecord) {
        self.day = day
        self.mealId = meal.id
        self.description = coachDraftString(meal.description, limit: 500)
        self.calories = coachDraftNumber(meal.calories)
        self.proteinG = coachDraftNumber(meal.protein_g)
        self.carbsG = coachDraftNumber(meal.carbs_g)
        self.fatG = coachDraftNumber(meal.fat_g)
        self.time = coachDraftString(meal.time, limit: 5)
        self.timezone = coachDraftString(meal.timezone ?? TimeZone.current.identifier, limit: 80)
    }
}

private struct CoachWorkspaceTrainingDraft: Identifiable {
    let id = UUID()
    var day: String
    var trainingId: String
    var name: String
    var sets: String
    var reps: String
    var weightKg: String
    var notes: String
    var time: String
    var timezone: String

    init(day: String, entry: CoachTrainingRecord) {
        self.day = day
        self.trainingId = entry.id
        self.name = coachDraftString(entry.name, limit: 120)
        self.sets = coachDraftNumber(entry.sets)
        self.reps = coachDraftString(entry.reps, limit: 20)
        self.weightKg = coachDraftNumber(entry.weight_kg)
        self.notes = coachDraftString(entry.notes, limit: 500)
        self.time = coachDraftString(entry.time, limit: 5)
        self.timezone = coachDraftString(entry.timezone ?? TimeZone.current.identifier, limit: 80)
    }
}

private struct CoachWorkspaceMediaPreview: Identifiable {
    let id = UUID()
    let url: URL
    let title: String
}

private struct CoachWorkspaceCheckInDraft {
    var day: String
    var weightKg: String
    var bodyFatPct: String
    var waistCm: String
    var energy: String
    var hunger: String
    var recovery: String
    var adherence: String
    var notes: String

    init(day: String, checkIn: CoachCheckInRecord? = nil) {
        self.day = day
        self.weightKg = coachDraftNumber(checkIn?.weight_kg)
        self.bodyFatPct = coachDraftNumber(checkIn?.body_fat_pct)
        self.waistCm = coachDraftNumber(checkIn?.waist_cm)
        self.energy = checkIn?.energy.map(String.init) ?? ""
        self.hunger = checkIn?.hunger.map(String.init) ?? ""
        self.recovery = checkIn?.recovery.map(String.init) ?? ""
        self.adherence = coachDraftString(checkIn?.adherence, limit: 40)
        self.notes = coachDraftString(checkIn?.notes, limit: 500)
    }
}

private enum CoachProgressViewMode: String, CaseIterable {
    case trend = "Trend"
    case calendar = "Calendar"
}

struct CoachWorkspaceView: View {
    let mode: CoachWorkspaceMode
    let coachId: String
    let onBackToChat: () -> Void
    let onNotice: (String) -> Void
    let onError: (String) -> Void

    @EnvironmentObject private var appState: AppState

    @State private var selectedDate = Date()
    @State private var loadingRecords = false
    @State private var loadingPlan = false
    @State private var saving = false
    @State private var records: CoachRecordsResponse?
    @State private var trainingPlan: CoachTrainingPlanResponse?
    @State private var profileDraft = CoachWorkspaceProfileDraft()
    @State private var mealDraft: CoachWorkspaceMealDraft?
    @State private var trainingDraft: CoachWorkspaceTrainingDraft?
    @State private var checkInDraft = CoachWorkspaceCheckInDraft(day: "")
    @State private var progressViewMode: CoachProgressViewMode = .trend
    @State private var mediaPreview: CoachWorkspaceMediaPreview?

    private var effectiveDay: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone.current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: selectedDate)
    }

    private var selectedDayRecord: CoachDayRecord? {
        records?.records.first(where: { $0.day == effectiveDay })
    }

    private var activePlanExercises: [CoachTrainingPlanExercise] {
        (trainingPlan?.plan?.exercises ?? [])
            .filter { ($0.completed_at ?? "").isEmpty }
            .sorted { $0.order < $1.order }
    }

    private var progressSummary: CoachProgressSummary? {
        records?.progress
    }

    private var headerDescription: String {
        switch mode {
        case .info:
            return "Tell the agent your height, weight, age, goal, and training context so it can know you better."
        case .meals:
            return "Filter by date. If nothing was logged that day, you will see the empty state right away."
        case .progress:
            return "Weight is the main daily signal. Waist and body fat stay optional so check-ins stay fast enough to keep doing."
        case .trains:
            return "Coach plans appear on top. Checked exercises move into your training log below."
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(spacing: 14) {
                    if mode == .info {
                        infoView
                    } else if mode == .meals {
                        mealsView
                    } else if mode == .progress {
                        progressView
                    } else {
                        trainsView
                    }
                }
                .padding(14)
            }
        }
        .onAppear {
            loadRecords()
            resetCheckInDraft()
            if mode == .trains {
                loadTrainingPlan()
            }
        }
        .onChange(of: mode) { _, nextMode in
            loadRecords()
            resetCheckInDraft()
            if nextMode == .trains {
                loadTrainingPlan()
            }
        }
        .onChange(of: effectiveDay) { _, _ in
            resetCheckInDraft()
            if mode == .trains {
                loadTrainingPlan()
            }
        }
        .sheet(item: $mealDraft) { draft in
            CoachMealEditSheet(draft: draft) { updated in
                mealDraft = updated
            } onSave: {
                saveMealDraft()
            }
            .presentationDetents([.medium])
        }
        .sheet(item: $trainingDraft) { draft in
            CoachTrainingEditSheet(draft: draft) { updated in
                trainingDraft = updated
            } onSave: {
                saveTrainingDraft()
            }
            .presentationDetents([.medium, .large])
        }
        .sheet(item: $mediaPreview) { preview in
            CoachWorkspaceMediaSheet(preview: preview)
        }
    }

    private var header: some View {
        VStack(spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(mode.rawValue.uppercased())
                        .font(.system(size: 11, weight: .bold))
                        .tracking(1.4)
                        .foregroundColor(Color.zymSubtext)
                    Text("\(mode.rawValue) Workspace")
                        .font(.custom("Syne", size: 24))
                        .foregroundColor(Color.zymText)
                    Text(headerDescription)
                        .font(.system(size: 13))
                        .foregroundColor(Color.zymSubtext)
                }

                Spacer()

                HStack(spacing: 8) {
                    Button(loadingRecords || loadingPlan ? "Refreshing..." : "Refresh") {
                        loadRecords()
                        resetCheckInDraft()
                        if mode == .trains {
                            loadTrainingPlan()
                        }
                    }
                    .buttonStyle(ZYMGhostButton())
                    .disabled(loadingRecords || loadingPlan || saving)

                    Button("Back to chat", action: onBackToChat)
                        .buttonStyle(ZYMGhostButton())
                }
            }

            if mode != .info {
                DatePicker(
                    "",
                    selection: $selectedDate,
                    displayedComponents: .date
                )
                .datePickerStyle(.compact)
                .labelsHidden()
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(14)
        .background(Color.white.opacity(0.6))
        .overlay(
            Rectangle()
                .fill(Color.zymLine.opacity(0.5))
                .frame(height: 1),
            alignment: .bottom
        )
    }

    private var infoView: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                workspaceInput("Height", text: $profileDraft.height, keyboard: .decimalPad)
                workspaceInput("Weight", text: $profileDraft.weight, keyboard: .decimalPad)
                workspaceInput("Age", text: $profileDraft.age, keyboard: .numberPad)
            }

            HStack(spacing: 10) {
                workspaceMenu("Gender", selection: $profileDraft.gender, options: coachGenderOptions)
                workspaceMenu("Body fat range", selection: $profileDraft.bodyFatRange, options: coachBodyFatRangeOptions.map {
                    CoachOption(value: $0.value, label: $0.label, description: nil)
                })
            }

            HStack(spacing: 10) {
                workspaceMenu("Training days / week", selection: $profileDraft.trainingDays, options: coachTrainingDayOptions)
                workspaceMenu("Activity level", selection: $profileDraft.activityLevel, options: coachActivityLevelOptions)
            }

            HStack(spacing: 10) {
                workspaceMenu("Goal", selection: $profileDraft.goal, options: coachGoalOptions)
                workspaceMenu("Experience level", selection: $profileDraft.experienceLevel, options: coachExperienceLevelOptions)
            }

            TextEditor(text: $profileDraft.notes)
                .frame(minHeight: 120)
                .padding(10)
                .background(Color.white.opacity(0.82))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Color.zymLine, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            Button(saving ? "Saving..." : "Save coach profile") {
                saveProfileDraft()
            }
            .buttonStyle(ZYMPrimaryButton())
            .disabled(saving || loadingRecords)
        }
        .zymCard()
    }

    private var mealsView: some View {
        VStack(spacing: 14) {
            summaryCard(total: selectedDayRecord?.total_intake ?? 0, label: "Intake")

            if let meals = selectedDayRecord?.meals, !meals.isEmpty {
                ForEach(meals) { meal in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text((meal.description?.isEmpty == false) ? (meal.description ?? "") : "Meal")
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundColor(Color.zymText)
                                Text("\(meal.time ?? "--:--") · \(Int((meal.calories ?? 0).rounded())) kcal")
                                    .font(.system(size: 12))
                                    .foregroundColor(Color.zymSubtext)
                            }
                            Spacer()
                            Button("Edit") {
                                mealDraft = CoachWorkspaceMealDraft(day: effectiveDay, meal: meal)
                            }
                            .buttonStyle(ZYMGhostButton())
                        }

                        Text("Protein \(Int((meal.protein_g ?? 0).rounded())) g · Carbs \(Int((meal.carbs_g ?? 0).rounded())) g · Fat \(Int((meal.fat_g ?? 0).rounded())) g")
                            .font(.system(size: 13))
                            .foregroundColor(Color.zymSubtext)
                    }
                    .zymCard()
                }
            } else {
                emptyState("You have no meals recorded yet.")
            }
        }
    }

    private var trainsView: some View {
        VStack(spacing: 14) {
            summaryCard(total: selectedDayRecord?.total_burned ?? 0, label: "Burned")

            VStack(alignment: .leading, spacing: 10) {
                Text("Plan")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(1.4)
                    .foregroundColor(Color.zymSubtext)

                Text(trainingPlan?.plan?.title ?? "No plan made by \(coachId.uppercased()) yet.")
                    .font(.custom("Syne", size: 20))
                    .foregroundColor(Color.zymText)

                if let summary = trainingPlan?.plan?.summary, !summary.isEmpty {
                    Text(summary)
                        .font(.system(size: 13))
                        .foregroundColor(Color.zymSubtext)
                }

                if loadingPlan {
                    ProgressView("Loading training plan...")
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else if trainingPlan?.plan == nil {
                    emptyState("Ask \(coachId.uppercased()) Coach to build a workout for this day and it will appear here.")
                } else if activePlanExercises.isEmpty {
                    emptyState("This coach plan is fully checked off for \(formattedCoachDay(effectiveDay)).")
                } else {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        ForEach(activePlanExercises) { exercise in
                            VStack(alignment: .leading, spacing: 10) {
                                Button {
                                    openMedia(exercise.demo_url ?? exercise.demo_thumbnail, title: "\(exercise.name) demo")
                                } label: {
                                    ZStack {
                                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                                            .fill(Color.zymSurfaceSoft)
                                            .frame(height: 116)

                                        if let thumbnail = exercise.demo_thumbnail, let url = resolveRemoteURL(thumbnail) {
                                            AsyncImage(url: url) { phase in
                                                switch phase {
                                                case .success(let image):
                                                    image
                                                        .resizable()
                                                        .scaledToFill()
                                                default:
                                                    Image(systemName: "figure.strengthtraining.traditional")
                                                        .font(.system(size: 28))
                                                        .foregroundColor(Color.zymPrimary)
                                                }
                                            }
                                            .frame(height: 116)
                                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                                        } else {
                                            Image(systemName: "figure.strengthtraining.traditional")
                                                .font(.system(size: 28))
                                                .foregroundColor(Color.zymPrimary)
                                        }
                                    }
                                }
                                .buttonStyle(.plain)

                                Text("#\(exercise.order)")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundColor(Color.zymSubtext)

                                Text(exercise.name)
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundColor(Color.zymText)

                                Text("\(exercise.sets) sets · \(exercise.reps) reps · \(exercise.rest_seconds) sec rest")
                                    .font(.system(size: 12))
                                    .foregroundColor(Color.zymSubtext)

                                if let cue = exercise.cue, !cue.isEmpty {
                                    Text(cue)
                                        .font(.system(size: 12))
                                        .foregroundColor(Color.zymSubtext)
                                }

                                HStack {
                                    Button((exercise.demo_url ?? exercise.demo_thumbnail) == nil ? "No demo yet" : "Open demo") {
                                        openMedia(exercise.demo_url ?? exercise.demo_thumbnail, title: "\(exercise.name) demo")
                                    }
                                    .buttonStyle(ZYMGhostButton())

                                    Spacer()

                                    Button("Check off") {
                                        toggleTrainingExercise(exerciseId: exercise.id, completed: true)
                                    }
                                    .buttonStyle(ZYMPrimaryButton())
                                    .disabled(saving)
                                }
                            }
                            .zymCard()
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .zymCard()

            VStack(alignment: .leading, spacing: 10) {
                Text("Train log")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(1.4)
                    .foregroundColor(Color.zymSubtext)

                Text("What was recorded")
                    .font(.custom("Syne", size: 20))
                    .foregroundColor(Color.zymText)

                if let training = selectedDayRecord?.training, !training.isEmpty {
                    ForEach(training) { entry in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text((entry.name?.isEmpty == false) ? (entry.name ?? "") : "Training entry")
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundColor(Color.zymText)
                                    Text("\(entry.time ?? "--:--") · \(Int((entry.sets ?? 0).rounded())) sets × \((entry.reps?.isEmpty == false) ? (entry.reps ?? "") : "0") reps")
                                        .font(.system(size: 12))
                                        .foregroundColor(Color.zymSubtext)
                                }
                                Spacer()
                                Button("Edit") {
                                    trainingDraft = CoachWorkspaceTrainingDraft(day: effectiveDay, entry: entry)
                                }
                                .buttonStyle(ZYMGhostButton())
                            }

                            if let notes = entry.notes, !notes.isEmpty {
                                Text(notes)
                                    .font(.system(size: 13))
                                    .foregroundColor(Color.zymSubtext)
                            }
                        }
                        .zymCard()
                    }
                } else {
                    emptyState("You have no trains recorded yet.")
                }
            }
        }
    }

    private var progressView: some View {
        VStack(spacing: 14) {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                progressStatCard(title: "Goal", value: (records?.profile.goal ?? "maintain").uppercased(), detail: progressSummary?.statusLabel ?? "Need more check-ins")
                progressStatCard(title: "Latest Weight", value: coachDisplayMetric(progressSummary?.latestWeightKg, suffix: " kg"), detail: progressSummary?.latestWeightDay.map { "Last weigh-in \(formattedCoachDay($0))" } ?? "No weigh-in yet")
                progressStatCard(title: "7d Avg", value: coachDisplayMetric(progressSummary?.weight7dAvg, suffix: " kg"), detail: "Smooths normal daily noise")
                progressStatCard(title: "14d Delta", value: coachDisplaySignedMetric(progressSummary?.weight14dDelta, suffix: " kg"), detail: "Two-week change")
            }

            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("PROGRESS VIEW")
                            .font(.system(size: 11, weight: .bold))
                            .tracking(1.4)
                            .foregroundColor(Color.zymSubtext)
                        Text("See the trend, then log the next signal")
                            .font(.custom("Syne", size: 20))
                            .foregroundColor(Color.zymText)
                    }
                    Spacer()
                    Picker("Progress View", selection: $progressViewMode) {
                        ForEach(CoachProgressViewMode.allCases, id: \.self) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(maxWidth: 220)
                }

                if progressViewMode == .trend {
                    CoachWeightTrendCard(records: records?.records ?? [])
                } else {
                    CoachProgressCalendarCard(
                        records: records?.records ?? [],
                        selectedDay: effectiveDay,
                        onSelectDay: { day in
                            if let date = coachDateFromDay(day) {
                                selectedDate = date
                            }
                        }
                    )
                }
            }
            .zymCard()

            VStack(alignment: .leading, spacing: 10) {
                Text("COACH INTERPRETATION")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(1.4)
                    .foregroundColor(Color.zymSubtext)
                Text(progressSummary?.statusLabel ?? "Need more signal before calling the trend.")
                    .font(.custom("Syne", size: 20))
                    .foregroundColor(Color.zymText)
                Text(progressSummary?.trendNarrative ?? "Once you log a few quick check-ins, your coach can separate real progress from normal short-term fluctuation.")
                    .font(.system(size: 13))
                    .foregroundColor(Color.zymSubtext)
            }
            .zymCard()

            VStack(alignment: .leading, spacing: 12) {
                Text("QUICK CHECK-IN")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(1.4)
                    .foregroundColor(Color.zymSubtext)

                HStack(spacing: 10) {
                    workspaceInput("Weight kg", text: $checkInDraft.weightKg, keyboard: .decimalPad)
                    workspaceInput("Waist cm", text: $checkInDraft.waistCm, keyboard: .decimalPad)
                    workspaceInput("Body fat %", text: $checkInDraft.bodyFatPct, keyboard: .decimalPad)
                }

                HStack(spacing: 10) {
                    workspaceMenu("Energy", selection: $checkInDraft.energy, options: coachCheckInScaleOptions)
                    workspaceMenu("Hunger", selection: $checkInDraft.hunger, options: coachCheckInScaleOptions)
                    workspaceMenu("Recovery", selection: $checkInDraft.recovery, options: coachCheckInScaleOptions)
                }

                workspaceMenu("Adherence", selection: $checkInDraft.adherence, options: coachCheckInAdherenceOptions)

                TextEditor(text: $checkInDraft.notes)
                    .frame(minHeight: 110)
                    .padding(10)
                    .background(Color.white.opacity(0.82))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Color.zymLine, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                HStack {
                    Button(saving ? "Saving..." : "Save check-in") {
                        saveCheckInDraft()
                    }
                    .buttonStyle(ZYMPrimaryButton())
                    .disabled(saving || loadingRecords)

                    Button("Reset") {
                        resetCheckInDraft()
                    }
                    .buttonStyle(ZYMGhostButton())
                    .disabled(saving)
                }
            }
            .zymCard()
        }
    }

    private func summaryCard(total: Double, label: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(formattedCoachDay(effectiveDay))
                .font(.custom("Syne", size: 20))
                .foregroundColor(Color.zymText)
            Text("\(label) \(Int(total.rounded())) kcal")
                .font(.system(size: 13))
                .foregroundColor(Color.zymSubtext)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .zymCard()
    }

    private func progressStatCard(title: String, value: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 11, weight: .bold))
                .tracking(1.2)
                .foregroundColor(Color.zymSubtext)
            Text(value)
                .font(.custom("Syne", size: 20))
                .foregroundColor(Color.zymText)
            Text(detail)
                .font(.system(size: 12))
                .foregroundColor(Color.zymSubtext)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .zymCard()
    }

    private func emptyState(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundColor(Color.zymSubtext)
            .frame(maxWidth: .infinity, minHeight: 150)
            .background(Color.white.opacity(0.5))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.zymLine.opacity(0.7), style: StrokeStyle(lineWidth: 1, dash: [6, 5]))
            )
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func workspaceInput(_ title: String, text: Binding<String>, keyboard: UIKeyboardType) -> some View {
        TextField(title, text: text)
            .keyboardType(keyboard)
            .padding(12)
            .background(Color.white.opacity(0.82))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.zymLine, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func workspaceMenu(_ title: String, selection: Binding<String>, options: [CoachOption]) -> some View {
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
                Text(selection.wrappedValue.isEmpty ? title : (options.first(where: { $0.value == selection.wrappedValue })?.label ?? selection.wrappedValue))
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

    private func resetCheckInDraft() {
        checkInDraft = CoachWorkspaceCheckInDraft(day: effectiveDay, checkIn: selectedDayRecord?.check_in)
    }

    private func loadRecords() {
        guard let userId = appState.userId,
              let url = apiURL("/coach/records/\(userId)?days=120") else { return }

        loadingRecords = true
        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            let decoded = data.flatMap { try? JSONDecoder().decode(CoachRecordsResponse.self, from: $0) }
            DispatchQueue.main.async {
                loadingRecords = false
                if let decoded {
                    records = decoded
                    profileDraft = CoachWorkspaceProfileDraft(
                        height: coachDraftString(decoded.profile.height) + (decoded.profile.height == nil ? coachDraftNumber(decoded.profile.height_cm) : ""),
                        weight: coachDraftString(decoded.profile.weight) + (decoded.profile.weight == nil ? coachDraftNumber(decoded.profile.weight_kg) : ""),
                        age: decoded.profile.age.map(String.init) ?? "",
                        bodyFatRange: coachBodyFatValueToRange(decoded.profile.body_fat_pct),
                        trainingDays: decoded.profile.training_days.map(String.init) ?? "",
                        gender: decoded.profile.gender ?? "",
                        activityLevel: decoded.profile.activity_level ?? "",
                        goal: decoded.profile.goal ?? "",
                        experienceLevel: decoded.profile.experience_level ?? "",
                        notes: decoded.profile.notes ?? ""
                    )
                    checkInDraft = CoachWorkspaceCheckInDraft(
                        day: effectiveDay,
                        checkIn: decoded.records.first(where: { $0.day == effectiveDay })?.check_in
                    )
                } else {
                    onError("Failed to load coach records.")
                }
            }
        }.resume()
    }

    private func loadTrainingPlan() {
        guard let userId = appState.userId,
              let url = apiURL("/coach/training-plan/\(userId)?day=\(effectiveDay)") else { return }

        loadingPlan = true
        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        authorizedDataTask(appState: appState, request: request) { data, _, _ in
            let decoded = data.flatMap { try? JSONDecoder().decode(CoachTrainingPlanResponse.self, from: $0) }
            DispatchQueue.main.async {
                loadingPlan = false
                if let decoded {
                    trainingPlan = decoded
                } else {
                    onError("Failed to load training plan.")
                }
            }
        }.resume()
    }

    private func saveProfileDraft() {
        guard let userId = appState.userId,
              let url = apiURL("/coach/records/profile/update") else { return }

        saving = true
        var body: [String: Any] = [
            "userId": userId,
            "timezone": TimeZone.current.identifier,
        ]
        if !profileDraft.height.isEmpty { body["height"] = profileDraft.height }
        if !profileDraft.weight.isEmpty { body["weight"] = profileDraft.weight }
        if let age = Int(profileDraft.age) { body["age"] = age }
        if let trainingDays = Int(profileDraft.trainingDays) { body["training_days"] = trainingDays }
        if let bodyFat = coachBodyFatRangeToValue(profileDraft.bodyFatRange) { body["body_fat_pct"] = bodyFat }
        if !profileDraft.gender.isEmpty { body["gender"] = profileDraft.gender }
        if !profileDraft.activityLevel.isEmpty { body["activity_level"] = profileDraft.activityLevel }
        if !profileDraft.goal.isEmpty { body["goal"] = profileDraft.goal }
        if !profileDraft.experienceLevel.isEmpty { body["experience_level"] = profileDraft.experienceLevel }
        if !profileDraft.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { body["notes"] = profileDraft.notes.trimmingCharacters(in: .whitespacesAndNewlines) }

        submit(pathURL: url, body: body, successMessage: "Coach profile saved.") {
            loadRecords()
        }
    }

    private func saveCheckInDraft() {
        guard let userId = appState.userId,
              let url = apiURL("/coach/records/check-in/update") else { return }

        var body: [String: Any] = [
            "userId": userId,
            "day": checkInDraft.day,
            "timezone": TimeZone.current.identifier,
        ]
        if let weight = Double(checkInDraft.weightKg) { body["weight_kg"] = weight }
        if let waist = Double(checkInDraft.waistCm) { body["waist_cm"] = waist }
        if let bodyFat = Double(checkInDraft.bodyFatPct) { body["body_fat_pct"] = bodyFat }
        if let energy = Int(checkInDraft.energy) { body["energy"] = energy }
        if let hunger = Int(checkInDraft.hunger) { body["hunger"] = hunger }
        if let recovery = Int(checkInDraft.recovery) { body["recovery"] = recovery }
        if !checkInDraft.adherence.isEmpty { body["adherence"] = checkInDraft.adherence }
        if !checkInDraft.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            body["notes"] = checkInDraft.notes.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        submit(pathURL: url, body: body, successMessage: "Progress check-in saved.") {
            loadRecords()
        }
    }

    private func saveMealDraft() {
        guard let draft = mealDraft,
              let userId = appState.userId,
              let url = apiURL("/coach/records/meal/update") else { return }

        var body: [String: Any] = [
            "userId": userId,
            "day": draft.day,
            "mealId": draft.mealId,
            "timezone": draft.timezone.isEmpty ? TimeZone.current.identifier : draft.timezone,
        ]
        if !draft.description.isEmpty { body["description"] = draft.description }
        if let calories = Double(draft.calories) { body["calories"] = calories }
        if let protein = Double(draft.proteinG) { body["protein_g"] = protein }
        if let carbs = Double(draft.carbsG) { body["carbs_g"] = carbs }
        if let fat = Double(draft.fatG) { body["fat_g"] = fat }
        if !draft.time.isEmpty { body["time"] = draft.time }

        submit(pathURL: url, body: body, successMessage: "Meal record updated.") {
            mealDraft = nil
            loadRecords()
        }
    }

    private func saveTrainingDraft() {
        guard let draft = trainingDraft,
              let userId = appState.userId,
              let url = apiURL("/coach/records/training/update") else { return }

        var body: [String: Any] = [
            "userId": userId,
            "day": draft.day,
            "trainingId": draft.trainingId,
            "timezone": draft.timezone.isEmpty ? TimeZone.current.identifier : draft.timezone,
        ]
        if !draft.name.isEmpty { body["name"] = draft.name }
        if let sets = Int(draft.sets) { body["sets"] = sets }
        if !draft.reps.isEmpty { body["reps"] = draft.reps }
        if let weight = Double(draft.weightKg) { body["weight_kg"] = weight }
        if !draft.notes.isEmpty { body["notes"] = draft.notes }
        if !draft.time.isEmpty { body["time"] = draft.time }

        submit(pathURL: url, body: body, successMessage: "Training record updated.") {
            trainingDraft = nil
            loadRecords()
        }
    }

    private func toggleTrainingExercise(exerciseId: String, completed: Bool) {
        guard let userId = appState.userId,
              let url = apiURL("/coach/training-plan/toggle") else { return }

        let body: [String: Any] = [
            "userId": userId,
            "day": effectiveDay,
            "exerciseId": exerciseId,
            "completed": completed,
            "timezone": TimeZone.current.identifier,
        ]

        submit(pathURL: url, body: body, successMessage: "Training log updated.") {
            loadTrainingPlan()
            loadRecords()
        }
    }

    private func submit(pathURL: URL, body: [String: Any], successMessage: String, completion: @escaping () -> Void) {
        saving = true
        var request = URLRequest(url: pathURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        authorizedDataTask(appState: appState, request: request) { data, response, _ in
            DispatchQueue.main.async {
                saving = false
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard statusCode >= 200 && statusCode < 300 else {
                    onError((data.flatMap { try? JSONDecoder().decode(APIErrorResponse.self, from: $0).error }) ?? "Request failed.")
                    return
                }
                onNotice(successMessage)
                completion()
            }
        }.resume()
    }

    private func openMedia(_ raw: String?, title: String) {
        guard let url = resolveRemoteURL(raw) else { return }
        mediaPreview = CoachWorkspaceMediaPreview(url: url, title: title)
    }
}

private struct CoachMealEditSheet: View {
    let draft: CoachWorkspaceMealDraft
    let onChange: (CoachWorkspaceMealDraft) -> Void
    let onSave: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var localDraft: CoachWorkspaceMealDraft

    init(draft: CoachWorkspaceMealDraft, onChange: @escaping (CoachWorkspaceMealDraft) -> Void, onSave: @escaping () -> Void) {
        self.draft = draft
        self.onChange = onChange
        self.onSave = onSave
        _localDraft = State(initialValue: draft)
    }

    var body: some View {
        NavigationView {
            Form {
                Section("Meal") {
                    TextField("Description", text: $localDraft.description)
                    TextField("Calories", text: $localDraft.calories)
                    TextField("Protein g", text: $localDraft.proteinG)
                    TextField("Carbs g", text: $localDraft.carbsG)
                    TextField("Fat g", text: $localDraft.fatG)
                    TextField("Time", text: $localDraft.time)
                }
            }
            .navigationTitle("Edit Meal")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onChange(localDraft)
                        onSave()
                        dismiss()
                    }
                }
            }
        }
    }
}

private struct CoachTrainingEditSheet: View {
    let draft: CoachWorkspaceTrainingDraft
    let onChange: (CoachWorkspaceTrainingDraft) -> Void
    let onSave: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var localDraft: CoachWorkspaceTrainingDraft

    init(draft: CoachWorkspaceTrainingDraft, onChange: @escaping (CoachWorkspaceTrainingDraft) -> Void, onSave: @escaping () -> Void) {
        self.draft = draft
        self.onChange = onChange
        self.onSave = onSave
        _localDraft = State(initialValue: draft)
    }

    var body: some View {
        NavigationView {
            Form {
                Section("Training") {
                    TextField("Name", text: $localDraft.name)
                    TextField("Sets", text: $localDraft.sets)
                    TextField("Reps", text: $localDraft.reps)
                    TextField("Weight kg", text: $localDraft.weightKg)
                    TextField("Time", text: $localDraft.time)
                    TextField("Notes", text: $localDraft.notes, axis: .vertical)
                        .lineLimit(3...6)
                }
            }
            .navigationTitle("Edit Training")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onChange(localDraft)
                        onSave()
                        dismiss()
                    }
                }
            }
        }
    }
}

private struct CoachWorkspaceMediaSheet: View {
    let preview: CoachWorkspaceMediaPreview
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                if preview.url.pathExtension.lowercased().contains("mp4")
                    || preview.url.pathExtension.lowercased().contains("mov")
                    || preview.url.pathExtension.lowercased().contains("webm")
                    || preview.url.pathExtension.lowercased().contains("m4v") {
                    VideoPlayer(player: AVPlayer(url: preview.url))
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .padding(20)
                } else {
                    VStack(spacing: 16) {
                        AsyncImage(url: preview.url) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .scaledToFit()
                            case .empty:
                                ProgressView()
                            default:
                                Image(systemName: "photo")
                                    .font(.system(size: 40))
                                    .foregroundColor(Color.zymPrimary)
                            }
                        }
                        .padding(20)

                        Link("Open original", destination: preview.url)
                            .buttonStyle(ZYMGhostButton())
                    }
                }
            }
            .navigationTitle(preview.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

private func coachDraftString(_ value: String?, limit: Int = 120) -> String {
    String((value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(limit))
}

private func coachDraftNumber(_ value: Double?) -> String {
    guard let value, value.isFinite else { return "" }
    if abs(value.rounded() - value) < 0.00001 {
        return String(Int(value.rounded()))
    }
    return String(format: "%.2f", value).replacingOccurrences(of: "\\.?0+$", with: "", options: .regularExpression)
}

private func formattedCoachDay(_ day: String) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    guard let date = formatter.date(from: day) else { return day }

    let output = DateFormatter()
    output.dateStyle = .medium
    output.timeStyle = .none
    return output.string(from: date)
}

private func coachDateFromDay(_ day: String) -> Date? {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.date(from: day)
}

private func coachDayString(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: date)
}

private func coachRecentDays(_ count: Int, endingAt endDay: String? = nil) -> [String] {
    let anchor = coachDateFromDay(endDay ?? coachDayString(Date())) ?? Date()
    return (0..<count).compactMap { offset in
        Calendar(identifier: .gregorian).date(byAdding: .day, value: offset - count + 1, to: anchor)
    }.map(coachDayString(_:))
}

private func coachDisplayMetric(_ value: Double?, suffix: String = "") -> String {
    guard let value, value.isFinite else { return "--" }
    let rounded = abs(value.rounded() - value) < 0.00001 ? String(Int(value.rounded())) : String(format: "%.2f", value)
    return "\(rounded)\(suffix)"
}

private func coachDisplaySignedMetric(_ value: Double?, suffix: String = "") -> String {
    guard let value, value.isFinite else { return "--" }
    let rounded = abs(value.rounded() - value) < 0.00001 ? String(Int(value.rounded())) : String(format: "%.2f", value)
    return "\(value > 0 ? "+" : "")\(rounded)\(suffix)"
}

private let coachCheckInScaleOptions: [CoachOption] = [1, 2, 3, 4, 5].map {
    CoachOption(value: String($0), label: "\($0) / 5", description: nil)
}

private let coachCheckInAdherenceOptions: [CoachOption] = [
    CoachOption(value: "on_track", label: "On track", description: nil),
    CoachOption(value: "partial", label: "Partial", description: nil),
    CoachOption(value: "off_track", label: "Off track", description: nil),
]

private struct CoachWeightTrendCard: View {
    let records: [CoachDayRecord]

    private var days: [String] {
        coachRecentDays(30)
    }

    private var weights: [Double?] {
        days.map { day in
            records.first(where: { $0.day == day })?.check_in?.weight_kg
        }
    }

    private var rollingWeights: [Double?] {
        weights.enumerated().map { index, _ in
            let window = weights[max(0, index - 6)...index]
            let valid = window.compactMap { $0 }
            guard !valid.isEmpty else { return nil }
            return valid.reduce(0, +) / Double(valid.count)
        }
    }

    var body: some View {
        let validWeights = weights.compactMap { $0 }

        return VStack(alignment: .leading, spacing: 10) {
            if validWeights.count < 2 {
                Text("Log at least two weigh-ins and your trend line will appear here.")
                    .font(.system(size: 13))
                    .foregroundColor(Color.zymSubtext)
                    .frame(maxWidth: .infinity, minHeight: 180)
                    .background(Color.white.opacity(0.52))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(Color.zymLine.opacity(0.7), style: StrokeStyle(lineWidth: 1, dash: [6, 5]))
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            } else {
                GeometryReader { proxy in
                    let size = proxy.size
                    let minWeight = (validWeights.min() ?? 0) - 0.8
                    let maxWeight = (validWeights.max() ?? 0) + 0.8
                    let range = max(0.8, maxWeight - minWeight)

                    ZStack {
                        VStack(spacing: 0) {
                            ForEach(0..<4, id: \.self) { _ in
                                Divider().background(Color.zymLine.opacity(0.2))
                                Spacer()
                            }
                        }

                        Path { path in
                            var started = false
                            for (index, weight) in weights.enumerated() {
                                guard let weight else { continue }
                                let x = size.width * CGFloat(index) / CGFloat(max(days.count - 1, 1))
                                let y = size.height - ((CGFloat(weight - minWeight) / CGFloat(range)) * size.height)
                                if !started {
                                    path.move(to: CGPoint(x: x, y: y))
                                    started = true
                                } else {
                                    path.addLine(to: CGPoint(x: x, y: y))
                                }
                            }
                        }
                        .stroke(Color.zymSubtext.opacity(0.7), style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))

                        Path { path in
                            var started = false
                            for (index, weight) in rollingWeights.enumerated() {
                                guard let weight else { continue }
                                let x = size.width * CGFloat(index) / CGFloat(max(days.count - 1, 1))
                                let y = size.height - ((CGFloat(weight - minWeight) / CGFloat(range)) * size.height)
                                if !started {
                                    path.move(to: CGPoint(x: x, y: y))
                                    started = true
                                } else {
                                    path.addLine(to: CGPoint(x: x, y: y))
                                }
                            }
                        }
                        .stroke(Color.zymPrimary, style: StrokeStyle(lineWidth: 3.5, lineCap: .round, lineJoin: .round))
                    }
                }
                .frame(height: 200)

                HStack {
                    Text(formattedCoachDay(days.first ?? ""))
                    Spacer()
                    Text(formattedCoachDay(days.last ?? ""))
                }
                .font(.system(size: 11))
                .foregroundColor(Color.zymSubtext)
            }
        }
    }
}

private struct CoachProgressCalendarCard: View {
    let records: [CoachDayRecord]
    let selectedDay: String
    let onSelectDay: (String) -> Void

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 4)

    private var days: [String] {
        coachRecentDays(28)
    }

    var body: some View {
        LazyVGrid(columns: columns, spacing: 8) {
            ForEach(days, id: \.self) { day in
                let record = records.first(where: { $0.day == day })
                let selected = day == selectedDay

                Button {
                    onSelectDay(day)
                } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(formattedCoachDay(day))
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(Color.zymSubtext)
                            .lineLimit(1)
                        Text(record?.check_in?.weight_kg.map { "\(coachDisplayMetric($0))kg" } ?? "--")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Color.zymText)
                            .lineLimit(1)
                        HStack(spacing: 4) {
                            Circle().fill((record?.check_in) == nil ? Color.gray.opacity(0.22) : Color.blue.opacity(0.82)).frame(width: 7, height: 7)
                            Circle().fill((record?.meals.isEmpty == false) ? Color.orange.opacity(0.85) : Color.gray.opacity(0.22)).frame(width: 7, height: 7)
                            Circle().fill((record?.training.isEmpty == false) ? Color.green.opacity(0.82) : Color.gray.opacity(0.22)).frame(width: 7, height: 7)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 76, alignment: .leading)
                    .padding(10)
                    .background(selected ? Color.zymPrimary.opacity(0.1) : Color.white.opacity(0.68))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(selected ? Color.zymPrimary.opacity(0.35) : Color.zymLine, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
    }
}
