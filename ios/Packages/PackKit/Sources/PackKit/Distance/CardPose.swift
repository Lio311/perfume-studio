import Foundation

/// Depth and tilt of a reference rectangle seen by a pinhole camera.
public struct CardPoseEstimate: Equatable, Sendable {
    /// Camera-axis depth of the card centre, millimetres.
    public var depthMm: Double
    /// Angle between the card normal and the optical axis. 0° is fronto-parallel.
    public var tiltDegrees: Double
    /// Cross-check `Z = fx * W / w_px` from the mean pixel length of the two width edges.
    public var widthOnlyDepthMm: Double
    /// Root-mean-square reprojection of the four corners after refinement, pixels.
    public var reprojectionPx: Double

    public init(depthMm: Double, tiltDegrees: Double, widthOnlyDepthMm: Double, reprojectionPx: Double) {
        self.depthMm = depthMm
        self.tiltDegrees = tiltDegrees
        self.widthOnlyDepthMm = widthOnlyDepthMm
        self.reprojectionPx = reprojectionPx
    }
}

public enum CardPose {
    /// `imageCorners` are pixels in the order top-left, top-right, bottom-right, bottom-left,
    /// with the origin at the top-left of the image and Y growing downward.
    /// The card centre's depth is the Z component of its camera-frame translation.
    public static func estimate(
        imageCorners: [SIMD2<Double>],
        intrinsics: CameraIntrinsics,
        reference: CardReference = .id1
    ) -> CardPoseEstimate? {
        guard imageCorners.count == 4, intrinsics.isFinite, reference.isFinite else { return nil }
        guard imageCorners.allSatisfy({ $0.x.isFinite && $0.y.isFinite }) else { return nil }
        let object = PoseMath.modelCorners(reference)
        var best: PoseMath.Pose?
        var bestCorners: [SIMD2<Double>] = imageCorners
        for corners in PoseMath.cycles(imageCorners) {
            let plane = object.map { SIMD2($0.x, $0.y) }
            if let homography = PoseMath.homography(from: plane, to: corners) {
                for candidate in PoseMath.poseCandidates(homography: homography, intrinsics: intrinsics) {
                    consider(
                        PoseMath.refine(
                            rotation: candidate.rotation,
                            translation: candidate.translation,
                            objectPoints: object,
                            imagePoints: corners,
                            intrinsics: intrinsics
                        ),
                        corners: corners,
                        best: &best,
                        bestCorners: &bestCorners
                    )
                }
            }
            if let seed = frontoParallel(corners: corners, intrinsics: intrinsics, reference: reference) {
                consider(
                    PoseMath.refine(
                        rotation: seed.rotation,
                        translation: seed.translation,
                        objectPoints: object,
                        imagePoints: corners,
                        intrinsics: intrinsics
                    ),
                    corners: corners,
                    best: &best,
                    bestCorners: &bestCorners
                )
            }
        }
        guard let best, best.translation.z > 0, best.rmse < 8 else { return nil }
        guard let widthOnly = PoseMath.widthOnlyDepth(imagePoints: bestCorners, widthMm: reference.widthMm, fx: intrinsics.fx) else {
            return nil
        }
        return CardPoseEstimate(
            depthMm: best.translation.z,
            tiltDegrees: PoseMath.tiltDegrees(best.rotation),
            widthOnlyDepthMm: widthOnly,
            reprojectionPx: best.rmse
        )
    }

    private static func consider(_ pose: PoseMath.Pose?, corners: [SIMD2<Double>], best: inout PoseMath.Pose?, bestCorners: inout [SIMD2<Double>]) {
        guard let pose, pose.translation.z > 0 else { return }
        if best == nil || pose.rmse < best!.rmse {
            best = pose
            bestCorners = corners
        }
    }

    private static func frontoParallel(
        corners: [SIMD2<Double>],
        intrinsics: CameraIntrinsics,
        reference: CardReference
    ) -> (rotation: Mat3, translation: SIMD3<Double>)? {
        guard let depth = PoseMath.widthOnlyDepth(imagePoints: corners, widthMm: reference.widthMm, fx: intrinsics.fx) else {
            return nil
        }
        let centre = (corners[0] + corners[1] + corners[2] + corners[3]) / 4
        let translation = SIMD3(
            (centre.x - intrinsics.cx) * depth / intrinsics.fx,
            (centre.y - intrinsics.cy) * depth / intrinsics.fy,
            depth
        )
        return (Mat3.identity, translation)
    }
}
