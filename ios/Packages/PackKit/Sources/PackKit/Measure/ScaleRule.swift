import Foundation

public struct ScaleRuleResult: Equatable, Sendable {
    public var issues: [MeasureIssue]
    public var suspect: Bool
    public var saveBlocked: Bool
    /// Auto scale was offered for a part that is not a bottle or box of at least 80 mm.
    public var autoRejected: Bool
}

public enum ScaleRule {
    /// Caps, pumps, collars, and any part under 80 mm need a reference object or a typed dimension.
    /// Auto scale is kept only for a bottle or a box at least 80 mm.
    /// When a usable auto scale and a manual scale disagree by more than 5 mm, the result is `suspect` and save stays open.
    public static func evaluate(
        kind: PartKind,
        measuredSizeMm: Double,
        hasReferenceObject: Bool,
        hasTypedDimension: Bool,
        hasAuto: Bool,
        manualMillimetres: Double?,
        autoMillimetres: Double?
    ) -> ScaleRuleResult {
        var issues: [MeasureIssue] = []
        let autoAllowed = (kind == .bottle || kind == .box) && measuredSizeMm >= ScaleLimits.minimumAutoMillimetres
        let needsManual = kind == .cap || kind == .pump || kind == .collar || measuredSizeMm < ScaleLimits.minimumAutoMillimetres
        let hasManual = hasReferenceObject || hasTypedDimension
        var autoRejected = false
        if hasAuto, !autoAllowed {
            autoRejected = true
            issues.append(MeasureIssue(
                code: "scale_auto_not_allowed",
                messageHe: "קנה מידה אוטומטי מותר רק לבקבוק או לקופסה באורך 80 מ״מ ומעלה.",
                messageEn: "Auto scale is only allowed for a bottle or a box at least 80 mm long.",
                blocksSave: !hasManual
            ))
        }
        if needsManual, !hasManual {
            issues.append(MeasureIssue(
                code: "scale_reference_required",
                messageHe: "כובע, משאבה, צווארון או חלק קטן מ־80 מ״מ דורשים אובייקט ייחוס או מידה מוקלדת. השמירה נחסמה.",
                messageEn: "A cap, pump, collar, or any part under 80 mm requires a reference object or a typed dimension. Save is blocked.",
                blocksSave: true
            ))
        } else if !hasManual, !hasAuto {
            issues.append(MeasureIssue(
                code: "scale_reference_required",
                messageHe: "אין מקור קנה מידה. השמירה נחסמה.",
                messageEn: "There is no scale source. Save is blocked.",
                blocksSave: true
            ))
        }
        var suspect = false
        let autoUsable = hasAuto && autoAllowed
        if autoUsable, hasManual,
           let manualMillimetres, let autoMillimetres,
           manualMillimetres.isFinite, autoMillimetres.isFinite,
           abs(manualMillimetres - autoMillimetres) > ScaleLimits.suspectDisagreementMillimetres {
            suspect = true
            issues.append(MeasureIssue(
                code: "scale_suspect",
                messageHe: "המידה האוטומטית והמידה הידנית נבדלות ביותר מ־5 מ״מ.",
                messageEn: "Automatic and manual measurements differ by more than 5 mm.",
                blocksSave: false
            ))
        }
        let blocked = issues.contains { $0.blocksSave }
        return ScaleRuleResult(issues: issues, suspect: suspect, saveBlocked: blocked, autoRejected: autoRejected)
    }
}
