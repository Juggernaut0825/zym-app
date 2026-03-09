import SwiftUI
import AVFoundation
import CoreImage.CIFilterBuiltins
import UIKit

struct FriendsView: View {
    @State private var friends: [Friend] = []
    @State private var requests: [Friend] = []
    @State private var showAddFriend = false
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationView {
            ZStack {
                Color.zymBackground.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 14) {
                        if !requests.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Friend Requests")
                                    .foregroundColor(Color.zymText)
                                    .font(.custom("Syne", size: 20))

                                ForEach(Array(requests.enumerated()), id: \.element.id) { index, friend in
                                    FriendRequestRow(friend: friend, onAccept: { acceptFriend(friend.id) })
                                        .zymAppear(delay: Double(index) * 0.02)
                                }
                            }
                            .padding(.horizontal, 14)
                        }

                        VStack(alignment: .leading, spacing: 10) {
                            Text("Friends")
                                .foregroundColor(Color.zymText)
                                .font(.custom("Syne", size: 20))

                            if friends.isEmpty {
                                Text("No friends yet")
                                    .foregroundColor(Color.zymSubtext)
                                    .font(.system(size: 13))
                                    .padding(10)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .zymCard()
                            }

                            ForEach(Array(friends.enumerated()), id: \.element.id) { index, friend in
                                FriendRow(friend: friend)
                                    .zymAppear(delay: Double(index) * 0.02)
                            }
                        }
                        .padding(.horizontal, 14)
                    }
                    .padding(.top, 8)
                }
            }
            .navigationTitle("Friends")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showAddFriend = true }) {
                        Image(systemName: "person.badge.plus")
                            .foregroundColor(Color.zymPrimary)
                    }
                }
            }
            .sheet(isPresented: $showAddFriend) {
                AddFriendView(onAdd: loadFriends)
            }
            .onAppear(perform: loadFriends)
        }
    }

    func loadFriends() {
        guard let userId = appState.userId else { return }

        if let url = apiURL("/friends/\(userId)") {
            var request = URLRequest(url: url)
            applyAuthorizationHeader(&request, token: appState.token)
            URLSession.shared.dataTask(with: request) { data, _, _ in
                guard let data = data,
                      let response = try? JSONDecoder().decode(FriendsResponse.self, from: data) else { return }
                DispatchQueue.main.async {
                    friends = response.friends
                }
            }.resume()
        }

        if let url = apiURL("/friends/requests/\(userId)") {
            var request = URLRequest(url: url)
            applyAuthorizationHeader(&request, token: appState.token)
            URLSession.shared.dataTask(with: request) { data, _, _ in
                guard let data = data,
                      let response = try? JSONDecoder().decode(RequestsResponse.self, from: data) else { return }
                DispatchQueue.main.async {
                    requests = response.requests
                }
            }.resume()
        }
    }

    func acceptFriend(_ friendId: Int) {
        guard let userId = appState.userId,
              let url = apiURL("/friends/accept") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)
        let body = ["userId": userId, "friendId": friendId]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: request) { _, _, _ in
            DispatchQueue.main.async {
                loadFriends()
            }
        }.resume()
    }
}

struct FriendRow: View {
    let friend: Friend

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(Color.zymSurfaceSoft)
                .frame(width: 38, height: 38)
                .overlay(
                    Text(String(friend.username.prefix(2)).uppercased())
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color.zymPrimary)
                )
            Text(friend.username)
                .foregroundColor(Color.zymText)
                .font(.system(size: 15, weight: .semibold))
            Spacer()
        }
        .zymCard()
    }
}

struct FriendRequestRow: View {
    let friend: Friend
    let onAccept: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(Color.zymSurfaceSoft)
                .frame(width: 38, height: 38)
                .overlay(
                    Text(String(friend.username.prefix(2)).uppercased())
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color.zymPrimary)
                )

            Text(friend.username)
                .foregroundColor(Color.zymText)
                .font(.system(size: 15, weight: .semibold))
            Spacer()
            Button("Accept") { onAccept() }
                .buttonStyle(ZYMPrimaryButton())
        }
        .zymCard()
    }
}

