import SwiftUI
import UIKit

private enum CalendarWeightUnit: String {
    case kg
    case lb

    var label: String { rawValue }
    var suffix: String { " \(rawValue)" }
}

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
    var weightUnit: CalendarWeightUnit
    var notes: String
    var time: String

    init(day: String, entry: CoachTrainingRecord, weightUnit: CalendarWeightUnit) {
        self.day = day
        self.trainingId = entry.id
        self.name = calendarDraftString(entry.name, limit: 120)
        self.sets = calendarDraftNumber(entry.sets)
        self.reps = calendarDraftString(entry.reps, limit: 20)
        self.weightKg = calendarDraftNumber(calendarDisplayWeight(entry.weight_kg, unit: weightUnit))
        self.weightUnit = weightUnit
        self.notes = calendarDraftString(entry.notes, limit: 500)
        self.time = calendarDraftString(entry.time, limit: 5)
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

private func calendarPreferredWeightUnit(from profile: CoachProfileData?) -> CalendarWeightUnit {
    let preferred = (profile?.preferred_weight_unit ?? "").lowercased()
    if preferred == "lb" || preferred == "lbs" {
        return .lb
    }
    let raw = (profile?.weight ?? "").lowercased()
    return raw.range(of: #"\b(lb|lbs|pound|pounds)\b"#, options: .regularExpression) == nil ? .kg : .lb
}

private func calendarDisplayWeight(_ valueKg: Double?, unit: CalendarWeightUnit) -> Double? {
    guard let valueKg, valueKg.isFinite else { return nil }
    let value = unit == .lb ? valueKg * 2.2046226218 : valueKg
    return (value * 10).rounded() / 10
}

private func calendarWeightKg(from input: String, unit: CalendarWeightUnit) -> Double? {
    guard let value = Double(input.trimmingCharacters(in: .whitespacesAndNewlines)), value.isFinite else { return nil }
    return unit == .lb ? (value * 0.45359237 * 100).rounded() / 100 : value
}

private func calendarWeightText(_ valueKg: Double?, unit: CalendarWeightUnit) -> String? {
    guard let display = calendarDisplayWeight(valueKg, unit: unit) else { return nil }
    return "\(calendarDraftNumber(display))\(unit.suffix)"
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

private func calendarPickerDate(from day: String) -> Date {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone.current
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.date(from: day) ?? Date()
}

private func calendarAddDays(_ day: String, delta: Int) -> String {
    guard let date = calendarDate(from: day) else { return day }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .current
    let shifted = calendar.date(byAdding: .day, value: delta, to: date) ?? date
    return calendarLocalDay(from: shifted, timeZoneId: "UTC")
}

private func calendarRecentDays(count: Int, endingAt day: String) -> [String] {
    (0..<count).map { index in
        calendarAddDays(day, delta: index - count + 1)
    }
}

private func calendarMetric(_ value: Double?, suffix: String = "", decimals: Int = 0) -> String {
    guard let value, value.isFinite else { return "--" }
    if decimals <= 0 {
        return "\(Int(value.rounded()))\(suffix)"
    }
    return "\(String(format: "%.\(decimals)f", value))\(suffix)"
}

private func calendarSignedMetric(_ value: Double?, suffix: String = "", decimals: Int = 1) -> String {
    guard let value, value.isFinite else { return "--" }
    let prefix = value > 0 ? "+" : ""
    return "\(prefix)\(String(format: "%.\(decimals)f", value))\(suffix)"
}

private func calendarShortAxisLabel(_ day: String) -> String {
    guard let date = calendarDate(from: day) else { return day }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.setLocalizedDateFormatFromTemplate("Md")
    return formatter.string(from: date)
}

private enum CalendarTrendMetric: String, CaseIterable, Identifiable {
    case weight
    case bodyFat

    var id: String { rawValue }

    var label: String {
        switch self {
        case .weight: return "Weight"
        case .bodyFat: return "Body fat"
        }
    }

    var decimals: Int { 1 }
}

struct CalendarView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var healthKitManager = HealthKitManager()

    @State private var records: CoachRecordsResponse?
    @State private var selectedDay = calendarLocalDay(from: Date(), timeZoneId: nil)
    @State private var loadingRecords = false
    @State private var saving = false
    @State private var syncStatus = ""
    @State private var isSyncing = false
    @State private var didAutoSync = false
    @State private var mealDraft: CalendarMealDraft?
    @State private var trainingDraft: CalendarTrainingDraft?
    @State private var progressRange = 30
    @State private var trendMetric: CalendarTrendMetric = .weight
    @State private var trendPickerExpanded = false

    private var effectiveDay: String {
        selectedDay
    }

    private var selectedDateBinding: Binding<Date> {
        Binding(
            get: { calendarPickerDate(from: selectedDay) },
            set: { nextDate in
                selectedDay = calendarLocalDay(from: nextDate, timeZoneId: nil)
            }
        )
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

    private var preferredWeightUnit: CalendarWeightUnit {
        calendarPreferredWeightUnit(from: records?.profile)
    }

    private var selectedHealth: CoachHealthSnapshot? {
        selectedRecord?.health
    }

    private var progressDays: [String] {
        calendarRecentDays(count: max(14, progressRange), endingAt: effectiveDay)
    }

    private var weightPoints: [(day: String, weight: Double?)] {
        progressDays.map { day in
            let weight = calendarDisplayWeight(records?.records.first(where: { $0.day == day })?.check_in?.weight_kg, unit: preferredWeightUnit)
            return (day: day, weight: weight)
        }
    }

    private var bodyFatPoints: [(day: String, bodyFat: Double?)] {
        progressDays.map { day in
            let bodyFat = records?.records.first(where: { $0.day == day })?.check_in?.body_fat_pct
            return (day: day, bodyFat: bodyFat)
        }
    }

    private var trendPoints: [(day: String, value: Double?)] {
        switch trendMetric {
        case .weight:
            return weightPoints.map { (day: $0.day, value: $0.weight) }
        case .bodyFat:
            return bodyFatPoints.map { (day: $0.day, value: $0.bodyFat) }
        }
    }

    private var selectedOrLatestWeight: Double? {
        calendarDisplayWeight(selectedRecord?.check_in?.weight_kg ?? records?.progress?.latestWeightKg, unit: preferredWeightUnit)
    }

    private var selectedOrLatestBodyFat: Double? {
        selectedRecord?.check_in?.body_fat_pct ?? records?.progress?.latestBodyFatPct
    }

    private var trendDelta: Double? {
        if trendMetric == .weight && progressRange == 14 {
            return calendarDisplayWeight(records?.progress?.weight14dDelta, unit: preferredWeightUnit)
        }
        if trendMetric == .weight && progressRange == 30 {
            return calendarDisplayWeight(records?.progress?.weight30dDelta, unit: preferredWeightUnit)
        }
        let numeric = trendPoints.compactMap(\.value)
        guard let first = numeric.first, let last = numeric.last else { return nil }
        return last - first
    }

    private var statusNeedsAttention: Bool {
        let normalized = syncStatus.lowercased()
        return normalized.contains("fail")
            || normalized.contains("denied")
            || normalized.contains("request failed")
            || normalized.contains("permission")
    }

    var body: some View {
        NavigationView {
            ZStack {
                Color.white.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 14) {
                        headerCard
                        summaryCard
                        trendCard
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
                saveMealDraft(updated)
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
            if !didAutoSync {
                didAutoSync = true
                syncFromHealthKit(auto: true)
            }
        }
    }

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                DatePicker("", selection: selectedDateBinding, displayedComponents: .date)
                    .datePickerStyle(.compact)
                    .labelsHidden()

                Spacer()

                Button {
                    syncFromHealthKit(auto: false)
                } label: {
                    Image(systemName: isSyncing ? "hourglass" : "heart.text.square")
                        .font(.system(size: 17, weight: .semibold))
                        .frame(width: 40, height: 40)
                }
                .buttonStyle(CalendarCircleButtonStyle())
                .disabled(isSyncing)
                .accessibilityLabel(isSyncing ? "Syncing Health" : "Sync Health")

                Button {
                    loadRecords()
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 17, weight: .semibold))
                        .frame(width: 40, height: 40)
                }
                .buttonStyle(CalendarCircleButtonStyle())
                .disabled(loadingRecords || saving)
                .rotationEffect(.degrees(loadingRecords ? 180 : 0))
                .animation(.zymSoft, value: loadingRecords)
                .accessibilityLabel("Refresh Records")
            }

            if !syncStatus.isEmpty && statusNeedsAttention {
                Text(syncStatus)
                    .font(.system(size: 12))
                    .foregroundColor(.red)
            }
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 4)
    }

    private var summaryCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Summary")
                .font(.custom("Syne", size: 22))
                .foregroundColor(Color.zymText)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                CalendarMetricTile(title: "Intake", value: calendarMetric(selectedRecord?.total_intake, suffix: " kcal"), systemImage: "fork.knife")
                CalendarMetricTile(title: "Steps", value: selectedHealth.map { "\($0.steps)" } ?? "--", systemImage: "figure.walk")
                CalendarMetricTile(title: "Weight", value: calendarMetric(selectedOrLatestWeight, suffix: preferredWeightUnit.suffix, decimals: 1), systemImage: "scalemass")
                CalendarMetricTile(title: "Body fat", value: calendarMetric(selectedOrLatestBodyFat, suffix: "%", decimals: 1), systemImage: "percent")
            }
        }
        .zymCard()
    }

    private var trendCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Button {
                        withAnimation(.zymQuick) {
                            trendPickerExpanded.toggle()
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Text(trendMetric.label)
                                .font(.custom("Syne", size: 22))
                            Image(systemName: "chevron.down")
                                .font(.system(size: 12, weight: .bold))
                                .rotationEffect(.degrees(trendPickerExpanded ? 180 : 0))
                        }
                        .foregroundColor(Color.zymText)
                    }
                    .buttonStyle(.plain)

                    Spacer()

                    let trendSuffix = trendMetric == .weight ? preferredWeightUnit.suffix : "%"
                    Text(trendDelta.map { "\(calendarSignedMetric($0, suffix: trendSuffix, decimals: trendMetric.decimals)) over \(progressRange)d" } ?? "More check-ins needed")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Color.zymSubtext)
                        .lineLimit(1)
                        .minimumScaleFactor(0.82)
                }

                if trendPickerExpanded {
                    HStack(spacing: 8) {
                        ForEach(CalendarTrendMetric.allCases) { metric in
                            Button {
                                withAnimation(.zymQuick) {
                                    trendMetric = metric
                                    trendPickerExpanded = false
                                }
                            } label: {
                                Text(metric.label)
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(metric == trendMetric ? .white : Color.zymText)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 8)
                                    .background(metric == trendMetric ? Color.zymPrimaryDark : Color.zymSurfaceSoft.opacity(0.82))
                                    .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }

            HStack {
                Spacer()
                Picker("Range", selection: $progressRange) {
                    Text("14d").tag(14)
                    Text("30d").tag(30)
                    Text("90d").tag(90)
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 220)
            }

            CalendarTrendLineChart(points: trendPoints)
        }
        .zymCard()
    }

    private var mealsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Meals")
                .font(.custom("Syne", size: 20))
                .foregroundColor(Color.zymText)
                Spacer()
                Text("\(Int((selectedRecord?.total_intake ?? 0).rounded())) kcal")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Color.zymSubtext)
            }

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
                    .padding(10)
                    .background(Color.zymSurfaceSoft.opacity(0.58))
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            }
        }
        .zymCard()
    }

    private var trainingCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Training")
                    .font(.custom("Syne", size: 20))
                    .foregroundColor(Color.zymText)
                Spacer()
                Text("\(selectedTraining.count) entr\(selectedTraining.count == 1 ? "y" : "ies")")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Color.zymSubtext)
            }

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
                                trainingDraft = CalendarTrainingDraft(day: effectiveDay, entry: entry, weightUnit: preferredWeightUnit)
                            }
                            .buttonStyle(ZYMGhostButton())
                        }

                        if let weight = calendarWeightText(entry.weight_kg, unit: preferredWeightUnit) {
                            Text("Weight \(weight)")
                                .font(.system(size: 13))
                                .foregroundColor(Color.zymSubtext)
                        }

                        if let notes = entry.notes, !notes.isEmpty {
                            Text(notes)
                                .font(.system(size: 13))
                                .foregroundColor(Color.zymSubtext)
                        }
                    }
                    .padding(10)
                    .background(Color.zymSurfaceSoft.opacity(0.58))
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            }
        }
        .zymCard()
    }

    private struct CalendarMetricTile: View {
        let title: String
        let value: String
        let systemImage: String

        var body: some View {
            HStack(spacing: 10) {
                Image(systemName: systemImage)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Color.zymText)
                    .frame(width: 30, height: 30)
                    .background(Color.white.opacity(0.74))
                    .clipShape(Circle())

                VStack(alignment: .leading, spacing: 2) {
                    Text(value)
                        .font(.custom("Syne", size: 18))
                        .foregroundColor(Color.zymText)
                        .lineLimit(1)
                        .minimumScaleFactor(0.78)
                    Text(title)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Color.zymSubtext)
                }

                Spacer(minLength: 0)
            }
            .padding(10)
            .background(Color.zymSurfaceSoft.opacity(0.64))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    private func calendarEmptyState(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundColor(Color.zymSubtext)
            .frame(maxWidth: .infinity, minHeight: 120)
            .background(Color.zymSurfaceSoft.opacity(0.7))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
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
                } else {
                    syncStatus = "Failed to load calendar records."
                }
            }
        }.resume()
    }

    private func saveMealDraft(_ updatedDraft: CalendarMealDraft? = nil) {
        guard let draft = updatedDraft ?? mealDraft,
              let userId = appState.userId,
              let url = apiURL("/coach/records/meal/update") else { return }

        var body: [String: Any] = [
            "userId": userId,
            "day": draft.day,
            "mealId": draft.mealId,
            "timezone": TimeZone.current.identifier,
        ]
        body["description"] = draft.description.trimmingCharacters(in: .whitespacesAndNewlines)
        if let calories = Double(draft.calories.trimmingCharacters(in: .whitespacesAndNewlines)) { body["calories"] = calories }
        if let protein = Double(draft.proteinG.trimmingCharacters(in: .whitespacesAndNewlines)) { body["protein_g"] = protein }
        if let carbs = Double(draft.carbsG.trimmingCharacters(in: .whitespacesAndNewlines)) { body["carbs_g"] = carbs }
        if let fat = Double(draft.fatG.trimmingCharacters(in: .whitespacesAndNewlines)) { body["fat_g"] = fat }

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
        if let weight = calendarWeightKg(from: draft.weightKg, unit: draft.weightUnit) { body["weight_kg"] = weight }
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

private struct CalendarCircleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundColor(Color.zymText)
            .background(Color.zymSurfaceSoft.opacity(configuration.isPressed ? 0.98 : 0.76))
            .clipShape(Circle())
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
    }
}

