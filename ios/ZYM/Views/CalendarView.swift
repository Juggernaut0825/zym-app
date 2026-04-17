import SwiftUI
import UIKit

private struct CalendarMealDraft: Identifiable {
    let id = UUID()
    var day: String
    var mealId: String
    var description: String
    var calories: String
    var proteinG: String
    var carbsG: String
    var fatG: String
    var time: String

    init(day: String, meal: CoachMealRecord) {
        self.day = day
        self.mealId = meal.id
        self.description = calendarDraftString(meal.description, limit: 500)
        self.calories = calendarDraftNumber(meal.calories)
        self.proteinG = calendarDraftNumber(meal.protein_g)
        self.carbsG = calendarDraftNumber(meal.carbs_g)
        self.fatG = calendarDraftNumber(meal.fat_g)
        self.time = calendarDraftString(meal.time, limit: 5)
    }
}

private struct CalendarTrainingDraft: Identifiable {
    let id = UUID()
    var day: String
    var trainingId: String
    var name: String
    var sets: String
    var reps: String
    var weightKg: String
    var notes: String
    var time: String

    init(day: String, entry: CoachTrainingRecord) {
        self.day = day
        self.trainingId = entry.id
        self.name = calendarDraftString(entry.name, limit: 120)
        self.sets = calendarDraftNumber(entry.sets)
        self.reps = calendarDraftString(entry.reps, limit: 20)
        self.weightKg = calendarDraftNumber(entry.weight_kg)
        self.notes = calendarDraftString(entry.notes, limit: 500)
        self.time = calendarDraftString(entry.time, limit: 5)
    }
}

private struct CalendarCheckInDraft {
    var day: String
    var weightKg: String
    var bodyFatPct: String
    var notes: String

    init(day: String, checkIn: CoachCheckInRecord? = nil) {
        self.day = day
        self.weightKg = calendarDraftNumber(checkIn?.weight_kg)
        self.bodyFatPct = calendarDraftNumber(checkIn?.body_fat_pct)
        self.notes = calendarDraftString(checkIn?.notes, limit: 500)
    }
}

private func calendarDraftString(_ value: String?, limit: Int = 120) -> String {
    String((value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(limit))
}

private func calendarDraftNumber(_ value: Double?) -> String {
    guard let value, value.isFinite else { return "" }
    if abs(value.rounded() - value) < 0.00001 {
        return String(Int(value.rounded()))
    }
    return String(format: "%.2f", value).replacingOccurrences(of: "\\.?0+$", with: "", options: .regularExpression)
}

private func calendarLocalDay(from date: Date, timeZoneId: String?) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    if let timeZoneId, let zone = TimeZone(identifier: timeZoneId) {
        formatter.timeZone = zone
    } else {
        formatter.timeZone = TimeZone.current
    }
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: date)
}

private func calendarDate(from day: String) -> Date? {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.date(from: day)
}

private func calendarFormattedDay(_ day: String) -> String {
    guard let date = calendarDate(from: day) else { return day }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US")
    formatter.dateFormat = "MMM d, yyyy"
    return formatter.string(from: date)
}

private func calendarShortDay(_ day: String) -> String {
    guard let date = calendarDate(from: day) else { return String(day.suffix(5)) }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US")
    formatter.dateFormat = "MMM d"
    return formatter.string(from: date)
}

private func calendarAddDays(_ day: String, delta: Int) -> String {
    guard let date = calendarDate(from: day) else { return day }
    let shifted = Calendar(identifier: .gregorian).date(byAdding: .day, value: delta, to: date) ?? date
    return calendarLocalDay(from: shifted, timeZoneId: "UTC")
}

private func calendarRecentDays(count: Int, endingAt day: String) -> [String] {
    (0..<count).map { index in
        calendarAddDays(day, delta: index - count + 1)
    }
}

private func calendarMetric(_ value: Double?, suffix: String = "") -> String {
    guard let value, value.isFinite else { return "--" }
    let rounded = (value * 100).rounded() / 100
    return "\(rounded)\(suffix)"
}

