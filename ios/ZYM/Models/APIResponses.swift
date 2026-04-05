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
    let selectedCoach: String?
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
        case height_cm
        case weight_kg
        case age
        case body_fat_pct
        case body_fat
        case training_days
        case gender
        case activity_level
        case activity
        case goal
        case experience_level
        case experience
        case notes
        case timezone
        case bmr
        case tdee
        case daily_target
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        height = container.decodeFlexibleString(forKey: .height)
        weight = container.decodeFlexibleString(forKey: .weight)
        height_cm = container.decodeFlexibleDouble(forKeys: [.height_cm, .height])
        weight_kg = container.decodeFlexibleDouble(forKeys: [.weight_kg, .weight])
        age = container.decodeFlexibleInt(forKeys: [.age])
        body_fat_pct = container.decodeFlexibleDouble(forKeys: [.body_fat_pct, .body_fat])
        training_days = container.decodeFlexibleInt(forKeys: [.training_days])
        gender = container.decodeFlexibleString(forKey: .gender)
        activity_level = container.decodeFlexibleString(forKey: .activity_level) ?? container.decodeFlexibleString(forKey: .activity)
        goal = container.decodeFlexibleString(forKey: .goal)
        experience_level = container.decodeFlexibleString(forKey: .experience_level) ?? container.decodeFlexibleString(forKey: .experience)
        notes = container.decodeFlexibleString(forKey: .notes)
        timezone = container.decodeFlexibleString(forKey: .timezone)
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

struct CoachTrainingPlanExercise: Codable, Identifiable {
    let id: String
    let exercise_key: String?
    let order: Int
    let name: String
    let sets: Int
    let reps: String
    let rest_seconds: Int
    let target_weight_kg: Double?
    let cue: String?
    let notes: String?
    let demo_url: String?
    let demo_thumbnail: String?
    let completed_at: String?
}

struct CoachTrainingPlan: Codable {
    let id: String
    let day: String
    let coach_id: String
    let title: String
    let summary: String
    let timezone: String
    let created_at: String
    let updated_at: String
    let exercises: [CoachTrainingPlanExercise]
}

struct CoachTrainingPlanResponse: Codable {
    let day: String
    let timezone: String
    let plan: CoachTrainingPlan?
}

struct CoachDayRecord: Codable, Identifiable {
    let day: String
    let total_intake: Double
    let total_burned: Double
    let meals: [CoachMealRecord]
    let training: [CoachTrainingRecord]

    var id: String { day }
}

struct CoachRecordsStats: Codable {
    let days: Int
    let mealCount: Int
    let trainingCount: Int
}

struct CoachRecordsResponse: Decodable {
    let selectedCoach: String?
    let profile: CoachProfileData
    let records: [CoachDayRecord]
    let stats: CoachRecordsStats
}
