import Foundation

private extension KeyedDecodingContainer {
    func decodeFlexibleString(forKey key: Key) -> String? {
        if let stringValue = try? decodeIfPresent(String.self, forKey: key) {
            let trimmed = stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
        if let intValue = try? decodeIfPresent(Int.self, forKey: key) {
            return String(intValue)
        }
        if let doubleValue = try? decodeIfPresent(Double.self, forKey: key) {
            if abs(doubleValue.rounded() - doubleValue) < 0.00001 {
                return String(Int(doubleValue.rounded()))
            }
            return String(doubleValue)
        }
        return nil
    }

    func decodeFlexibleDouble(forKeys keys: [Key]) -> Double? {
        for key in keys {
            if let doubleValue = try? decodeIfPresent(Double.self, forKey: key) {
                return doubleValue
            }
            if let intValue = try? decodeIfPresent(Int.self, forKey: key) {
                return Double(intValue)
            }
            if let stringValue = try? decodeIfPresent(String.self, forKey: key) {
                let trimmed = stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
                if let parsed = Double(trimmed) {
                    return parsed
                }
            }
        }
        return nil
    }

    func decodeFlexibleInt(forKeys keys: [Key]) -> Int? {
        for key in keys {
            if let intValue = try? decodeIfPresent(Int.self, forKey: key) {
                return intValue
            }
            if let doubleValue = try? decodeIfPresent(Double.self, forKey: key) {
                return Int(doubleValue.rounded())
            }
            if let stringValue = try? decodeIfPresent(String.self, forKey: key) {
                let trimmed = stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
                if let parsed = Int(trimmed) {
                    return parsed
                }
                if let parsed = Double(trimmed) {
                    return Int(parsed.rounded())
                }
            }
        }
        return nil
    }
}

struct APIErrorResponse: Codable {
    let error: String
}

struct AuthLoginResponse: Codable {
    let token: String
    let refreshToken: String
    let userId: Int
    let username: String?
    let display_name: String?
    let selectedCoach: String?
    let enabledCoaches: [String]?
    let timezone: String?
}

struct AuthRegisterResponse: Codable {
    let userId: Int
    let verificationRequired: Bool?
}

struct VerificationRequestResponse: Codable {
    let ok: Bool
    let message: String?
}

struct UploadResponse: Codable {
    let path: String
    let url: String?
    let mediaId: String?
    let assetId: String?
}

struct UploadIntentResponse: Codable {
    let strategy: String?
    let assetId: String?
    let upload: UploadTarget?
    let path: String?
    let url: String?
}

struct UploadTarget: Codable {
    let method: String
    let url: String
    let headers: [String: String]?
}

struct CoachOption: Identifiable, Hashable {
    let value: String
    let label: String
    let description: String?

    var id: String { value }
}

struct CoachBodyFatRangeOption: Identifiable, Hashable {
    let value: String
    let label: String
    let midpoint: Double

