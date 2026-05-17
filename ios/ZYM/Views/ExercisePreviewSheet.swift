import SwiftUI
import AVKit

struct ExercisePreviewSheet: View {
    let exercise: TrainingPlanExercise
    @Environment(\.dismiss) private var dismiss

    private var imageGallery: [String] {
        if let urls = exercise.demo_image_urls, !urls.isEmpty {
            return urls.filter { !$0.contains("youtube.com") && !$0.contains("youtu.be") }
        }
        if let url = exercise.demo_url, !url.isEmpty,
           !url.contains("youtube.com"), !url.contains("youtu.be") {
            return [url]
        }
        if let thumb = exercise.demo_thumbnail, !thumb.isEmpty {
            return [thumb]
        }
        return []
    }

    private var videoURL: URL? {
        let candidates: [String?] = [exercise.demo_video_url, exercise.demo_url]
        for raw in candidates {
            guard let raw, !raw.isEmpty else { continue }
            let lower = raw.lowercased()
            if lower.hasSuffix(".mp4") || lower.hasSuffix(".mov") || lower.hasSuffix(".m4v") {
                return URL(string: raw)
            }
        }
        return nil
    }

    private var youTubeURL: URL? {
        let candidates: [String?] = [exercise.demo_video_url, exercise.demo_url]
        for raw in candidates {
            guard let raw, !raw.isEmpty else { continue }
            if raw.contains("youtube.com") || raw.contains("youtu.be") {
                return URL(string: raw)
            }
        }
        return nil
    }

    private var primaryGifURL: URL? {
        let candidates: [String?] = [
            exercise.demo_thumbnail,
            exercise.demo_image_urls?.first,
            exercise.demo_url,
            exercise.demo_video_url,
        ]
        for raw in candidates {
            guard let raw, !raw.isEmpty else { continue }
            if raw.contains("youtube.com") || raw.contains("youtu.be") { continue }
            return URL(string: raw)
        }
        return nil
    }

    private var doseLabel: String {
        var pieces: [String] = ["\(exercise.sets) sets × \(exercise.reps) reps"]
        if let rest = exercise.rest_seconds, rest > 0 {
            pieces.append("\(rest)s rest")
        }
        if let weight = exercise.target_weight_kg, weight > 0 {
            pieces.append("\(Int(weight.rounded())) kg target")
        }
        return pieces.joined(separator: " · ")
    }

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    mediaSection
                        .padding(.top, 8)

                    VStack(alignment: .leading, spacing: 8) {
                        Text(exercise.name)
                            .font(.custom("Syne", size: 24))
                            .foregroundColor(Color.zymText)
                            .fixedSize(horizontal: false, vertical: true)

                        WrapTagsView(tags: tagItems)
                    }

