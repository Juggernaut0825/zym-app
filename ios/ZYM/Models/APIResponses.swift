import Foundation

struct UploadResponse: Codable {
    let path: String
    let url: String?
    let mediaId: String?
}
