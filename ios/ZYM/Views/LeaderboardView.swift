import SwiftUI
import HealthKit

struct LeaderboardView: View {
    @State private var leaderboard: [LeaderboardEntry] = []
    @State private var momentum: HealthMomentumResponse?
    @StateObject private var healthKitManager = LocalHealthKitManager()
    @State private var syncStatus = ""
    @State private var isSyncing = false
    @State private var didAutoSync = false
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationView {
            ZStack {
                ZYMBackgroundLayer().ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text("Apple Health")
                                    .font(.custom("Syne", size: 17))
                                    .foregroundColor(Color.zymText)
                                Spacer()
                                Button(action: { syncFromHealthKit(auto: false) }) {
                                    Text(isSyncing ? "Syncing..." : "Sync")
                                }
                                .buttonStyle(ZYMGhostButton())
                                .disabled(isSyncing)
                            }

                            Text(syncStatus.isEmpty ? "Sync your daily steps and active calories to update rank." : syncStatus)
                                .font(.system(size: 12))
                                .foregroundColor(Color.zymSubtext)
                        }
                        .zymCard()

                        if let momentum {
                            VStack(alignment: .leading, spacing: 10) {
                                HStack {
                                    Text("Momentum (7 days)")
                                        .font(.custom("Syne", size: 17))
                                        .foregroundColor(Color.zymText)
                                    Spacer()
                                    Text(momentum.trend.direction.uppercased())
                                        .font(.system(size: 11, weight: .bold))
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(Color.zymSurfaceSoft)
                                        .cornerRadius(999)
                                }

                                HStack(spacing: 8) {
                                    MomentumStatPill(title: "Streak", value: "\(momentum.streakDays)d")
                                    MomentumStatPill(title: "Active", value: "\(momentum.activityDays)/7")
                                    MomentumStatPill(title: "Avg Steps", value: "\(momentum.averages.steps)")
                                }

                                let maxScore = max(momentum.last7Days.map { $0.score }.max() ?? 1, 1)
                                HStack(alignment: .bottom, spacing: 8) {
                                    ForEach(momentum.last7Days) { day in
                                        VStack(spacing: 6) {
                                            ZStack(alignment: .bottom) {
                                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                                    .fill(Color.zymSurfaceSoft)
                                                    .frame(height: 70)
                                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                                    .fill(Color.zymPrimary)
                                                    .frame(height: max(10, CGFloat(day.score) / CGFloat(maxScore) * 66))
                                            }
                                            Text(day.shortLabel)
                                                .font(.system(size: 11))
                                                .foregroundColor(Color.zymSubtext)
                                        }
                                    }
                                }

                                if let bestDay = momentum.bestDay {
                                    Text("Best day: \(bestDay.shortLabel) · \(bestDay.steps) steps · \(bestDay.calories_burned) cal")
                                        .font(.system(size: 12))
                                        .foregroundColor(Color.zymSubtext)
                                } else {
                                    Text("No synced health momentum yet.")
                                        .font(.system(size: 12))
                                        .foregroundColor(Color.zymSubtext)
                                }
                            }
                            .zymCard()
                        }