                    Text(doseLabel)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Color.zymPrimaryDark)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.zymSurfaceSoft.opacity(0.8))
                        .clipShape(Capsule())

                    if let cue = exercise.cue?.trimmingCharacters(in: .whitespacesAndNewlines), !cue.isEmpty {
                        sectionCard(title: "Coach cue", body: cue)
                    }

                    if let notes = exercise.notes?.trimmingCharacters(in: .whitespacesAndNewlines), !notes.isEmpty {
                        sectionCard(title: "Notes", body: notes)
                    }

                    if let instructions = exercise.instructions, !instructions.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("How to do it")
                                .font(.system(size: 11, weight: .bold))
                                .tracking(1.4)
                                .foregroundColor(Color.zymSubtext)
                            VStack(alignment: .leading, spacing: 10) {
                                ForEach(Array(instructions.enumerated()), id: \.offset) { entry in
                                    HStack(alignment: .top, spacing: 10) {
                                        Text("\(entry.offset + 1)")
                                            .font(.system(size: 12, weight: .bold))
                                            .frame(width: 22, height: 22)
                                            .foregroundColor(.white)
                                            .background(Color.zymPrimaryDark)
                                            .clipShape(Circle())
                                        Text(stripStepPrefix(entry.element))
                                            .font(.system(size: 13))
                                            .foregroundColor(Color.zymText)
                                            .fixedSize(horizontal: false, vertical: true)
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 28)
            }
            .background(Color.zymBackgroundSoft.ignoresSafeArea())
            .navigationTitle("Exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }

    @ViewBuilder
    private var mediaSection: some View {
        if let videoURL {
            VideoPlayer(player: AVPlayer(url: videoURL))
                .frame(height: 240)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        } else if let youTubeURL {
            youTubeThumbnailSection(videoURL: youTubeURL)
        } else if let primaryGifURL {
            AsyncImage(url: primaryGifURL) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFit()
                case .failure:
                    placeholder
                default:
                    ZStack {
                        Color.zymSurfaceSoft.opacity(0.6)
                        ProgressView()
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 260)
            .background(Color.zymSurfaceSoft.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))

            if imageGallery.count > 1 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(imageGallery, id: \.self) { item in
                            if let url = URL(string: item) {
                                AsyncImage(url: url) { phase in
                                    switch phase {
                                    case .success(let image):
                                        image.resizable().scaledToFill()
                                    default:
                                        Color.zymSurfaceSoft
                                    }
                                }
                                .frame(width: 92, height: 92)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            }
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        } else {
            placeholder
        }
    }

    private func youTubeThumbnailSection(videoURL: URL) -> some View {
        let thumbURL: URL? = {
            let str = videoURL.absoluteString
            if let id = extractYouTubeVideoId(str) {
                return URL(string: "https://img.youtube.com/vi/\(id)/hqdefault.jpg")
            }
            return nil
        }()

        return Button {
            UIApplication.shared.open(videoURL)
        } label: {
            ZStack {
                if let thumbURL {
                    AsyncImage(url: thumbURL) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().scaledToFill()
                        default:
                            Color.zymSurfaceSoft.opacity(0.6)
                        }
                    }
                } else {
                    Color.zymSurfaceSoft.opacity(0.6)
                }

                Circle()
                    .fill(.black.opacity(0.55))
                    .frame(width: 56, height: 56)
                    .overlay(
                        Image(systemName: "play.fill")
                            .font(.system(size: 22))
                            .foregroundColor(.white)
                            .offset(x: 2)
                    )
            }
            .frame(maxWidth: .infinity)
            .frame(height: 240)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func extractYouTubeVideoId(_ raw: String) -> String? {
        guard let url = URL(string: raw) else { return nil }
        let host = url.host?.lowercased() ?? ""
        if host.contains("youtu.be") {
            let id = url.pathComponents.dropFirst().first
            return id?.isEmpty == false ? id : nil
        }
        if host.contains("youtube.com") {
            if let v = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "v" })?.value, !v.isEmpty {
                return v
            }
            let parts = url.pathComponents.filter { $0 != "/" }
            if let idx = parts.firstIndex(of: "shorts"), idx + 1 < parts.count {
                return parts[idx + 1]
            }
            if let idx = parts.firstIndex(of: "embed"), idx + 1 < parts.count {
                return parts[idx + 1]
            }
        }
        return nil
    }

    private var placeholder: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Color.zymSurfaceSoft.opacity(0.6))
            VStack(spacing: 8) {
                Image(systemName: "figure.strengthtraining.traditional")
                    .font(.system(size: 26))
                    .foregroundColor(Color.zymPrimary.opacity(0.7))
                Text("No demo available")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color.zymSubtext)
            }
        }
        .frame(height: 220)
    }

    private var tagItems: [String] {
        var tags: [String] = []
        if let bodyPart = exercise.body_part, !bodyPart.isEmpty { tags.append(bodyPart.capitalized) }
        if let target = exercise.target_muscle, !target.isEmpty { tags.append(target.capitalized) }
        if let equipment = exercise.equipment, !equipment.isEmpty { tags.append(equipment.capitalized) }
        return tags
    }

    private func sectionCard(title: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .bold))
                .tracking(1.4)
                .foregroundColor(Color.zymSubtext)
            Text(body)
                .font(.system(size: 13))
                .foregroundColor(Color.zymText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.zymSurfaceSoft.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func stripStepPrefix(_ line: String) -> String {
        line.replacingOccurrences(of: #"^Step:\d+\s*"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

private struct WrapTagsView: View {
    let tags: [String]

    var body: some View {
        if tags.isEmpty {
            EmptyView()
        } else {
            HStack(spacing: 6) {
                ForEach(tags, id: \.self) { tag in
                    Text(tag)
                        .font(.system(size: 11, weight: .semibold))
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(Color.zymPrimaryDark.opacity(0.08))
                        .foregroundColor(Color.zymPrimaryDark)
                        .clipShape(Capsule())
                }
            }
        }
    }
}
