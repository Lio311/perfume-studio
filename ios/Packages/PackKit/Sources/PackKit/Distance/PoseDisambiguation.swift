import Foundation

/// The planar homography has two poses. Keep the one in front of the camera,
/// facing the camera, within 8% of the width-only depth, and closest to the previous pose.
enum PoseDisambiguation {
    struct Candidate: Equatable {
        var depthMm: Double
        var rmse: Double
        var inFront: Bool
        var facingCamera: Bool
        /// Smaller is closer to the previous pose. Zero when there is no previous pose.
        var previousDistance: Double
        var widthOnlyMm: Double
    }

    static func choose(
        _ candidates: [Candidate],
        agreement: Double = DistanceTiming.depthAgreement,
        requireAgreement: Bool = true
    ) -> Int? {
        let facing = candidates.enumerated().filter { _, candidate in
            candidate.inFront && candidate.facingCamera && candidate.depthMm.isFinite
        }
        let agreed = facing.filter { _, candidate in
            let widthOnly = candidate.widthOnlyMm
            guard widthOnly > 1 else { return false }
            return abs(candidate.depthMm - widthOnly) / widthOnly <= agreement
        }
        let pool = agreed.isEmpty && !requireAgreement ? facing : agreed
        return pool.min { lhs, rhs in
            if lhs.element.previousDistance != rhs.element.previousDistance {
                return lhs.element.previousDistance < rhs.element.previousDistance
            }
            return lhs.element.rmse < rhs.element.rmse
        }?.offset
    }
}