    var id: String { value }
}

let coachGenderOptions: [CoachOption] = [
    CoachOption(value: "male", label: "Male", description: nil),
    CoachOption(value: "female", label: "Female", description: nil),
]

let coachActivityLevelOptions: [CoachOption] = [
    CoachOption(value: "sedentary", label: "Sedentary", description: "Mostly seated, minimal training"),
    CoachOption(value: "light", label: "Light", description: "Light activity a few days each week"),
    CoachOption(value: "moderate", label: "Moderate", description: "Regular training and average daily movement"),
    CoachOption(value: "active", label: "Active", description: "Frequent training and high daily movement"),
    CoachOption(value: "very_active", label: "Very active", description: "High training volume or physical work"),
]

let coachGoalOptions: [CoachOption] = [
    CoachOption(value: "cut", label: "Cut", description: "Lean out and reduce body fat"),
    CoachOption(value: "maintain", label: "Maintain", description: "Keep bodyweight steady and improve consistency"),
    CoachOption(value: "bulk", label: "Bulk", description: "Build size and increase bodyweight"),
]

let coachExperienceLevelOptions: [CoachOption] = [
    CoachOption(value: "beginner", label: "Beginner", description: "New to structured training"),
    CoachOption(value: "intermediate", label: "Intermediate", description: "Has trained consistently before"),
    CoachOption(value: "advanced", label: "Advanced", description: "Comfortable with programming and progression"),
]

let coachTrainingDayOptions: [CoachOption] = [
    CoachOption(value: "1", label: "1 day / week", description: nil),
    CoachOption(value: "2", label: "2 days / week", description: nil),
    CoachOption(value: "3", label: "3 days / week", description: nil),
    CoachOption(value: "4", label: "4 days / week", description: nil),
    CoachOption(value: "5", label: "5 days / week", description: nil),
    CoachOption(value: "6", label: "6 days / week", description: nil),
    CoachOption(value: "7", label: "7 days / week", description: nil),
]

let coachBodyFatRangeOptions: [CoachBodyFatRangeOption] = [
    CoachBodyFatRangeOption(value: "6-9", label: "6-9%", midpoint: 8),
    CoachBodyFatRangeOption(value: "10-14", label: "10-14%", midpoint: 12),
    CoachBodyFatRangeOption(value: "15-19", label: "15-19%", midpoint: 17),
    CoachBodyFatRangeOption(value: "20-24", label: "20-24%", midpoint: 22),
    CoachBodyFatRangeOption(value: "25-29", label: "25-29%", midpoint: 27),
    CoachBodyFatRangeOption(value: "30-35", label: "30-35%", midpoint: 32),
    CoachBodyFatRangeOption(value: "36-45", label: "36-45%", midpoint: 40),
]

func coachBodyFatRangeToValue(_ range: String) -> Double? {
    coachBodyFatRangeOptions.first(where: { $0.value == range })?.midpoint
}

func coachBodyFatValueToRange(_ value: Double?) -> String {
    guard let value, value.isFinite, value > 0 else { return "" }
    guard let best = coachBodyFatRangeOptions.min(by: { abs($0.midpoint - value) < abs($1.midpoint - value) }) else {
        return ""
    }
    return best.value
}

struct CoachProfileData: Decodable {
    let height: String?
    let weight: String?
    let preferred_weight_unit: String?
    let preferred_height_unit: String?
    let height_cm: Double?
    let weight_kg: Double?
    let age: Int?
    let body_fat_pct: Double?
    let training_days: Int?
    let gender: String?
    let activity_level: String?
    let goal: String?
    let experience_level: String?
    let notes: String?
    let timezone: String?
    let bmr: Double?
    let tdee: Double?
    let daily_target: Double?

