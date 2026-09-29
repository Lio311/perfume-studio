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

struct CardPoseMemory: Equatable {
    var rotation: Mat3
    var translation: SIMD3<Double>
    var corners: [SIMD2<Double>]
}

struct CardSolveResult {
    var estimate: CardPoseEstimate?
    var failure: CardRejectReason?
    var memory: CardPoseMemory?
    var orderedCorners: [SIMD2<Double>]
    var widthOnlyMillimetres: Double?
}

public enum CardPose {
    /// `imageCorners` are pixels in the order top-left, top-right, bottom-right, bottom-left,
    /// with the origin at the top-left of the image and Y growing downward.
    /// The card centre's depth is the Z component of its camera-frame translation.
    /// The 85.60 mm side is matched to the longer image edges before the solve.
    public static func estimate(
        imageCorners: [SIMD2<Double>],
        intrinsics: CameraIntrinsics,
        reference: CardReference = .id1
    ) -> CardPoseEstimate? {
        solve(imageCorners: imageCorners, intrinsics: intrinsics, reference: reference, memory: nil, requireWidthAgreement: false).estimate
    }

    /// `requireWidthAgreement` rejects the frame when every in-front pose disagrees with
    /// `fx * W / w_px` by more than 8%. The distance guide turns that on. Measurement
    /// leaves it off so an off-centre card can still scale a part.
    static func solve(
        imageCorners: [SIMD2<Double>],
        intrinsics: CameraIntrinsics,
        reference: CardReference = .id1,
        memory: CardPoseMemory?,
        requireWidthAgreement: Bool = true
    ) -> CardSolveResult {
        guard imageCorners.count == 4, intrinsics.isFinite, reference.isFinite else {
            return CardSolveResult(estimate: nil, failure: .pose, memory: nil, orderedCorners: [], widthOnlyMillimetres: nil)
        }
        guard imageCorners.allSatisfy({ $0.x.isFinite && $0.y.isFinite }) else {
            return CardSolveResult(estimate: nil, failure: .pose, memory: nil, orderedCorners: [], widthOnlyMillimetres: nil)
        }
        let alignments = CornerOrdering.alignments(imageCorners, reference: reference, previous: memory?.corners)
        guard !alignments.isEmpty else {
            return CardSolveResult(estimate: nil, failure: .pose, memory: nil, orderedCorners: [], widthOnlyMillimetres: nil)
        }
        let object = PoseMath.modelCorners(reference)
        var candidates: [PoseDisambiguation.Candidate] = []
        var poses: [PoseMath.Pose] = []
        var cornerSets: [[SIMD2<Double>]] = []
        var widthOnlyValues: [Double] = []
        for corners in alignments {
            guard let widthOnly = PoseMath.widthOnlyDepth(imagePoints: corners, widthMm: reference.widthMm, fx: intrinsics.fx) else {
                continue
            }
            for pose in refinedPoses(corners: corners, object: object, intrinsics: intrinsics, reference: reference) {
                guard pose.rmse < 8, pose.translation.z.isFinite else { continue }
                let previousDistance = memory.map { poseDistance(pose, memory: $0) } ?? 0
                candidates.append(PoseDisambiguation.Candidate(
                    depthMm: pose.translation.z,
                    rmse: pose.rmse,
                    inFront: pose.translation.z > 1,
                    facingCamera: pose.rotation.c2.z > 0,
                    previousDistance: previousDistance,
                    widthOnlyMm: widthOnly
                ))
                poses.append(pose)
                cornerSets.append(corners)
                widthOnlyValues.append(widthOnly)
            }
        }
        guard let index = PoseDisambiguation.choose(candidates, requireAgreement: requireWidthAgreement) else {
            let hadFacing = candidates.contains { $0.inFront && $0.facingCamera }
            let ordered = alignments[0]
            let widthOnly = PoseMath.widthOnlyDepth(imagePoints: ordered, widthMm: reference.widthMm, fx: intrinsics.fx)
            return CardSolveResult(
                estimate: nil,
                failure: hadFacing ? .depthDisagree : .pose,
                memory: nil,
                orderedCorners: ordered,
                widthOnlyMillimetres: widthOnly
            )
        }
        let pose = poses[index]
        let corners = cornerSets[index]
        let widthOnly = widthOnlyValues[index]
        let estimate = CardPoseEstimate(
            depthMm: pose.translation.z,
            tiltDegrees: PoseMath.tiltDegrees(pose.rotation),
            widthOnlyDepthMm: widthOnly,
            reprojectionPx: pose.rmse
        )
        let next = CardPoseMemory(rotation: pose.rotation, translation: pose.translation, corners: corners)
        return CardSolveResult(
            estimate: estimate,
            failure: nil,
            memory: next,
            orderedCorners: corners,
            widthOnlyMillimetres: widthOnly
        )
    }

    private static func refinedPoses(
        corners: [SIMD2<Double>],
        object: [SIMD3<Double>],
        intrinsics: CameraIntrinsics,
        reference: CardReference
    ) -> [PoseMath.Pose] {
        var poses: [PoseMath.Pose] = []
        let plane = object.map { SIMD2($0.x, $0.y) }
        if let homography = PoseMath.homography(from: plane, to: corners) {
            for candidate in PoseMath.poseCandidates(homography: homography, intrinsics: intrinsics) {
                if let pose = PoseMath.refine(
                    rotation: candidate.rotation,
                    translation: candidate.translation,
                    objectPoints: object,
                    imagePoints: corners,
                    intrinsics: intrinsics
                ) {
                    poses.append(pose)
                }
            }
        }
        if let seed = frontoParallel(corners: corners, intrinsics: intrinsics, reference: reference),
           let pose = PoseMath.refine(
            rotation: seed.rotation,
            translation: seed.translation,
            objectPoints: object,
            imagePoints: corners,
            intrinsics: intrinsics
           ) {
            poses.append(pose)
        }
        return poses
    }

    private static func poseDistance(_ pose: PoseMath.Pose, memory: CardPoseMemory) -> Double {
        let depth = abs(pose.translation.z - memory.translation.z) / max(memory.translation.z, 1)
        let relative = memory.rotation.transpose * pose.rotation
        let trace = relative.c0.x + relative.c1.y + relative.c2.z
        let cosine = min(1, max(-1, (trace - 1) / 2))
        return depth + acos(cosine)
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