private func calendarSignedMetric(_ value: Double?, suffix: String = "") -> String {
    guard let value, value.isFinite else { return "--" }
    let rounded = (value * 100).rounded() / 100
    return "\(rounded > 0 ? "+" : "")\(rounded)\(suffix)"
}

struct CalendarView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var healthKitManager = HealthKitManager()

    @State private var records: CoachRecordsResponse?
    @State private var selectedDate = Date()
    @State private var loadingRecords = false
    @State private var saving = false
    @State private var syncStatus = ""
    @State private var isSyncing = false
    @State private var didAutoSync = false
    @State private var mealDraft: CalendarMealDraft?
    @State private var trainingDraft: CalendarTrainingDraft?
    @State private var checkInDraft = CalendarCheckInDraft(day: "")
    @State private var progressRange = 30

    private var effectiveDay: String {
        calendarLocalDay(from: selectedDate, timeZoneId: records?.profile.timezone)
    }

    private var selectedRecord: CoachDayRecord? {
        records?.records.first(where: { $0.day == effectiveDay })
    }

    private var selectedMeals: [CoachMealRecord] {
        selectedRecord?.meals ?? []
    }

    private var selectedTraining: [CoachTrainingRecord] {
        selectedRecord?.training ?? []
    }

    private var selectedHealth: CoachHealthSnapshot? {
        selectedRecord?.health
    }

    private var progressDays: [String] {
        calendarRecentDays(count: max(14, progressRange), endingAt: effectiveDay)
    }

    private var weightPoints: [(day: String, weight: Double?)] {
        progressDays.map { day in
            let weight = records?.records.first(where: { $0.day == day })?.check_in?.weight_kg
            return (day: day, weight: weight)
        }
    }

    var body: some View {
        NavigationView {
            ZStack {
                Color.white.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 14) {
                        headerCard
                        statGrid
                        trendCard
                        dailyOverviewCard
                        checkInCard
                        mealsCard
                        trainingCard
                    }
                    .padding(.horizontal, 14)
                    .padding(.top, 8)
                    .padding(.bottom, 20)
                }
            }
            .navigationTitle("Calendar")
        }
        .sheet(item: $mealDraft) { draft in
            CalendarMealEditSheet(draft: draft) { updated in
                mealDraft = updated
            } onSave: {
                saveMealDraft()
            }
        }
        .sheet(item: $trainingDraft) { draft in
            CalendarTrainingEditSheet(draft: draft) { updated in
                trainingDraft = updated
            } onSave: {
                saveTrainingDraft()
            }
        }
        .onAppear {
            loadRecords()
            resetCheckInDraft()
            if !didAutoSync {
                didAutoSync = true
                syncFromHealthKit(auto: true)
            }
        }
        .onChange(of: effectiveDay) { _, _ in
            resetCheckInDraft()
        }
    }

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("CALENDAR")
                        .font(.system(size: 11, weight: .bold))
                        .tracking(1.4)
                        .foregroundColor(Color.zymSubtext)
                    Text("Daily log")
                        .font(.custom("Syne", size: 24))
                        .foregroundColor(Color.zymText)
                    Text("Pick a day. Everything below updates with it.")
                        .font(.system(size: 13))
                        .foregroundColor(Color.zymSubtext)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 8) {
                    DatePicker("", selection: $selectedDate, displayedComponents: .date)
                        .datePickerStyle(.compact)
                        .labelsHidden()

                    Button(isSyncing ? "Syncing..." : "Sync Health") {
                        syncFromHealthKit(auto: false)
                    }
                    .buttonStyle(ZYMGhostButton())
                    .disabled(isSyncing)
                }
            }

            HStack {
                Text(syncStatus.isEmpty ? "Health sync shows here." : syncStatus)
                    .font(.system(size: 12))
                    .foregroundColor(Color.zymSubtext)
                Spacer()
                Button(loadingRecords ? "Refreshing..." : "Refresh") {
                    loadRecords()
                }
                .buttonStyle(ZYMGhostButton())
                .disabled(loadingRecords || saving)
            }
        }
        .zymCard()
    }

    private var statGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            calendarStatCard(
                title: "Daily Target",
                value: calendarMetric(records?.profile.daily_target, suffix: " kcal"),
                detail: "From profile"
            )
            calendarStatCard(
                title: "Latest Weight",
                value: calendarMetric(records?.progress?.latestWeightKg, suffix: " kg"),
                detail: records?.progress?.latestWeightDay.map { calendarFormattedDay($0) } ?? "No check-ins"
            )
            calendarStatCard(
                title: "Selected Steps",
                value: selectedHealth.map { "\($0.steps)" } ?? "--",
                detail: selectedHealth?.synced_at == nil ? "No sync" : "Synced"
            )
            calendarStatCard(
                title: "14d Delta",
                value: calendarSignedMetric(records?.progress?.weight14dDelta, suffix: " kg"),
                detail: records?.progress?.statusLabel ?? "Need data"
            )
        }
    }

    private var trendCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("TREND")
                        .font(.system(size: 11, weight: .bold))
                        .tracking(1.4)
                        .foregroundColor(Color.zymSubtext)
                    Text("Weight trend")
                        .font(.custom("Syne", size: 20))
                        .foregroundColor(Color.zymText)
                }
                Spacer()
                Picker("Range", selection: $progressRange) {
                    Text("14d").tag(14)
                    Text("30d").tag(30)
                    Text("90d").tag(90)
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 220)
            }

            CalendarWeightBars(points: weightPoints)

            VStack(alignment: .leading, spacing: 6) {
                Text(records?.progress?.statusLabel ?? "Need more data.")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Color.zymText)
                Text(records?.progress?.trendNarrative ?? "Log a few check-ins to see the trend.")
                    .font(.system(size: 13))
                    .foregroundColor(Color.zymSubtext)
            }
        }
        .zymCard()
    }

    private var dailyOverviewCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("SELECTED DAY")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.4)
                .foregroundColor(Color.zymSubtext)

            Text(calendarFormattedDay(effectiveDay))
                .font(.custom("Syne", size: 22))
                .foregroundColor(Color.zymText)

            VStack(spacing: 10) {
                calendarOverviewRow(
                    title: "Check-in",
                    detail: "Weight \(calendarMetric(selectedRecord?.check_in?.weight_kg, suffix: " kg")) · Body fat \(calendarMetric(selectedRecord?.check_in?.body_fat_pct, suffix: "%"))"
                )
                calendarOverviewRow(
                    title: "Activity",
                    detail: "Steps \(selectedHealth.map { String($0.steps) } ?? "--") · Calories \(selectedHealth.map { "\($0.calories_burned) kcal" } ?? "--") · Active \(selectedHealth.map { String($0.active_minutes) } ?? "--") min"
                )
                calendarOverviewRow(
                    title: "Meals",
                    detail: "\(selectedMeals.count) logged · Intake \(Int((selectedRecord?.total_intake ?? 0).rounded())) kcal"
                )
                calendarOverviewRow(
                    title: "Training",
                    detail: "\(selectedTraining.count) entries · Estimated work \(Int((selectedRecord?.total_burned ?? 0).rounded())) kcal"
                )
            }

            if let notes = selectedRecord?.check_in?.notes, !notes.isEmpty {
                Text(notes)
                    .font(.system(size: 13))
                    .foregroundColor(Color.zymSubtext)
            }
        }
        .zymCard()
    }

    private var checkInCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("CHECK-IN")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.4)
                .foregroundColor(Color.zymSubtext)

            HStack(spacing: 10) {
                calendarInput("Weight kg", text: $checkInDraft.weightKg, keyboard: .decimalPad)
                calendarInput("Body fat %", text: $checkInDraft.bodyFatPct, keyboard: .decimalPad)
            }

            TextEditor(text: $checkInDraft.notes)
                .frame(minHeight: 110)
                .padding(10)
                .background(Color.zymSurfaceSoft.opacity(0.76))
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

    private var mealsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("MEALS")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.4)
                .foregroundColor(Color.zymSubtext)
            Text("Meals on \(calendarFormattedDay(effectiveDay))")
                .font(.custom("Syne", size: 20))
                .foregroundColor(Color.zymText)

            if selectedMeals.isEmpty {
                calendarEmptyState("No meals logged.")
            } else {
                ForEach(selectedMeals) { meal in
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
                                mealDraft = CalendarMealDraft(day: effectiveDay, meal: meal)
                            }
                            .buttonStyle(ZYMGhostButton())
                        }

                        Text("Protein \(Int((meal.protein_g ?? 0).rounded())) g · Carbs \(Int((meal.carbs_g ?? 0).rounded())) g · Fat \(Int((meal.fat_g ?? 0).rounded())) g")
                            .font(.system(size: 13))
                            .foregroundColor(Color.zymSubtext)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .zymCard()
    }

    private var trainingCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("TRAINING")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.4)
                .foregroundColor(Color.zymSubtext)
            Text("Training on \(calendarFormattedDay(effectiveDay))")
                .font(.custom("Syne", size: 20))
                .foregroundColor(Color.zymText)

            if selectedTraining.isEmpty {
                calendarEmptyState("No training logged.")
            } else {
                ForEach(selectedTraining) { entry in
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
                                trainingDraft = CalendarTrainingDraft(day: effectiveDay, entry: entry)
                            }
                            .buttonStyle(ZYMGhostButton())
                        }

                        if let notes = entry.notes, !notes.isEmpty {
                            Text(notes)
                                .font(.system(size: 13))
                                .foregroundColor(Color.zymSubtext)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .zymCard()
    }

    private func calendarStatCard(title: String, value: String, detail: String) -> some View {
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

    private func calendarEmptyState(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundColor(Color.zymSubtext)
            .frame(maxWidth: .infinity, minHeight: 120)
            .background(Color.zymSurfaceSoft.opacity(0.7))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func calendarInput(_ title: String, text: Binding<String>, keyboard: UIKeyboardType) -> some View {
        TextField(title, text: text)
            .keyboardType(keyboard)
            .padding(12)
            .background(Color.zymSurfaceSoft.opacity(0.76))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func calendarOverviewRow(title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Color.zymText)
                .frame(width: 66, alignment: .leading)
            Text(detail)
                .font(.system(size: 13))
                .foregroundColor(Color.zymSubtext)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 2)
    }

    private func resetCheckInDraft() {
        checkInDraft = CalendarCheckInDraft(day: effectiveDay, checkIn: selectedRecord?.check_in)
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
                    resetCheckInDraft()
                } else {
                    syncStatus = "Failed to load calendar records."
                }
            }
        }.resume()
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
        if let bodyFat = Double(checkInDraft.bodyFatPct) { body["body_fat_pct"] = bodyFat }
        let trimmedNotes = checkInDraft.notes.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedNotes.isEmpty { body["notes"] = trimmedNotes }

        submit(pathURL: url, body: body, successMessage: "Check-in saved.") {
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
            "timezone": TimeZone.current.identifier,
        ]
        if !draft.description.isEmpty { body["description"] = draft.description }
        if let calories = Double(draft.calories) { body["calories"] = calories }
        if let protein = Double(draft.proteinG) { body["protein_g"] = protein }
        if let carbs = Double(draft.carbsG) { body["carbs_g"] = carbs }
        if let fat = Double(draft.fatG) { body["fat_g"] = fat }
        if !draft.time.isEmpty { body["time"] = draft.time }

        submit(pathURL: url, body: body, successMessage: "Meal updated.") {
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
            "timezone": TimeZone.current.identifier,
        ]
        if !draft.name.isEmpty { body["name"] = draft.name }
        if let sets = Int(draft.sets) { body["sets"] = sets }
        if !draft.reps.isEmpty { body["reps"] = draft.reps }
        if let weight = Double(draft.weightKg) { body["weight_kg"] = weight }
        if !draft.notes.isEmpty { body["notes"] = draft.notes }
        if !draft.time.isEmpty { body["time"] = draft.time }

        submit(pathURL: url, body: body, successMessage: "Training updated.") {
            trainingDraft = nil
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
                    syncStatus = (data.flatMap { try? JSONDecoder().decode(APIErrorResponse.self, from: $0).error }) ?? "Request failed."
                    return
                }
                syncStatus = successMessage
                completion()
            }
        }.resume()
    }

    private func syncFromHealthKit(auto: Bool) {
        guard appState.userId != nil else { return }
        if isSyncing { return }

        isSyncing = true
        if !auto {
            syncStatus = "Requesting Apple Health permission..."
        }

        healthKitManager.requestAuthorization { granted in
            guard granted else {
                DispatchQueue.main.async {
                    isSyncing = false
                    if !auto {
                        syncStatus = "Apple Health permission denied."
                    }
                }
                return
            }

            healthKitManager.fetchTodaySteps { steps in
                healthKitManager.fetchTodayCalories { calories in
                    healthKitManager.fetchTodayActiveMinutes { activeMinutes in
                        syncHealth(steps: steps, calories: calories, activeMinutes: activeMinutes, auto: auto)
                    }
                }
            }
        }
    }

    private func syncHealth(steps: Int, calories: Int, activeMinutes: Int, auto: Bool) {
        guard let userId = appState.userId,
              let url = apiURL("/health/sync") else {
            DispatchQueue.main.async {
                isSyncing = false
            }
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "userId": userId,
            "steps": steps,
            "calories": calories,
            "activeMinutes": activeMinutes,
            "timezone": TimeZone.current.identifier,
        ])

        authorizedDataTask(appState: appState, request: request) { _, _, error in
            DispatchQueue.main.async {
                isSyncing = false
                if error == nil {
                    syncStatus = "Synced today: \(steps) steps · \(calories) kcal · \(activeMinutes) active min"
                    loadRecords()
                } else if !auto {
                    syncStatus = "Sync failed. Please try again."
                }
            }
        }.resume()
    }
}

