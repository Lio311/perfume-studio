import Foundation

/// Puts the reference card's long side (85.60 mm on ID-1) on the longer image edges.
/// A lowest-RMSE search cannot do this: both pairings reproject the four corners,
/// and the wrong one scales Z by about 85.60 / 53.98.
enum CornerOrdering {
    struct Arrangement {
        var corners: [SIMD2<Double>]
        var longLength: Double
    }

    /// Viable orders, best first. The previous frame wins ties so a near-square
    /// projection does not swap the 85.60 mm side from one frame to the next.
    static func alignments(
        _ corners: [SIMD2<Double>],
        reference: CardReference,
        previous: [SIMD2<Double>]?
    ) -> [[SIMD2<Double>]] {
        guard corners.count == 4, corners.allSatisfy({ $0.x.isFinite && $0.y.isFinite }) else { return [] }
        var cyclic = corners
        if signedArea(cyclic) < 0 {
            cyclic = Array(cyclic.reversed())
        }
        guard abs(signedArea(cyclic)) > 1e-4 else { return [] }
        let widthIsLong = reference.widthMm >= reference.heightMm
        var scored: [Arrangement] = []
        for shift in 0..<4 {
            let turned = (0..<4).map { cyclic[($0 + shift) % 4] }
            let longEdge = widthIsLong ? widthLength(turned) : heightLength(turned)
            guard longEdge.isFinite, longEdge > 1 else { continue }
            scored.append(Arrangement(corners: turned, longLength: longEdge))
        }
        guard let best = scored.map(\.longLength).max(), best > 1 else { return [] }
        var viable = scored.filter { $0.longLength >= best * DistanceTiming.edgeHysteresis }
        if let previous, previous.count == 4 {
            viable.sort { distance($0.corners, previous) < distance($1.corners, previous) }
        } else {
            viable.sort { distance($0.corners, corners) < distance($1.corners, corners) }
        }
        return viable.map(\.corners)
    }

    static func widthLength(_ corners: [SIMD2<Double>]) -> Double {
        guard corners.count == 4 else { return 0 }
        return 0.5 * (length2(corners[1] - corners[0]) + length2(corners[2] - corners[3]))
    }

    static func heightLength(_ corners: [SIMD2<Double>]) -> Double {
        guard corners.count == 4 else { return 0 }
        return 0.5 * (length2(corners[2] - corners[1]) + length2(corners[0] - corners[3]))
    }

    static func signedArea(_ corners: [SIMD2<Double>]) -> Double {
        guard corners.count >= 3 else { return 0 }
        var sum = 0.0
        for index in 0..<corners.count {
            let next = corners[(index + 1) % corners.count]
            sum += corners[index].x * next.y - next.x * corners[index].y
        }
        return sum / 2
    }

    static func distance(_ lhs: [SIMD2<Double>], _ rhs: [SIMD2<Double>]) -> Double {
        guard lhs.count == rhs.count, !lhs.isEmpty else { return .greatestFiniteMagnitude }
        var total = 0.0
        for index in 0..<lhs.count {
            let delta = lhs[index] - rhs[index]
            total += delta.x * delta.x + delta.y * delta.y
        }
        return total
    }
}

/// Pixel geometry of one detected quad, in the same space as the intrinsics.
enum QuadGeometry {
    static func area(_ corners: [SIMD2<Double>]) -> Double {
        abs(CornerOrdering.signedArea(corners))
    }

    /// Width/height after the pinhole scales `fx` and `fy` are taken out.
    /// For a fronto-parallel card this is the physical aspect (1.586 for ID-1).
    static func metricAspect(_ corners: [SIMD2<Double>], intrinsics: CameraIntrinsics) -> Double? {
        guard corners.count == 4, intrinsics.fx > 0, intrinsics.fy > 0 else { return nil }
        let width = CornerOrdering.widthLength(corners)
        let height = CornerOrdering.heightLength(corners)
        guard width > 1, height > 1 else { return nil }
        return (width / intrinsics.fx) / (height / intrinsics.fy)
    }

    static func aspectAcceptable(_ aspect: Double, reference: CardReference) -> Bool {
        let expected = reference.widthMm / reference.heightMm
        guard expected > 0, aspect.isFinite else { return false }
        return abs(aspect - expected) / expected <= DistanceTiming.aspectTolerance
    }
}
