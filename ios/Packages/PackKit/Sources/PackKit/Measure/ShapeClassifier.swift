import Foundation

public enum ShapeHint: String, Codable, Equatable, Sendable {
    case cylinder
    case taper
    case dome
    case sphere
    case cube
    case other
}

/// Advisory only. Radius variance, top curvature, and rectangle fit.
/// A box whose front is a rectangle is a cube. A round part with a steady radius is a cylinder.
/// The two silhouettes can both be rectangles; `kind` says which section was measured.
public enum ShapeClassifier {
    public static func classify(radiiMm: [Double], rectangleFit: Double, kind: PartKind) -> ShapeHint {
        guard radiiMm.count >= 4, let widest = radiiMm.max(), widest > 0 else { return .other }
        if kind == .label { return .other }
        if kind == .box, rectangleFit >= 0.95 { return .cube }
        let unit = radiiMm.map { $0 / widest }
        if kind == .box { return rectangleFit >= 0.8 ? .cube : .other }
        if isSphere(unit) { return .sphere }
        if isDome(unit) { return .dome }
        if isTaper(unit) { return .taper }
        if rectangleFit >= 0.9 || centralDeviation(unit) < 0.04 { return .cylinder }
        return .other
    }

    private static func sample(_ values: [Double], _ t: Double) -> Double {
        let clamped = min(1, max(0, t))
        let position = clamped * Double(values.count - 1)
        let lower = Int(position)
        let fraction = position - Double(lower)
        if lower >= values.count - 1 { return values[values.count - 1] }
        return values[lower] * (1 - fraction) + values[lower + 1] * fraction
    }

    private static func isSphere(_ unit: [Double]) -> Bool {
        let base = sample(unit, 0.08)
        let top = sample(unit, 0.92)
        let mid = sample(unit, 0.5)
        // A pinhole silhouette of a sphere is a disk, so the recovered ends stay near half the equator.
        guard base < 0.7, top < 0.7, mid > 0.9, abs(base - top) < 0.12 else { return false }
        var residual = 0.0
        var energy = 0.0
        for index in unit.indices {
            let t = Double(index) / Double(unit.count - 1)
            let expected = max(0, 1 - pow(2 * t - 1, 2)).squareRoot()
            residual += (unit[index] - expected) * (unit[index] - expected)
            energy += expected * expected
        }
        return energy > 0 && residual / energy < 0.04
    }

    /// A flat shoulder and a top that bends inward (curvature, not a straight taper).
    private static func isDome(_ unit: [Double]) -> Bool {
        let shoulder = sample(unit, 0.62)
        let upper = sample(unit, 0.86)
        let crown = sample(unit, 0.97)
        let base = sample(unit, 0.15)
        let dropEarly = shoulder - upper
        let dropLate = upper - crown
        // `upper` has to have started falling. A cylinder's perspective rim only collapses in the last few percent.
        return base > 0.8 && shoulder > 0.9 && upper < 0.96 && crown < 0.82 && dropLate > dropEarly && dropLate > 0.04
    }

    private static func isTaper(_ unit: [Double]) -> Bool {
        let start = max(1, unit.count / 12)
        let end = min(unit.count - 1, unit.count - unit.count / 12)
        let body = Array(unit[start..<end])
        guard body.count >= 4 else { return false }
        let n = Double(body.count)
        var sumT = 0.0
        var sumR = 0.0
        var sumTT = 0.0
        var sumTR = 0.0
        for index in body.indices {
            let t = Double(index) / Double(body.count - 1)
            sumT += t
            sumR += body[index]
            sumTT += t * t
            sumTR += t * body[index]
        }
        let denominator = n * sumTT - sumT * sumT
        guard abs(denominator) > 1e-9 else { return false }
        let slope = (n * sumTR - sumT * sumR) / denominator
        let intercept = (sumR - slope * sumT) / n
        var residual = 0.0
        var total = 0.0
        let mean = sumR / n
        for index in body.indices {
            let t = Double(index) / Double(body.count - 1)
            let predicted = intercept + slope * t
            residual += (body[index] - predicted) * (body[index] - predicted)
            total += (body[index] - mean) * (body[index] - mean)
        }
        let r2 = total < 1e-9 ? 1 : 1 - residual / total
        let base = body.first ?? 0
        let top = body.last ?? 0
        return r2 > 0.95 && abs(slope) > 0.12 && abs(base - top) > 0.12
    }

    private static func centralDeviation(_ unit: [Double]) -> Double {
        let lower = unit.count / 5
        let upper = max(lower + 1, unit.count * 4 / 5)
        return MeasureMath.standardDeviation(Array(unit[lower..<upper]))
    }
}
