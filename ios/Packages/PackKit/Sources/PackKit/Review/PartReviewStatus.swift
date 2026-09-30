import Foundation

/// Outbox state for one scanned part. `ready` is the local outbox; M5 sends it.
public enum PartReviewStatus: String, Codable, Equatable, Sendable {
    case draft
    case needsReview
    case ready

    public var hebrew: String {
        switch self {
        case .draft: return "טיוטה"
        case .needsReview: return "לבדיקה"
        case .ready: return "מוכן"
        }
    }
}