struct AddFriendView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var appState: AppState
    @State private var username = ""
    @State private var identifier = ""
    @State private var connectCode = ""
    @State private var connectId = ""
    @State private var connectExpiresAt: Date?
    @State private var statusText = ""
    @State private var pending = false
    @State private var showQRCodeFullscreen = false
    @State private var showQRScanner = false
    private let refreshTimer = Timer.publish(every: 55, on: .main, in: .common).autoconnect()
    let onAdd: () -> Void

    var body: some View {
        NavigationView {
            ZStack {
                Color.zymBackground.ignoresSafeArea()

                VStack(alignment: .leading, spacing: 12) {
                    Text("Your account ID: \(appState.userId ?? 0)")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Color.zymSubtext)

                    if !connectId.isEmpty {
                        Text("Your connect ID: \(connectId)")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Color.zymText)
                    }

                    if let qrImage = makeQRCodeImage(from: connectCode) {
                        Button {
                            showQRCodeFullscreen = true
                        } label: {
                            VStack(spacing: 8) {
                                Image(uiImage: qrImage)
                                    .resizable()
                                    .interpolation(.none)
                                    .scaledToFit()
                                    .frame(width: 164, height: 164)
                                    .padding(8)
                                    .background(Color.white)
                                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                                Text("Tap QR to open full screen")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(Color.zymSubtext)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .zymCard()
                        }
                        .buttonStyle(.plain)
                    }

                    if !connectCode.isEmpty {
                        Text(connectCode)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Color.zymPrimary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }

                    if !connectCodeMeta.isEmpty {
                        Text(connectCodeMeta)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Color.zymSubtext)
                    }

                    HStack(spacing: 8) {
                        Button("Scan QR") {
                            showQRScanner = true
                        }
                        .buttonStyle(ZYMGhostButton())

                        Button("Copy Connect Code") {
                            if !connectCode.isEmpty {
                                UIPasteboard.general.string = connectCode
                                statusText = "Connect code copied."
                            }
                        }
                        .buttonStyle(ZYMGhostButton())
                        .disabled(connectCode.isEmpty)

                        Button("Refresh") { loadConnectCode() }
                            .buttonStyle(ZYMGhostButton())
                    }

                    Text("Add by user ID or connect code")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Color.zymSubtext)

                    TextField("e.g. 102 or zym://add-friend?uid=102", text: $identifier)
                        .padding(12)
                        .background(Color.zymSurface)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.zymLine, lineWidth: 1)
                        )
                        .cornerRadius(12)

                    Text("Or invite by username")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Color.zymSubtext)

                    TextField("Username", text: $username)
                        .padding(12)
                        .background(Color.zymSurface)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.zymLine, lineWidth: 1)
                        )
                        .cornerRadius(12)

                    if !statusText.isEmpty {
                        Text(statusText)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Color.zymSubtext)
                    }

                    Spacer()
                }
                .padding(18)
            }
            .navigationTitle("Add Friend")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(Color.zymSubtext)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Send") { addFriend() }
                        .disabled(pending)
                        .foregroundColor(Color.zymPrimary)
                }
            }
        }
        .onAppear {
            loadConnectCode()
        }
        .onReceive(refreshTimer) { _ in
            loadConnectCode(silent: true)
        }
        .sheet(isPresented: $showQRScanner) {
            NavigationView {
                QRCodeScannerView { scannedCode in
                    identifier = scannedCode
                    showQRScanner = false
                    statusText = "Scanned code detected. Tap Send to add."
                } onFailure: { errorMessage in
                    statusText = errorMessage
                }
                .ignoresSafeArea()
                .navigationTitle("Scan Connect QR")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Done") { showQRScanner = false }
                            .foregroundColor(Color.zymPrimary)
                    }
                }
            }
        }
        .fullScreenCover(isPresented: $showQRCodeFullscreen) {
            ConnectQRCodeFullscreenView(
                connectId: connectId,
                connectCode: connectCode,
                expiresAt: connectExpiresAt,
                onRefresh: { loadConnectCode() }
            )
        }
    }

    func addFriend() {
        guard let userId = appState.userId,
              let url = apiURL("/friends/add") else { return }

        pending = true
        statusText = ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuthorizationHeader(&request, token: appState.token)

        let trimmedUsername = username.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedIdentifier = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        var body: [String: Any] = ["userId": userId]
        if isLikelyConnectCode(trimmedIdentifier) {
            body["connectCode"] = trimmedIdentifier
        } else if let friendId = parseIdentifier(trimmedIdentifier) {
            body["friendId"] = friendId
        } else if !trimmedUsername.isEmpty {
            body["username"] = trimmedUsername
        } else {
            pending = false
            statusText = "Enter a user ID, connect code, or username."
            return
        }
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { data, response, _ in
            DispatchQueue.main.async {
                pending = false
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                if statusCode < 200 || statusCode >= 300 {
                    if let data = data,
                       let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let message = payload["error"] as? String {
                        statusText = message
                    } else {
                        statusText = "Failed to send request."
                    }
                    return
                }
                onAdd()
                dismiss()
            }
        }.resume()
    }

    var connectCodeMeta: String {
        guard let expiresAt = connectExpiresAt else {
            return "Secure connect QR rotates every minute."
        }
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return "Secure connect QR rotates every minute. Current token expires at \(formatter.string(from: expiresAt))."
    }

    func loadConnectCode(silent: Bool = false) {
        guard let userId = appState.userId,
              let url = apiURL("/friends/connect/\(userId)") else { return }
        var request = URLRequest(url: url)
        applyAuthorizationHeader(&request, token: appState.token)
        URLSession.shared.dataTask(with: request) { data, _, _ in
            guard let data = data,
                  let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let code = payload["connectCode"] as? String else {
                if !silent {
                    DispatchQueue.main.async {
                        statusText = "Failed to refresh connect code."
                    }
                }
                return
            }
            DispatchQueue.main.async {
                connectCode = code
                connectId = String(payload["connectId"] as? String ?? "")
                if connectId.isEmpty, let connectIdInt = payload["connectId"] as? Int {
                    connectId = String(connectIdInt)
                }
                connectExpiresAt = parseISODate(payload["expiresAt"] as? String)
            }
        }.resume()
    }

    func parseIdentifier(_ value: String) -> Int? {
        if let raw = Int(value), raw > 0 {
            return raw
        }
        if let url = URL(string: value),
           let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let uid = components.queryItems?.first(where: { $0.name.lowercased() == "uid" || $0.name.lowercased() == "userid" })?.value,
           let parsed = Int(uid),
           parsed > 0 {
            return parsed
        }
        return nil
    }

    func isLikelyConnectCode(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.range(of: #"^\d{6}$"#, options: .regularExpression) != nil {
            return true
        }
        let lowered = trimmed.lowercased()
        return lowered.contains("zym://add-friend")
            || lowered.contains("connectid=")
            || lowered.contains("token=")
    }

    func parseISODate(_ raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        let withFractional = ISO8601DateFormatter()
        withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFractional.date(from: raw) {
            return date
        }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: raw)
    }
}

