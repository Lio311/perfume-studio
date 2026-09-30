import Foundation

public enum OutboxItemStatus: String, Codable, Equatable {
    case pending
    case sending
    case sent
    case needsReview
    case failed
}

public struct OutboxItem: Identifiable, Codable, Equatable {
    public let id: UUID
    public let createdAt: Date
    public var status: OutboxItemStatus
    public var attempts: Int
    public var lastError: String?
    public var packJSON: Data
    public var photoURLs: [URL]
    public var name: String
    
    public init(id: UUID = UUID(), createdAt: Date = Date(), status: OutboxItemStatus = .pending, attempts: Int = 0, lastError: String? = nil, packJSON: Data, photoURLs: [URL] = [], name: String = "עיצוב חדש") {
        self.id = id
        self.createdAt = createdAt
        self.status = status
        self.attempts = attempts
        self.lastError = lastError
        self.packJSON = packJSON
        self.photoURLs = photoURLs
        self.name = name
    }
}
