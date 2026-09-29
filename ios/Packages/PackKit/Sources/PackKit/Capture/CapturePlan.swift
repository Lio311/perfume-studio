import Foundation

/// One angle in a part's capture plan.
public enum CaptureAngle: String, Codable, Equatable, CaseIterable, Sendable {
    case side, top, bottom, front

    public var hebrew: String {
        switch self {
        case .side: return "צד"
        case .top: return "למעלה"
        case .bottom: return "למטה"
        case .front: return "חזית"
        }
    }
}

public extension PartKind {
    /// Hebrew name shown on the kind picker.
    var hebrewName: String {
        switch self {
        case .bottle: return "בקבוק"
        case .cap: return "פקק"
        case .label: return "תווית"
        case .pump: return "משאבה"
        case .collar: return "צווארון"
        case .box: return "קופסה"
        }
    }
}

/// A planned photo. `recommended` marks an optional shot the operator should
/// still take when it changes the measurement (bottle top for a non-round bottle).
public struct CaptureStep: Equatable, Sendable {
    public var angle: CaptureAngle
    public var required: Bool
    public var recommended: Bool

    public init(angle: CaptureAngle, required: Bool, recommended: Bool = false) {
        self.angle = angle
        self.required = required
        self.recommended = recommended
    }
}

/// DESIGN §5 capture plan. Bottom is always optional. Order is the guided order.
public struct CapturePlan: Equatable, Sendable {
    public var kind: PartKind
    public var steps: [CaptureStep]

    public init(kind: PartKind, steps: [CaptureStep]) {
        self.kind = kind
        self.steps = steps
    }

    public static func forKind(_ kind: PartKind) -> CapturePlan {
        switch kind {
        case .bottle:
            return CapturePlan(kind: kind, steps: [
                CaptureStep(angle: .side, required: true),
                CaptureStep(angle: .top, required: false, recommended: true),
                CaptureStep(angle: .bottom, required: false),
            ])
        case .cap:
            return CapturePlan(kind: kind, steps: [
                CaptureStep(angle: .side, required: true),
                CaptureStep(angle: .top, required: true),
                CaptureStep(angle: .bottom, required: false),
            ])
        case .pump:
            return CapturePlan(kind: kind, steps: [
                CaptureStep(angle: .side, required: true),
            ])
        case .collar:
            return CapturePlan(kind: kind, steps: [
                CaptureStep(angle: .side, required: true),
                CaptureStep(angle: .top, required: true),
            ])
        case .box:
            return CapturePlan(kind: kind, steps: [
                CaptureStep(angle: .front, required: true),
                CaptureStep(angle: .side, required: true),
                CaptureStep(angle: .top, required: false),
            ])
        case .label:
            return CapturePlan(kind: kind, steps: [
                CaptureStep(angle: .front, required: true),
            ])
        }
    }
}