private struct CalendarWeightBars: View {
    let points: [(day: String, weight: Double?)]

    private var numericWeights: [Double] {
        points.compactMap(\.weight)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if numericWeights.count < 2 {
                Text("Add two weigh-ins to see the trend.")
                    .font(.system(size: 13))
                    .foregroundColor(Color.zymSubtext)
                    .frame(maxWidth: .infinity, minHeight: 140)
                    .background(Color.zymSurfaceSoft.opacity(0.7))
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            } else {
                GeometryReader { proxy in
                    let maxWeight = (numericWeights.max() ?? 0) + 0.8
                    let minWeight = (numericWeights.min() ?? 0) - 0.8
                    let range = max(0.8, maxWeight - minWeight)

                    HStack(alignment: .bottom, spacing: 6) {
                        ForEach(Array(points.enumerated()), id: \.offset) { index, point in
                            VStack(spacing: 6) {
                                RoundedRectangle(cornerRadius: 7, style: .continuous)
                                    .fill(point.weight == nil ? Color.gray.opacity(0.2) : Color.zymText.opacity(index == points.count - 1 ? 1 : 0.4))
                                    .frame(
                                        width: max(8, (proxy.size.width / CGFloat(max(points.count, 1))) - 6),
                                        height: point.weight.map { max(14, CGFloat(($0 - minWeight) / range) * 110) } ?? 14
                                    )
                                if index == 0 || index == points.count - 1 || index % max(1, points.count / 4) == 0 {
                                    Text(calendarShortDay(point.day))
                                        .font(.system(size: 10, weight: .semibold))
                                        .foregroundColor(Color.zymSubtext)
                                } else {
                                    Text(" ")
                                        .font(.system(size: 10))
                                }
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                }
                .frame(height: 150)
            }
        }
    }
}

private struct CalendarMealEditSheet: View {
    let draft: CalendarMealDraft
    let onChange: (CalendarMealDraft) -> Void
    let onSave: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var localDraft: CalendarMealDraft

    init(draft: CalendarMealDraft, onChange: @escaping (CalendarMealDraft) -> Void, onSave: @escaping () -> Void) {
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

private struct CalendarTrainingEditSheet: View {
    let draft: CalendarTrainingDraft
    let onChange: (CalendarTrainingDraft) -> Void
    let onSave: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var localDraft: CalendarTrainingDraft

    init(draft: CalendarTrainingDraft, onChange: @escaping (CalendarTrainingDraft) -> Void, onSave: @escaping () -> Void) {
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
