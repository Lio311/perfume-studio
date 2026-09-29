import Foundation

/// The part stands beside the upright card.
/// A round part is treated as touching the card plane with its back, so its axis sits one radius closer
/// than the card. Lengths read on the card plane are therefore large by about D / (D − r).
/// `correctedRadius` iterates that factor. `radiusFromTangents` is the same constraint solved exactly
/// for a pinhole view of a vertical round part (the two silhouette rays are tangent to the circle).
/// A flat end's near rim is one further radius closer, at D − 2r, which is `flatEndDepthMm`.
/// A box face that lies in the card plane is not moved.
public enum ParallaxCorrection {
    public static let defaultIterations = 2

    /// `r ← rApparent * (D − r) / D`, repeated. Returns the apparent radius when D is not usable.
    public static func correctedRadius(apparentRadiusMm: Double, distanceMm: Double, iterations: Int = defaultIterations) -> Double {
        guard apparentRadiusMm.isFinite, apparentRadiusMm > 0, distanceMm.isFinite, distanceMm > apparentRadiusMm else {
            return apparentRadiusMm
        }
        var radius = apparentRadiusMm
        let steps = max(1, iterations)
        for _ in 0..<steps {
            let next = apparentRadiusMm * (distanceMm - radius) / distanceMm
            if next.isFinite, next > 0, next < distanceMm {
                radius = next
            }
        }
        return radius
    }

    /// Scale that takes a card-plane length onto the axis depth D − r.
    public static func roundFactor(radiusMm: Double, distanceMm: Double) -> Double {
        guard distanceMm.isFinite, distanceMm > 0, radiusMm.isFinite, radiusMm > 0, radiusMm < distanceMm else { return 1 }
        return (distanceMm - radiusMm) / distanceMm
    }

    public static func correctRound(apparentMm: Double, distanceMm: Double, radiusMm: Double) -> Double {
        apparentMm * roundFactor(radiusMm: radiusMm, distanceMm: distanceMm)
    }

    /// Depth of the near rim of a flat-ended round part whose back touches the card plane.
    public static func flatEndDepthMm(distanceMm: Double, radiusMm: Double) -> Double {
        guard distanceMm.isFinite, radiusMm.isFinite else { return distanceMm }
        return distanceMm - 2 * radiusMm
    }

    /// The box front is in the card plane, so the rectified length is already metric.
    public static func correctBoxFront(apparentMm: Double) -> Double {
        apparentMm
    }

    /// Exact radius, in millimetres, of a vertical circle whose back touches the plane Z = `distanceMm`.
    /// `leftPixel` and `rightPixel` are the outer silhouette edges on one image row.
    public static func radiusFromTangents(
        leftPixel: Double,
        rightPixel: Double,
        intrinsics: CameraIntrinsics,
        distanceMm: Double
    ) -> Double? {
        guard intrinsics.isFinite, distanceMm.isFinite, distanceMm > 1,
              leftPixel.isFinite, rightPixel.isFinite, rightPixel > leftPixel else { return nil }
        let thetaLeft = atan((leftPixel - intrinsics.cx) / intrinsics.fx)
        let thetaRight = atan((rightPixel - intrinsics.cx) / intrinsics.fx)
        let half = (thetaRight - thetaLeft) / 2
        let center = (thetaRight + thetaLeft) / 2
        let sine = sin(half)
        let cosine = cos(center)
        let denominator = cosine + sine
        guard sine > 0, denominator > 1e-9 else { return nil }
        let radius = distanceMm * sine / denominator
        guard radius.isFinite, radius > 0, radius < distanceMm else { return nil }
        return radius
    }

    /// Radius of a circle centred at `(axisXMm, axisZMm)` given one row's tangent rays.
    /// The bisector of the two rays points at the axis, and `r = L sin(β / 2)`.
    public static func radiusAboutAxis(
        leftPixel: Double,
        rightPixel: Double,
        intrinsics: CameraIntrinsics,
        axisXMm: Double,
        axisZMm: Double
    ) -> Double? {
        guard intrinsics.isFinite, axisZMm > 1, rightPixel > leftPixel else { return nil }
        let thetaLeft = atan((leftPixel - intrinsics.cx) / intrinsics.fx)
        let thetaRight = atan((rightPixel - intrinsics.cx) / intrinsics.fx)
        let half = (thetaRight - thetaLeft) / 2
        let distance = (axisXMm * axisXMm + axisZMm * axisZMm).squareRoot()
        let radius = distance * sin(half)
        guard radius.isFinite, radius > 0 else { return nil }
        return radius
    }
}