struct Friend: Identifiable, Codable {
    let id: Int
    let username: String
    let avatar_url: String?
}

struct FriendsResponse: Codable {
    let friends: [Friend]
}

struct RequestsResponse: Codable {
    let requests: [Friend]
}

func makeQRCodeImage(from payload: String) -> UIImage? {
    guard !payload.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    let context = CIContext()
    let filter = CIFilter.qrCodeGenerator()
    filter.setValue(Data(payload.utf8), forKey: "inputMessage")
    filter.setValue("M", forKey: "inputCorrectionLevel")
    guard let outputImage = filter.outputImage else { return nil }
    let transformed = outputImage.transformed(by: CGAffineTransform(scaleX: 11, y: 11))
    guard let cgImage = context.createCGImage(transformed, from: transformed.extent) else { return nil }
    return UIImage(cgImage: cgImage)
}

struct ConnectQRCodeFullscreenView: View {
    @Environment(\.dismiss) private var dismiss
    let connectId: String
    let connectCode: String
    let expiresAt: Date?
    let onRefresh: () -> Void

    var body: some View {
        ZStack {
            Color.zymBackground.ignoresSafeArea()

            VStack(spacing: 16) {
                HStack {
                    Spacer()
                    Button("Close") { dismiss() }
                        .foregroundColor(Color.zymPrimary)
                        .font(.system(size: 16, weight: .semibold))
                }

                Text("Connect QR")
                    .font(.custom("Syne", size: 26))
                    .foregroundColor(Color.zymText)

                if !connectId.isEmpty {
                    Text("Connect ID: \(connectId)")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Color.zymText)
                }

                if let qrImage = makeQRCodeImage(from: connectCode) {
                    Image(uiImage: qrImage)
                        .resizable()
                        .interpolation(.none)
                        .scaledToFit()
                        .frame(width: 320, height: 320)
                        .padding(14)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .shadow(color: Color.black.opacity(0.08), radius: 18, x: 0, y: 10)
                }

                if let expiresAt {
                    Text("Expires at \(formattedTime(expiresAt))")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Color.zymSubtext)
                } else {
                    Text("Secure token rotates every minute.")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Color.zymSubtext)
                }