                        ForEach(Array(leaderboard.enumerated()), id: \.element.id) { index, entry in
                            HStack(spacing: 10) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .fill(index < 3 ? Color.zymPrimary : Color.zymSurfaceSoft)
                                        .frame(width: 36, height: 36)
                                    Text("\(index + 1)")
                                        .font(.system(size: 15, weight: .bold))
                                        .foregroundColor(index < 3 ? .white : Color.zymText)
                                }

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(entry.username)
                                        .font(.custom("Syne", size: 16))
                                        .foregroundColor(Color.zymText)
                                    Text("\(entry.steps ?? 0) steps · \(entry.calories_burned ?? 0) cal")
                                        .font(.caption)
                                        .foregroundColor(Color.zymSubtext)
                                }

                                Spacer()
                            }
                            .zymCard()
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.top, 8)
                }
            }
            .navigationTitle("Rank")
            .onAppear {
                if !didAutoSync {
                    didAutoSync = true
                    syncFromHealthKit(auto: true)
                } else {
                    loadLeaderboard()
                }
            }
        }
    }

    func loadLeaderboard() {
        guard let userId = appState.userId,
              let leaderboardURL = apiURL("/health/leaderboard/\(userId)"),
              let momentumURL = apiURL("/health/momentum/\(userId)") else { return }

        let group = DispatchGroup()
        var nextLeaderboard: [LeaderboardEntry]?
        var nextMomentum: HealthMomentumResponse?

        group.enter()
        var leaderboardRequest = URLRequest(url: leaderboardURL)
        applyAuthorizationHeader(&leaderboardRequest, token: appState.token)
        authorizedDataTask(appState: appState, request: leaderboardRequest) { data, _, _ in
            defer { group.leave() }
            guard let data = data,
                  let response = try? JSONDecoder().decode(LeaderboardResponse.self, from: data) else { return }
            nextLeaderboard = response.leaderboard
        }.resume()

        group.enter()
        var momentumRequest = URLRequest(url: momentumURL)
        applyAuthorizationHeader(&momentumRequest, token: appState.token)
        authorizedDataTask(appState: appState, request: momentumRequest) { data, _, _ in
            defer { group.leave() }
            guard let data = data,
                  let response = try? JSONDecoder().decode(HealthMomentumResponse.self, from: data) else { return }
            nextMomentum = response
        }.resume()

        group.notify(queue: .main) {
            if let nextLeaderboard {
                leaderboard = nextLeaderboard
            }
            momentum = nextMomentum
        }
    }

    func syncFromHealthKit(auto: Bool) {
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
                    syncHealth(steps: steps, calories: calories, auto: auto)
                }
            }
        }
    }

    func syncHealth(steps: Int, calories: Int, auto: Bool) {
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
            "calories": calories
        ])

        authorizedDataTask(appState: appState, request: request) { _, _, error in
            DispatchQueue.main.async {
                isSyncing = false
                if error == nil {
                    syncStatus = "Synced today: \(steps) steps · \(calories) kcal"
                    loadLeaderboard()
                } else if !auto {
                    syncStatus = "Sync failed. Please try again."
                }
            }
        }.resume()
    }
}

private struct MomentumStatPill: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.system(size: 11))
                .foregroundColor(Color.zymSubtext)
            Text(value)
                .font(.custom("Syne", size: 16))
                .foregroundColor(Color.zymText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 8)
        .padding(.horizontal, 10)
        .background(Color.zymSurfaceSoft)
        .cornerRadius(12)
    }
}

struct LeaderboardEntry: Codable, Identifiable {
    let id: Int
    let username: String
    let steps: Int?
    let calories_burned: Int?
}

struct LeaderboardResponse: Codable {
    let leaderboard: [LeaderboardEntry]
}

struct HealthMomentumPoint: Codable, Identifiable {
    let date: String
    let steps: Int
    let calories_burned: Int
    let active_minutes: Int
    let score: Int

    var id: String { date }

    var shortLabel: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        guard let dateValue = formatter.date(from: date) else { return String(date.prefix(3)) }
        formatter.dateFormat = "EEE"
        return formatter.string(from: dateValue)
    }
}

struct HealthMomentumAverages: Codable {
    let steps: Int
    let calories_burned: Int
    let active_minutes: Int
}

struct HealthMomentumTrend: Codable {
    let direction: String
    let delta: Int
}

struct HealthMomentumResponse: Codable {
    let today: HealthMomentumPoint?
    let last7Days: [HealthMomentumPoint]
    let averages: HealthMomentumAverages
    let activityDays: Int
    let streakDays: Int
    let trend: HealthMomentumTrend
    let bestDay: HealthMomentumPoint?
}

final class LocalHealthKitManager: ObservableObject {
    private let healthStore = HKHealthStore()

    func requestAuthorization(completion: @escaping (Bool) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(false)
            return
        }

        let types: Set<HKSampleType> = [
            HKQuantityType(.stepCount),
            HKQuantityType(.activeEnergyBurned)
        ]

        healthStore.requestAuthorization(toShare: [], read: types) { success, _ in
            completion(success)
        }
    }

    func fetchTodaySteps(completion: @escaping (Int) -> Void) {
        let type = HKQuantityType(.stepCount)
        let now = Date()
        let start = Calendar.current.startOfDay(for: now)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: now)

        let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, _ in
            let value = result?.sumQuantity()?.doubleValue(for: .count()) ?? 0
            completion(Int(value))
        }

        healthStore.execute(query)
    }

    func fetchTodayCalories(completion: @escaping (Int) -> Void) {
        let type = HKQuantityType(.activeEnergyBurned)
        let now = Date()
        let start = Calendar.current.startOfDay(for: now)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: now)

        let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, _ in
            let value = result?.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0
            completion(Int(value))
        }

        healthStore.execute(query)
    }
}
