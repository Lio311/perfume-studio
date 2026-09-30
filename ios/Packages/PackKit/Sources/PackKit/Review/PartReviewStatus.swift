import Foundation

/// Outbox state for one scanned part. `ready` is the local outbox; M5 sends it.
public enum PartReviewStatus: String, Codable, Equatable, Sendable {
    case draft
    case needsReview
    case ready

    /// A status this build does not know (for example a future `sent`) stays listable as a draft.
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        self = Self(rawValue: raw) ?? .draft
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    public var hebrew: String {
        switch self {
        case .draft: return "טיוטה"
        case .needsReview: return "לבדיקה"
        case .ready: return "מוכן"
        }
    }
}