                HStack(spacing: 12) {
                    Button("Copy Code") {
                        UIPasteboard.general.string = connectCode
                    }
                    .buttonStyle(ZYMGhostButton())

                    Button("Refresh") { onRefresh() }
                        .buttonStyle(ZYMGhostButton())
                }

                Spacer()
            }
            .padding(20)
        }
    }

    private func formattedTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

final class QRCodeScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onScanned: ((String) -> Void)?
    var onFailure: ((String) -> Void)?

    private let captureSession = AVCaptureSession()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var isConfigured = false
    private var hasEmittedResult = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureIfNeeded()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if isConfigured && !captureSession.isRunning {
            captureSession.startRunning()
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if captureSession.isRunning {
            captureSession.stopRunning()
        }
    }

    private func configureIfNeeded() {
        guard !isConfigured else { return }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configureSession()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    guard let self else { return }
                    if granted {
                        self.configureSession()
                    } else {
                        self.onFailure?("Camera permission is required to scan QR.")
                    }
                }
            }
        default:
            onFailure?("Camera permission is denied. Enable it in iOS Settings.")
        }
    }

    private func configureSession() {
        guard let videoDevice = AVCaptureDevice.default(for: .video) else {
            onFailure?("No camera available on this device.")
            return
        }

        do {
            let input = try AVCaptureDeviceInput(device: videoDevice)
            guard captureSession.canAddInput(input) else {
                onFailure?("Unable to access camera input.")
                return
            }
            captureSession.addInput(input)

            let metadataOutput = AVCaptureMetadataOutput()
            guard captureSession.canAddOutput(metadataOutput) else {
                onFailure?("Unable to scan QR on this device.")
                return
            }
            captureSession.addOutput(metadataOutput)
            metadataOutput.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
            metadataOutput.metadataObjectTypes = [.qr]

            let preview = AVCaptureVideoPreviewLayer(session: captureSession)
            preview.videoGravity = .resizeAspectFill
            preview.frame = view.layer.bounds
            view.layer.insertSublayer(preview, at: 0)
            previewLayer = preview

            isConfigured = true
            captureSession.startRunning()
        } catch {
            onFailure?("Failed to initialize camera scanner.")
        }
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard !hasEmittedResult,
              let metadataObject = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              metadataObject.type == .qr,
              let value = metadataObject.stringValue else {
            return
        }

        hasEmittedResult = true
        captureSession.stopRunning()
        onScanned?(value)
    }
}

struct QRCodeScannerView: UIViewControllerRepresentable {
    let onScanned: (String) -> Void
    let onFailure: (String) -> Void

    func makeUIViewController(context: Context) -> QRCodeScannerViewController {
        let controller = QRCodeScannerViewController()
        controller.onScanned = onScanned
        controller.onFailure = onFailure
        return controller
    }

    func updateUIViewController(_ uiViewController: QRCodeScannerViewController, context: Context) {}
}
