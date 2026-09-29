import Foundation

/// Half-profile of a round part.
/// `normalized` is the schema `lathe`: base to top, 1 = widest radius, 42 samples.
/// The schema allows 0...1.2. Samples are clamped to 0.04...1.2, which is what the web app stores
/// (it ignores fewer than 4 samples; `lathe.ts` revolves `sample * radius`).
/// `radiiMm` is the same samples in millimetres, before that clamp.
public struct LatheProfile: Equatable, Sendable {
    public var radiiMm: [Double]
    public var heightMm: Double
    /// Image tilt of the fitted axis, degrees from vertical. Zero is upright.
    public var axisTiltDegrees: Double
    public var normalized: [Double]

    public static let sampleCount = 42
    public static let minimumNormalized = 0.04
    public static let maximumNormalized = 1.2

    public init(radiiMm: [Double], heightMm: Double, axisTiltDegrees: Double, normalized: [Double]) {
        self.radiiMm = radiiMm
        self.heightMm = heightMm
        self.axisTiltDegrees = axisTiltDegrees
        self.normalized = normalized
    }
}

public struct ProfileExtraction: Equatable, Sendable {
    public var profile: LatheProfile
    public var radiusMm: Double
    public var heightMm: Double
    public var neckOuterDiameterMm: Double
    public var apparentRadiusMm: Double
    public var iteratedRadiusMm: Double
    /// Share of rows whose radius stays within 2% of the maximum. A flat rectangle is 1.
    public var rectangleFit: Double
    /// Resampled radii before the perspective-rim fill. Shape classification uses these.
    public var observedRadiiMm: [Double]
    /// |diameter from the exact tangents − diameter from the iterated (D − r) / D factor|.
    public var parallaxResidualMm: Double
}

public enum ProfileExtractor {
    /// Round part. When `distanceMm` is the card depth, radii come from the pinhole tangents and the
    /// back-touches-the-card constraint. Otherwise each pixel is scaled by `millimetresPerPixel`.
    public static func extract(
        silhouette: Silhouette,
        intrinsics: CameraIntrinsics,
        distanceMm: Double?,
        millimetresPerPixel: Double?
    ) -> ProfileExtraction? {
        let rows = silhouette.rows()
        guard rows.count >= 2, intrinsics.isFinite else { return nil }
        if let distanceMm, distanceMm > 1 {
            return extractGeometric(rows: rows, intrinsics: intrinsics, distanceMm: distanceMm)
        }
        guard let millimetresPerPixel, millimetresPerPixel > 0 else { return nil }
        return extractScaled(rows: rows, millimetresPerPixel: millimetresPerPixel)
    }

    private static func extractGeometric(
        rows: [(y: Int, left: Int, right: Int)],
        intrinsics: CameraIntrinsics,
        distanceMm: Double
    ) -> ProfileExtraction? {
        guard let firstPass = measure(rows: rows, intrinsics: intrinsics, distanceMm: distanceMm, axis: nil) else { return nil }
        // Second pass: the axis follows the cleaned widest row (one extra iteration).
        guard let measured = measure(rows: rows, intrinsics: intrinsics, distanceMm: distanceMm, axis: firstPass.axis) else { return nil }
        let radius = measured.radius
        let depth = ParallaxCorrection.flatEndDepthMm(distanceMm: distanceMm, radiusMm: radius)
        guard depth > 1 else { return nil }
        let pixelHeight = Double(rows.last!.y - rows.first!.y + 1)
        let height = pixelHeight * depth / intrinsics.fy
        guard height.isFinite, height > 0 else { return nil }
        let apparent = measured.apparent
        let iterated = ParallaxCorrection.correctedRadius(apparentRadiusMm: apparent, distanceMm: distanceMm)
        let built = makeProfile(
            radiiTopToBottom: measured.radii,
            heightMm: height,
            axisTiltDegrees: measured.tiltDegrees
        )
        let neck = neckDiameter(built.profile.radiiMm)
        return ProfileExtraction(
            profile: built.profile,
            radiusMm: radius,
            heightMm: height,
            neckOuterDiameterMm: neck,
            apparentRadiusMm: apparent,
            iteratedRadiusMm: iterated,
            rectangleFit: rectangleFit(measured.radii),
            observedRadiiMm: built.observed,
            parallaxResidualMm: abs(2 * radius - 2 * iterated)
        )
    }

