import SwiftUI

struct WorkoutShareCardStats {
    let exerciseCount: Int
    let totalSets: Int
    let estimatedMinutes: Int

    init(plan: TrainingPlan) {
        exerciseCount = plan.exercises.count
        totalSets = plan.exercises.reduce(0) { $0 + max(0, $1.sets) }
        let restSeconds = plan.exercises.reduce(0) { $0 + (($1.rest_seconds ?? 60) * max(0, $1.sets - 1)) }
        let workSeconds = totalSets * 45
        estimatedMinutes = max(1, Int(round(Double(restSeconds + workSeconds) / 60.0)))
    }
}

struct WorkoutShareCard: View {
    let plan: TrainingPlan
    let day: String
    let userDisplayName: String?

    private static let cardSize = CGSize(width: 540, height: 960)

    static var renderSize: CGSize { cardSize }

    private var stats: WorkoutShareCardStats { WorkoutShareCardStats(plan: plan) }

    private var formattedDate: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: day) else { return day }
        let out = DateFormatter()
        out.locale = Locale(identifier: "en_US_POSIX")
        out.dateFormat = "EEEE, MMM d"
        return out.string(from: date)
    }

    private var visibleExercises: [TrainingPlanExercise] {
        Array(plan.exercises.prefix(6))
    }

    private var background: LinearGradient {
        LinearGradient(
            colors: [
                Color(red: 0.060, green: 0.020, blue: 0.135),
                Color(red: 0.137, green: 0.078, blue: 0.290),
                Color(red: 0.040, green: 0.020, blue: 0.110),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    var body: some View {
        ZStack {
            background
                .ignoresSafeArea()

            // Soft glow blobs in background
            Circle()
                .fill(
                    RadialGradient(
                        colors: [Color(red: 0.55, green: 0.35, blue: 0.92).opacity(0.42), Color.clear],
                        center: .center,
                        startRadius: 10,
                        endRadius: 220
                    )
                )
                .frame(width: 360, height: 360)
                .offset(x: -140, y: -260)

            Circle()
                .fill(
                    RadialGradient(
                        colors: [Color(red: 0.95, green: 0.55, blue: 0.30).opacity(0.34), Color.clear],
                        center: .center,
                        startRadius: 10,
                        endRadius: 180
                    )
                )
                .frame(width: 300, height: 300)
                .offset(x: 180, y: 300)

            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center, spacing: 12) {
                    Image("BrandLogo")
                        .resizable()
                        .scaledToFill()
                        .frame(width: 56, height: 56)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .shadow(color: .black.opacity(0.45), radius: 12, x: 0, y: 6)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("ZYM")
                            .font(.custom("Syne", size: 22))
                            .fontWeight(.bold)
                            .tracking(2.5)
                            .foregroundColor(.white)
                        Text("Daily training log")
                            .font(.system(size: 12, weight: .medium))
                            .tracking(0.6)
                            .foregroundColor(Color.white.opacity(0.66))
                    }
                    Spacer()
                }
                .padding(.top, 50)

                Spacer().frame(height: 38)

                Text(formattedDate.uppercased())
                    .font(.system(size: 13, weight: .semibold))
                    .tracking(2.8)
                    .foregroundColor(Color.white.opacity(0.62))

                Text(plan.title)
                    .font(.custom("Syne", size: 38))
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                    .padding(.top, 8)

                if let summary = plan.summary?.trimmingCharacters(in: .whitespacesAndNewlines), !summary.isEmpty {
                    Text(summary)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Color.white.opacity(0.68))
                        .lineLimit(2)
                        .padding(.top, 10)
                }

                Spacer().frame(height: 28)

                HStack(spacing: 0) {
                    statBlock(value: "\(stats.exerciseCount)", label: "Exercises")
                    Divider().background(Color.white.opacity(0.18)).frame(width: 1, height: 44)
                    statBlock(value: "\(stats.totalSets)", label: "Total sets")
                    Divider().background(Color.white.opacity(0.18)).frame(width: 1, height: 44)
                    statBlock(value: "\(stats.estimatedMinutes)m", label: "Est. time")
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
                .background(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(Color.white.opacity(0.08))
                        .overlay(
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .stroke(Color.white.opacity(0.14), lineWidth: 1)
                        )
                )

                Spacer().frame(height: 28)

                Text("Today's lifts".uppercased())
                    .font(.system(size: 11, weight: .bold))
                    .tracking(2.4)
                    .foregroundColor(Color.white.opacity(0.5))

                VStack(alignment: .leading, spacing: 12) {
                    ForEach(Array(visibleExercises.enumerated()), id: \.element.id) { _, exercise in
                        HStack(alignment: .center, spacing: 12) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(
                                    LinearGradient(
                                        colors: [
                                            Color(red: 0.42, green: 0.84, blue: 0.55),
                                            Color(red: 0.31, green: 0.66, blue: 0.43),
                                        ],
                                        startPoint: .top, endPoint: .bottom
                                    )
                                )

                            Text(exercise.name)
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundColor(.white)
                                .lineLimit(1)

                            Spacer(minLength: 8)

                            Text(exerciseDoseText(exercise))
                                .font(.system(size: 13, weight: .semibold).monospacedDigit())
                                .foregroundColor(Color.white.opacity(0.74))
                        }
                    }
                    if plan.exercises.count > visibleExercises.count {
                        Text("+ \(plan.exercises.count - visibleExercises.count) more")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Color.white.opacity(0.52))
                            .padding(.top, 2)
                    }
                }
                .padding(.top, 14)

                Spacer(minLength: 18)

                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(userDisplayName ?? "Logged with ZYM")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.white)
                        Text("zym8.com")
                            .font(.system(size: 11, weight: .medium))
                            .tracking(1.6)
                            .foregroundColor(Color.white.opacity(0.5))
                    }
                    Spacer()
                    HStack(spacing: 4) {
                        Capsule()
                            .fill(Color(red: 0.42, green: 0.84, blue: 0.55))
                            .frame(width: 28, height: 6)
                        Capsule()
                            .fill(Color(red: 0.95, green: 0.55, blue: 0.30))
                            .frame(width: 14, height: 6)
                        Capsule()
                            .fill(Color(red: 0.55, green: 0.35, blue: 0.92))
                            .frame(width: 8, height: 6)
                    }
                }
                .padding(.bottom, 44)
            }
            .padding(.horizontal, 38)
            .frame(width: Self.cardSize.width, height: Self.cardSize.height, alignment: .topLeading)
        }
        .frame(width: Self.cardSize.width, height: Self.cardSize.height)
        .clipped()
    }

    private func statBlock(value: String, label: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.custom("Syne", size: 26))
                .fontWeight(.bold)
                .foregroundColor(.white)
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .tracking(1.4)
                .foregroundColor(Color.white.opacity(0.6))
        }
        .frame(maxWidth: .infinity)
    }

    private func exerciseDoseText(_ exercise: TrainingPlanExercise) -> String {
        "\(exercise.sets) × \(exercise.reps)"
    }
}

@MainActor
enum WorkoutShareImageRenderer {
    static func renderImage(for plan: TrainingPlan, day: String, userDisplayName: String?) -> UIImage? {
        let card = WorkoutShareCard(plan: plan, day: day, userDisplayName: userDisplayName)
        let renderer = ImageRenderer(content: card)
        renderer.scale = 3.0
        renderer.proposedSize = ProposedViewSize(WorkoutShareCard.renderSize)
        return renderer.uiImage
    }
}

#Preview("Workout share card") {
    Text("Run on simulator to preview WorkoutShareCard with real data.")
        .padding()
}
