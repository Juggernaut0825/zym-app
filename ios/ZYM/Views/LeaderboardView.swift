import SwiftUI
import HealthKit

struct LeaderboardView: View {
    @State private var leaderboard: [LeaderboardEntry] = []
    @StateObject private var healthKitManager = LocalHealthKitManager()
    @State private var syncStatus = ""
    @State private var isSyncing = false
    @State private var didAutoSync = false
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationView {
            ZStack {
                Color.zymBackground.ignoresSafeArea()

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
              let url = apiURL("/health/leaderboard/\(userId)") else { return }
        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        URLSession.shared.dataTask(with: request) { data, _, _ in
            guard let data = data,
                  let response = try? JSONDecoder().decode(LeaderboardResponse.self, from: data) else { return }
            DispatchQueue.main.async {
                leaderboard = response.leaderboard
            }
        }.resume()
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

        URLSession.shared.dataTask(with: request) { _, _, error in
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

struct LeaderboardEntry: Codable, Identifiable {
    let id: Int
    let username: String
    let steps: Int?
    let calories_burned: Int?
}

struct LeaderboardResponse: Codable {
    let leaderboard: [LeaderboardEntry]
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