    private struct Pass {
        var radius: Double
        var apparent: Double
        var radii: [Double]
        var tiltDegrees: Double
        var axis: (x: Double, z: Double)
    }

    private static func measure(
        rows: [(y: Int, left: Int, right: Int)],
        intrinsics: CameraIntrinsics,
        distanceMm: Double,
        axis: (x: Double, z: Double)?
    ) -> Pass? {
        // A one-row glint must not set the axis. Reject it before choosing the widest row.
        let pixelWidths = rejectSpikes(rows.map { Double($0.right - $0.left + 1) })
        guard let seedIndex = pixelWidths.enumerated().max(by: { $0.element < $1.element })?.offset else { return nil }
        let widest = rows[seedIndex]
        let leftEdge = Double(widest.left)
        let rightEdge = Double(widest.right + 1)
        guard let seedRadius = ParallaxCorrection.radiusFromTangents(
            leftPixel: leftEdge,
            rightPixel: rightEdge,
            intrinsics: intrinsics,
            distanceMm: distanceMm
        ) else { return nil }
        let thetaLeft = atan((leftEdge - intrinsics.cx) / intrinsics.fx)
        let thetaRight = atan((rightEdge - intrinsics.cx) / intrinsics.fx)
        let theta = (thetaLeft + thetaRight) / 2
        let axisZ = distanceMm - seedRadius
        let axisX = axisZ * tan(theta)
        let usedAxis = axis ?? (axisX, axisZ)
        var radii: [Double] = []
        radii.reserveCapacity(rows.count)
        var centres: [(v: Double, u: Double)] = []
        for row in rows {
            let left = Double(row.left)
            let right = Double(row.right + 1)
            let radius = ParallaxCorrection.radiusAboutAxis(
                leftPixel: left,
                rightPixel: right,
                intrinsics: intrinsics,
                axisXMm: usedAxis.0,
                axisZMm: usedAxis.1
            ) ?? 0
            radii.append(radius)
            centres.append((v: Double(row.y), u: 0.5 * (left + right)))
        }
        let cleaned = rejectSpikes(radii)
        let fitted = fitAxis(centres)
        guard let maxRadius = cleaned.max(), maxRadius > 0 else { return nil }
        let xLeft = (leftEdge - intrinsics.cx) * distanceMm / intrinsics.fx
        let xRight = (rightEdge - intrinsics.cx) * distanceMm / intrinsics.fx
        let apparent = 0.5 * abs(xRight - xLeft)
        let bestIndex = cleaned.enumerated().max { $0.element < $1.element }?.offset ?? 0
        let best = rows[bestIndex]
        let bestLeft = Double(best.left)
        let bestRight = Double(best.right + 1)
        let bestTheta = 0.5 * (
            atan((bestLeft - intrinsics.cx) / intrinsics.fx) + atan((bestRight - intrinsics.cx) / intrinsics.fx)
        )
        let refined = (
            x: (distanceMm - maxRadius) * tan(bestTheta),
            z: distanceMm - maxRadius
        )
        return Pass(radius: maxRadius, apparent: apparent, radii: cleaned, tiltDegrees: fitted, axis: refined)
    }

    private static func extractScaled(
        rows: [(y: Int, left: Int, right: Int)],
        millimetresPerPixel: Double
    ) -> ProfileExtraction? {
        var radii = rows.map { Double($0.right - $0.left + 1) * 0.5 * millimetresPerPixel }
        radii = rejectSpikes(radii)
        guard let radius = radii.max(), radius > 0 else { return nil }
        let height = Double(rows.last!.y - rows.first!.y + 1) * millimetresPerPixel
        let centres = rows.map { (v: Double($0.y), u: 0.5 * Double($0.left + $0.right)) }
        let built = makeProfile(radiiTopToBottom: radii, heightMm: height, axisTiltDegrees: fitAxis(centres))
        return ProfileExtraction(
            profile: built.profile,
            radiusMm: radius,
            heightMm: height,
            neckOuterDiameterMm: neckDiameter(built.profile.radiiMm),
            apparentRadiusMm: radius,
            iteratedRadiusMm: radius,
            rectangleFit: rectangleFit(radii),
            observedRadiiMm: built.observed,
            parallaxResidualMm: 0
        )
    }

