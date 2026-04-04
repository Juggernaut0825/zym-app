import SwiftUI
import AVKit

enum CoachWorkspaceMode: String, CaseIterable {
    case info = "Info"
    case meals = "Meals"
    case trains = "Trains"
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

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(spacing: 14) {
                    if mode == .info {
                        infoView
                    } else if mode == .meals {
                        mealsView
                    } else {
                        trainsView
                    }
                }
                .padding(14)
            }
        }
        .onAppear {
            loadRecords()
            if mode == .trains {
                loadTrainingPlan()
            }
        }
        .onChange(of: mode) { _, nextMode in
            loadRecords()
            if nextMode == .trains {
                loadTrainingPlan()
            }
        }
        .onChange(of: effectiveDay) { _, _ in
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
                    Text("Coach plans appear on top. Checked exercises move into your training log below.")
                        .font(.system(size: 13))
                        .foregroundColor(Color.zymSubtext)
                }

                Spacer()

                HStack(spacing: 8) {
                    Button(loadingRecords || loadingPlan ? "Refreshing..." : "Refresh") {
                        loadRecords()
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

    private func loadRecords() {
        guard let userId = appState.userId,
              let url = apiURL("/coach/records/\(userId)?days=45") else { return }

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
