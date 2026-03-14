import Foundation

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
