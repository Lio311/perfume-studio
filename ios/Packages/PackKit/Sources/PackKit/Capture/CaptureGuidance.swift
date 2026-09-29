import Foundation

/// Hebrew instruction for the angle currently being captured.
public enum CaptureGuidance {
    public static let side = "צלם מהצד, המצלמה בגובה אמצע הרכיב, הכרטיס עומד ליד הרכיב"

    public static func text(kind: PartKind, angle: CaptureAngle) -> String {
        switch angle {
        case .side:
            return side
        case .top:
            switch kind {
            case .bottle:
                return "צלם מלמעלה, מומלץ כשהרכיב אינו עגול. הכרטיס ליד הרכיב"
            case .cap:
                return "צלם את הפקק מלמעלה, הכרטיס ליד הפקק"
            case .collar:
                return "צלם את הצווארון מלמעלה, הכרטיס לידו"
            case .box:
                return "צלם את הקופסה מלמעלה, הכרטיס לידה"
            case .pump:
                return "צלם את המשאבה מלמעלה, הכרטיס לידה"
            case .label:
                return "צלם את התווית מלמעלה, הכרטיס לידה"
            }
        case .bottom:
            return "צלם מלמטה, הכרטיס ליד בסיס הרכיב"
        case .front:
            switch kind {
            case .box:
                return "צלם את חזית הקופסה, הכרטיס עומד לידה"
            case .label:
                return "צלם את חזית התווית, הכרטיס עומד לידה"
            case .bottle, .cap, .pump, .collar:
                return "צלם את החזית, הכרטיס עומד ליד הרכיב"
            }
        }
    }
}