    private enum CodingKeys: String, CodingKey {
        case height
        case weight
        case preferred_weight_unit
        case preferredWeightUnit
        case preferred_height_unit
        case preferredHeightUnit
        case height_cm
        case heightCm
        case weight_kg
        case weightKg
        case age
        case ageYears
        case body_fat_pct
        case body_fat
        case bodyFatPct
        case bodyFat
        case training_days
        case trainingDays
        case trainingDaysPerWeek
        case gender
        case sex
        case activity_level
        case activity
        case activityLevel
        case goal
        case fitness_goal
        case fitnessGoal
        case experience_level
        case experience
        case experienceLevel
        case notes
        case timezone
        case timeZone
        case bmr
        case tdee
        case daily_target
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        height = container.decodeFlexibleString(forKey: .height) ?? container.decodeFlexibleString(forKey: .heightCm) ?? container.decodeFlexibleString(forKey: .height_cm)
        weight = container.decodeFlexibleString(forKey: .weight) ?? container.decodeFlexibleString(forKey: .weightKg) ?? container.decodeFlexibleString(forKey: .weight_kg)
        preferred_weight_unit = container.decodeFlexibleString(forKey: .preferred_weight_unit) ?? container.decodeFlexibleString(forKey: .preferredWeightUnit)
        preferred_height_unit = container.decodeFlexibleString(forKey: .preferred_height_unit) ?? container.decodeFlexibleString(forKey: .preferredHeightUnit)
        height_cm = container.decodeFlexibleDouble(forKeys: [.height_cm, .heightCm, .height])
        weight_kg = container.decodeFlexibleDouble(forKeys: [.weight_kg, .weightKg, .weight])
        age = container.decodeFlexibleInt(forKeys: [.age, .ageYears])
        body_fat_pct = container.decodeFlexibleDouble(forKeys: [.body_fat_pct, .body_fat, .bodyFatPct, .bodyFat])
        training_days = container.decodeFlexibleInt(forKeys: [.training_days, .trainingDays, .trainingDaysPerWeek])
        gender = container.decodeFlexibleString(forKey: .gender) ?? container.decodeFlexibleString(forKey: .sex)
        activity_level = container.decodeFlexibleString(forKey: .activity_level)
            ?? container.decodeFlexibleString(forKey: .activity)
            ?? container.decodeFlexibleString(forKey: .activityLevel)
        goal = container.decodeFlexibleString(forKey: .goal)
            ?? container.decodeFlexibleString(forKey: .fitness_goal)
            ?? container.decodeFlexibleString(forKey: .fitnessGoal)
        experience_level = container.decodeFlexibleString(forKey: .experience_level)
            ?? container.decodeFlexibleString(forKey: .experience)
            ?? container.decodeFlexibleString(forKey: .experienceLevel)
        notes = container.decodeFlexibleString(forKey: .notes)
        timezone = container.decodeFlexibleString(forKey: .timezone) ?? container.decodeFlexibleString(forKey: .timeZone)
        bmr = container.decodeFlexibleDouble(forKeys: [.bmr])
        tdee = container.decodeFlexibleDouble(forKeys: [.tdee])
        daily_target = container.decodeFlexibleDouble(forKeys: [.daily_target])
    }
}

struct CoachMealRecord: Codable, Identifiable {
    let id: String
    let time: String?
    let timezone: String?
    let occurred_at_utc: String?
    let calories: Double?
    let protein_g: Double?
    let carbs_g: Double?
    let fat_g: Double?
    let description: String?
}

struct CoachTrainingRecord: Codable, Identifiable {
    let id: String
    let time: String?
    let timezone: String?
    let occurred_at_utc: String?
    let name: String?
    let sets: Double?
    let reps: String?
    let weight_kg: Double?
    let volume_kg: Double?
    let notes: String?
    let source_plan_id: String?
    let source_exercise_id: String?
    let from_plan: Bool?
}

struct CoachCheckInRecord: Codable {
    let weight_kg: Double?
    let body_fat_pct: Double?
    let notes: String?
    let timezone: String?
    let occurred_at_utc: String?
    let logged_at: String?
}

struct CoachHealthSnapshot: Codable {
    let steps: Int
    let calories_burned: Int
    let active_minutes: Int
    let synced_at: String?
}

struct CoachProgressSummary: Codable {
    let latestCheckInDay: String?
    let latestCheckInAt: String?
    let latestWeightDay: String?
    let latestWeightKg: Double?
    let latestBodyFatPct: Double?
    let weight7dAvg: Double?
    let weight14dDelta: Double?
    let weight30dDelta: Double?
    let lastBodyFatDay: String?
    let checkInDays: Int
    let trendLine: String
    let status: String
    let statusLabel: String
    let trendNarrative: String
}

struct CoachDayRecord: Codable, Identifiable {
    let day: String
    let total_intake: Double
    let total_burned: Double
    let check_in: CoachCheckInRecord?
    let health: CoachHealthSnapshot?
    let meals: [CoachMealRecord]
    let training: [CoachTrainingRecord]

    var id: String { day }
}

struct CoachRecordsStats: Codable {
    let days: Int
    let mealCount: Int
    let trainingCount: Int
    let checkInCount: Int?
    let healthDayCount: Int?
}

struct CoachRecordsResponse: Decodable {
    let selectedCoach: String?
    let profile: CoachProfileData
    let progress: CoachProgressSummary?
    let records: [CoachDayRecord]
    let stats: CoachRecordsStats
}