private struct CalendarTrendLineChart: View {
    let points: [(day: String, value: Double?)]

    private var plottedValues: [(index: Int, day: String, value: Double)] {
        points.enumerated().compactMap { index, point in
            guard let value = point.value else { return nil }
            return (index: index, day: point.day, value: value)
        }
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.zymSurfaceSoft.opacity(0.58))

            if plottedValues.count < 2 {
                VStack(spacing: 8) {
                    Image(systemName: "chart.xyaxis.line")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundColor(Color.zymSubtext)
                    Text("Two check-ins unlock the trend.")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Color.zymSubtext)
                }
            } else {
                GeometryReader { proxy in
                    let axisHeight: CGFloat = 28
                    let plotSize = CGSize(width: proxy.size.width, height: max(1, proxy.size.height - axisHeight))
                    let chartPoints = normalizedChartPoints(in: plotSize)
                    let axisY = plotSize.height + 5

                    ZStack {
                        Path { path in
                            path.move(to: CGPoint(x: 18, y: axisY))
                            path.addLine(to: CGPoint(x: max(18, proxy.size.width - 18), y: axisY))
                        }
                        .stroke(Color.zymLine.opacity(0.92), lineWidth: 1)

                        Path { path in
                            guard let first = chartPoints.first else { return }
                            path.move(to: first.point)
                            for item in chartPoints.dropFirst() {
                                path.addLine(to: item.point)
                            }
                        }
                        .stroke(Color.zymText, style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))

                        ForEach(chartPoints, id: \.index) { item in
                            Circle()
                                .fill(item.index == chartPoints.last?.index ? Color.zymText : Color.white)
                                .overlay(Circle().stroke(Color.zymText.opacity(0.82), lineWidth: 2))
                                .frame(width: item.index == chartPoints.last?.index ? 10 : 8, height: item.index == chartPoints.last?.index ? 10 : 8)
                                .position(item.point)
                        }

                        ForEach(chartPoints, id: \.index) { item in
                            Path { path in
                                path.move(to: CGPoint(x: item.point.x, y: axisY - 4))
                                path.addLine(to: CGPoint(x: item.point.x, y: axisY + 4))
                            }
                            .stroke(Color.zymSubtext.opacity(0.55), lineWidth: 1)
                        }

                        ForEach(axisLabels(from: chartPoints), id: \.index) { item in
                            Text(calendarShortAxisLabel(item.day))
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundColor(Color.zymSubtext)
                                .position(x: item.point.x, y: axisY + 15)
                        }
                    }
                }
            }
        }
        .frame(height: 168)
    }

    private func normalizedChartPoints(in size: CGSize) -> [(index: Int, day: String, point: CGPoint)] {
        let values = plottedValues.map(\.value)
        let minValue = values.min() ?? 0
        let maxValue = values.max() ?? minValue
        let range = max(0.5, maxValue - minValue)
        let maxIndex = max(points.count - 1, 1)
        let horizontalInset: CGFloat = 18
        let verticalInset: CGFloat = 18
        let drawableWidth = max(1, size.width - horizontalInset * 2)
        let drawableHeight = max(1, size.height - verticalInset * 2)

        return plottedValues.map { item in
            let x = horizontalInset + (CGFloat(item.index) / CGFloat(maxIndex) * drawableWidth)
            let yRatio = CGFloat((item.value - minValue) / range)
            let y = verticalInset + ((1 - yRatio) * drawableHeight)
            return (index: item.index, day: item.day, point: CGPoint(x: x, y: y))
        }
    }

    private func axisLabels(from chartPoints: [(index: Int, day: String, point: CGPoint)]) -> [(index: Int, day: String, point: CGPoint)] {
        guard chartPoints.count > 3 else { return chartPoints }
        let lastIndex = chartPoints.count - 1
        let middleIndex = lastIndex / 2
        let wanted = Set([0, middleIndex, lastIndex])
        return chartPoints.enumerated().compactMap { offset, item in
            wanted.contains(offset) ? item : nil
        }
    }
}