    /// Drops at most the outer 8% of each end while it is a thin perspective rim, then fills that rim
    /// with the radius it met. A real neck or dome is longer than 8% and stays in the profile.
    private static func makeProfile(
        radiiTopToBottom: [Double],
        heightMm: Double,
        axisTiltDegrees: Double
    ) -> (profile: LatheProfile, observed: [Double]) {
        let smoothed = smooth(radiiTopToBottom)
        // Image rows run top → bottom. The lathe runs base → top.
        let observed = resample(Array(smoothed.reversed()), count: LatheProfile.sampleCount)
        var values = smoothed
        let maxRadius = values.max() ?? 1
        let allowance = Int(Double(values.count) * 0.08)
        if maxRadius > 0, allowance > 0 {
            var top = 0
            while top < allowance, values[top] < 0.92 * maxRadius { top += 1 }
            var bottom = values.count - 1
            while bottom > values.count - 1 - allowance, values[bottom] < 0.92 * maxRadius { bottom -= 1 }
            if top > 0, top < values.count {
                let fill = values[top]
                for index in 0..<top { values[index] = fill }
            }
            if bottom < values.count - 1, bottom >= 0 {
                let fill = values[bottom]
                for index in (bottom + 1)..<values.count { values[index] = fill }
            }
        }
        let baseToTop = resample(Array(values.reversed()), count: LatheProfile.sampleCount)
        let widest = baseToTop.max() ?? 1
        let normalized = baseToTop.map { sample -> Double in
            let unit = widest > 1e-9 ? sample / widest : 0
            return min(LatheProfile.maximumNormalized, max(LatheProfile.minimumNormalized, unit))
        }
        let profile = LatheProfile(
            radiiMm: baseToTop,
            heightMm: heightMm,
            axisTiltDegrees: axisTiltDegrees,
            normalized: normalized
        )
        return (profile, observed)
    }

    private static func neckDiameter(_ baseToTop: [Double]) -> Double {
        guard !baseToTop.isEmpty else { return 0 }
        let count = max(1, baseToTop.count / 10)
        let top = baseToTop.suffix(count)
        return 2 * MeasureMath.median(Array(top))
    }

    private static func rectangleFit(_ radii: [Double]) -> Double {
        guard let maxRadius = radii.max(), maxRadius > 0 else { return 0 }
        let close = radii.filter { $0 >= 0.98 * maxRadius }.count
        return Double(close) / Double(radii.count)
    }

    private static func fitAxis(_ centres: [(v: Double, u: Double)]) -> Double {
        let fit = MeasureMath.fitLine(centres)
        return atan(fit.b) * 180 / .pi
    }

    private static func rejectSpikes(_ values: [Double]) -> [Double] {
        guard values.count >= 5 else { return values }
        var output = values
        let window = 4
        for index in values.indices {
            let lower = max(0, index - window)
            let upper = min(values.count - 1, index + window)
            var neighbors: [Double] = []
            neighbors.reserveCapacity(upper - lower)
            for neighbor in lower...upper where neighbor != index {
                neighbors.append(values[neighbor])
            }
            let mid = MeasureMath.median(neighbors)
            let limit = max(0.8, 0.18 * mid)
            // Only a row that sticks out past its neighbours is a glint. A real neck, taper, or dome is narrower.
            if values[index] - mid > limit {
                output[index] = mid
            }
        }
        return output
    }

    private static func smooth(_ values: [Double]) -> [Double] {
        guard values.count >= 5 else { return values }
        return values.indices.map { index in
            let lower = max(0, index - 2)
            let upper = min(values.count - 1, index + 2)
            var sum = 0.0
            var count = 0
            for cursor in lower...upper {
                sum += values[cursor]
                count += 1
            }
            return sum / Double(count)
        }
    }

    private static func resample(_ values: [Double], count: Int) -> [Double] {
        MeasureMath.resample(values, count: count)
    }
}
