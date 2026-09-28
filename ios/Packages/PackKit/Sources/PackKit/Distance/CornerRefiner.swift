import Foundation

/// A 2D line through `point` along a unit `direction`.
public struct FittedLine: Equatable, Sendable {
    public var point: SIMD2<Double>
    public var direction: SIMD2<Double>

    public init(point: SIMD2<Double>, direction: SIMD2<Double>) {
        self.point = point
        self.direction = direction
    }
}

/// Sub-pixel corner repair: fit a line to each edge, then intersect adjacent lines.
public enum CornerRefiner {
    public static func fitLine(_ points: [SIMD2<Double>]) -> FittedLine? {
        let usable = points.filter { $0.x.isFinite && $0.y.isFinite }
        guard usable.count >= 2 else { return nil }
        var mean = SIMD2<Double>(repeating: 0)
        for point in usable { mean += point }
        mean /= Double(usable.count)
        var xx = 0.0
        var xy = 0.0
        var yy = 0.0
        for point in usable {
            let d = point - mean
            xx += d.x * d.x
            xy += d.x * d.y
            yy += d.y * d.y
        }
        let theta = 0.5 * atan2(2 * xy, xx - yy)
        let direction = SIMD2(cos(theta), sin(theta))
        guard length2(direction) > 0 else { return nil }
        return FittedLine(point: mean, direction: direction)
    }

    public static func intersection(_ a: FittedLine, _ b: FittedLine) -> SIMD2<Double>? {
        let cross = a.direction.x * b.direction.y - a.direction.y * b.direction.x
        guard abs(cross) > 1e-8 else { return nil }
        let diff = b.point - a.point
        let t = (diff.x * b.direction.y - diff.y * b.direction.x) / cross
        let point = a.point + a.direction * t
        guard point.x.isFinite, point.y.isFinite else { return nil }
        return point
    }

    /// `edges` are the top, right, bottom, and left samples, in that order.
    /// The result is top-left, top-right, bottom-right, bottom-left.
    public static func corners(edges: [[SIMD2<Double>]]) -> [SIMD2<Double>]? {
        guard edges.count == 4 else { return nil }
        let lines = edges.compactMap(fitLine)
        guard lines.count == 4 else { return nil }
        let pairs = [(0, 3), (0, 1), (1, 2), (2, 3)]
        var corners: [SIMD2<Double>] = []
        for pair in pairs {
            guard let corner = intersection(lines[pair.0], lines[pair.1]) else { return nil }
            corners.append(corner)
        }
        return corners
    }
}

/// Numbers for `VNDetectRectanglesRequest`, expressed the way the spec states them.
/// Vision itself wants the shorter/longer ratio in `[0, 1]`, so the request converts.
public struct CardDetectorTuning: Equatable, Sendable {
    public var longOverShort: Double
    public var aspectTolerance: Double
    public var minimumSize: Double
    public var maximumObservations: Int
    public var quadratureToleranceDegrees: Double

    public init(
        longOverShort: Double,
        aspectTolerance: Double,
        minimumSize: Double,
        maximumObservations: Int,
        quadratureToleranceDegrees: Double
    ) {
        self.longOverShort = longOverShort
        self.aspectTolerance = aspectTolerance
        self.minimumSize = minimumSize
        self.maximumObservations = maximumObservations
        self.quadratureToleranceDegrees = quadratureToleranceDegrees
    }

    /// ID-1 aspect 1.586 ± 0.1, minimum size 0.15, one observation, 15° quadrature.
    public static let id1 = CardDetectorTuning(
        longOverShort: 1.586,
        aspectTolerance: 0.1,
        minimumSize: 0.15,
        maximumObservations: 1,
        quadratureToleranceDegrees: 15
    )

    /// Lower Vision aspect ratio (shorter side / longer side).
    public var visionMinimumAspectRatio: Double {
        1 / (longOverShort + aspectTolerance)
    }

    /// Upper Vision aspect ratio (shorter side / longer side).
    public var visionMaximumAspectRatio: Double {
        1 / (longOverShort - aspectTolerance)
    }
}