private struct CalendarMealEditSheet: View {
    let draft: CalendarMealDraft
    let onSave: (CalendarMealDraft) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var localDraft: CalendarMealDraft

    init(draft: CalendarMealDraft, onSave: @escaping (CalendarMealDraft) -> Void) {
        self.draft = draft
        self.onSave = onSave
        _localDraft = State(initialValue: draft)
    }

    var body: some View {
        NavigationView {
            ZStack {
                Color.white.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Logged")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(Color.zymSubtext)
                            CalendarMealReadOnlyField(title: "Time", value: localDraft.time.isEmpty ? "--:--" : localDraft.time)
                        }

                        VStack(alignment: .leading, spacing: 12) {
                            Text("Editable")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(Color.zymSubtext)

                            CalendarMealTextField(title: "Description", text: $localDraft.description)

                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                                CalendarMealNumberField(title: "Calories", unit: "kcal", text: $localDraft.calories)
                                CalendarMealNumberField(title: "Protein", unit: "g", text: $localDraft.proteinG)
                                CalendarMealNumberField(title: "Carbs", unit: "g", text: $localDraft.carbsG)
                                CalendarMealNumberField(title: "Fat", unit: "g", text: $localDraft.fatG)
                            }
                        }
                    }
                    .padding(18)
                }
            }
            .navigationTitle("Edit Meal")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(trimmedDraft)
                        dismiss()
                    }
                }
            }
        }
    }

    private var trimmedDraft: CalendarMealDraft {
        var next = localDraft
        next.description = String(next.description.trimmingCharacters(in: .whitespacesAndNewlines).prefix(500))
        next.calories = next.calories.trimmingCharacters(in: .whitespacesAndNewlines)
        next.proteinG = next.proteinG.trimmingCharacters(in: .whitespacesAndNewlines)
        next.carbsG = next.carbsG.trimmingCharacters(in: .whitespacesAndNewlines)
        next.fatG = next.fatG.trimmingCharacters(in: .whitespacesAndNewlines)
        return next
    }
}

private struct CalendarMealTextField: View {
    let title: String
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Color.zymSubtext)
            TextField(title, text: $text, axis: .vertical)
                .font(.system(size: 16))
                .foregroundColor(Color.zymText)
                .lineLimit(2...4)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.zymSurfaceSoft.opacity(0.72))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }
}

private struct CalendarMealNumberField: View {
    let title: String
    let unit: String
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 4) {
                Text(title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color.zymSubtext)
                Spacer(minLength: 4)
                Text(unit)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Color.zymSubtext.opacity(0.78))
            }

            TextField("0", text: $text)
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(Color.zymText)
                .keyboardType(.decimalPad)
                .textInputAutocapitalization(.never)
                .disableAutocorrection(true)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.zymSurfaceSoft.opacity(0.72))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }
}

private struct CalendarMealReadOnlyField: View {
    let title: String
    let value: String

    var body: some View {
        HStack {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(Color.zymSubtext)
            Spacer()
            Text(value)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Color.zymText)
        }
        .padding(12)
        .background(Color.zymSurfaceSoft.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
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
                    TextField("Weight \(localDraft.weightUnit.label)", text: $localDraft.weightKg)
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
