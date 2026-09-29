import Foundation

public enum ScaleLimits {
    /// DESIGN §5. A reference card smaller than this fraction of the frame is rejected.
    public static let minimumCardAreaFraction = 0.08
    /// DESIGN §5. Tilt above this is rejected. Tilt from here down to `strongTiltDegrees` is `check`.
    public static let maximumCardTiltDegrees = 25.0
    public static let strongTiltDegrees = 15.0
    /// Auto scale (LiDAR / object capture) is only for a bottle or a box at least this large.
    public static let minimumAutoMillimetres = 80.0
    /// Manual and auto copies of the same length that disagree by more than this are `suspect`.
    public static let suspectDisagreementMillimetres = 5.0
    public static let toleranceMillimetres = 5.0
    public static let okErrorMillimetres = 3.0
    public static let checkErrorMillimetres = 5.0
}

public struct MeasureIssue: Equatable, Sendable {
    public var code: String
    public var messageHe: String
    public var messageEn: String
    public var blocksSave: Bool

    public init(code: String, messageHe: String, messageEn: String, blocksSave: Bool) {
        self.code = code
        self.messageHe = messageHe
        self.messageEn = messageEn
        self.blocksSave = blocksSave
    }
}

/// Image pixels ↔ card-plane millimetres. The plane origin is the card centre, X right, Y down.
public struct CardPlaneMap: Equatable, Sendable {
    public var imageFromPlane: [Double]
    public var planeFromImage: [Double]

    public func pixel(fromPlaneMm point: SIMD2<Double>) -> SIMD2<Double>? {
        MeasureMath.apply(imageFromPlane, point)
    }

    public func planeMm(fromPixel pixel: SIMD2<Double>) -> SIMD2<Double>? {
        MeasureMath.apply(planeFromImage, pixel)
    }

    public var mmPerPxAtCentre: Double {
        guard let origin = pixel(fromPlaneMm: SIMD2(0, 0)),
              let stepX = pixel(fromPlaneMm: SIMD2(1, 0)),
              let stepY = pixel(fromPlaneMm: SIMD2(0, 1)) else { return 0 }
        let pxPerMm = 0.5 * (length2(stepX - origin) + length2(stepY - origin))
        guard pxPerMm > 1e-9 else { return 0 }
        return 1 / pxPerMm
    }
}

public enum ScaleSourceKind: String, Codable, Equatable, Sendable {
    case card
    case coin
    case ruler
    case custom
    case typed
    case autoLidar
    case autoObjectCapture
}

/// Pixel width and height of the part silhouette, used by a typed dimension.
public struct PixelExtent: Equatable, Sendable {
    public var widthPx: Double
    public var heightPx: Double

    public init(widthPx: Double, heightPx: Double) {
        self.widthPx = widthPx
        self.heightPx = heightPx
    }
}

public struct ScaleSolution: Equatable, Sendable {
    public var mmPerPx: Double
    public var pxPerMm: Double
    public var depthMm: Double?
    public var tiltDegrees: Double?
    public var reprojectionPx: Double?
    public var cardAreaFraction: Double?
    public var plane: CardPlaneMap?
    public var source: ScaleSourceKind
    public var sigmaScaleMm: Double
    public var referenceObject: String?
    /// `ScanInfo.scale` enum, when one applies.
    public var scanScale: String?
    /// `Measurements.source` enum.
    public var measurementSource: String
    /// `ScanInfo.method` hint before a profile is known.
    public var scanMethod: String
    public var issue: MeasureIssue?
    public var isSharp: Bool

    public var isUsable: Bool { issue == nil && mmPerPx.isFinite && mmPerPx > 0 }
}

public enum ScaleSolver {
    public static func solve(
        reference: ScaleReference,
        intrinsics: CameraIntrinsics,
        frame: PixelSize,
        extent: PixelExtent? = nil,
        lidarDepthMm: Double? = nil
    ) -> ScaleSolution {
        switch reference {
        case let .card(corners, size):
            return solveCard(corners: corners, size: size, intrinsics: intrinsics, frame: frame, lidarDepthMm: lidarDepthMm)
        case let .coin(p1, p2, diameterMm):
            return solveTap(p1: p1, p2: p2, millimetres: diameterMm, source: .coin, intrinsics: intrinsics,
                            referenceObject: "ILS coin \(format(diameterMm))mm (to verify)",
                            scanScale: "manual", measurementSource: "estimate", scanMethod: "single-photo")
        case let .ruler(p1, p2, mm):
            return solveTap(p1: p1, p2: p2, millimetres: mm, source: .ruler, intrinsics: intrinsics,
                            referenceObject: "ruler \(format(mm))mm",
                            scanScale: "ruler", measurementSource: "ruler", scanMethod: "single-photo")
        case let .custom(p1, p2, mm):
            return solveTap(p1: p1, p2: p2, millimetres: mm, source: .custom, intrinsics: intrinsics,
                            referenceObject: "custom reference \(format(mm))mm",
                            scanScale: "manual", measurementSource: "estimate", scanMethod: "single-photo")
        case let .typedDimension(axis, mm):
            return solveTyped(axis: axis, millimetres: mm, extent: extent, intrinsics: intrinsics)
        case let .auto(source, mmPerPx):
            return solveAuto(source: source, mmPerPx: mmPerPx, intrinsics: intrinsics, lidarDepthMm: lidarDepthMm)
        }
    }

    private static func solveCard(
        corners: [SIMD2<Double>],
        size: CardReference,
        intrinsics: CameraIntrinsics,
        frame: PixelSize,
        lidarDepthMm: Double?
    ) -> ScaleSolution {
        var solution = empty(.card, sigma: 1, scanScale: "reference-card", measurementSource: "reference-card", scanMethod: "photo-lathe")
        solution.referenceObject = cardLabel(size)
        guard corners.count == 4, intrinsics.isFinite, size.isFinite,
              corners.allSatisfy({ $0.x.isFinite && $0.y.isFinite }) else {
            solution.issue = degenerate()
            return solution
        }
        let area = MeasureMath.polygonArea(corners)
        let frameArea = frame.width * frame.height
        let fraction = frameArea > 0 ? area / frameArea : 0
        solution.cardAreaFraction = fraction
        guard let pose = CardPose.estimate(imageCorners: corners, intrinsics: intrinsics, reference: size) else {
            solution.issue = degenerate()
            return solution
        }
        solution.depthMm = lidarDepth(lidarDepthMm) ?? pose.depthMm
        solution.tiltDegrees = pose.tiltDegrees
        solution.reprojectionPx = pose.reprojectionPx
        solution.isSharp = pose.reprojectionPx <= 2
        if pose.tiltDegrees > ScaleLimits.maximumCardTiltDegrees {
            solution.issue = MeasureIssue(
                code: "card_tilt",
                messageHe: "הכרטיס מוטה ביותר מ־25 מעלות.",
                messageEn: "The card is tilted by more than 25°.",
                blocksSave: true
            )
            return solution
        }
        if fraction < ScaleLimits.minimumCardAreaFraction {
            solution.issue = MeasureIssue(
                code: "card_too_small",
                messageHe: "הכרטיס מכסה פחות מ־8% משטח הפריים.",
                messageEn: "The card covers less than 8% of the frame.",
                blocksSave: true
            )
            return solution
        }
        solution.plane = planeMap(corners: corners, size: size, intrinsics: intrinsics)
        let mmPerPx = solution.plane?.mmPerPxAtCentre ?? widthMillimetresPerPixel(corners: corners, widthMm: size.widthMm)
        guard mmPerPx > 0 else {
            solution.issue = degenerate()
            return solution
        }
        solution.mmPerPx = mmPerPx
        solution.pxPerMm = 1 / mmPerPx
        solution.sigmaScaleMm = cardSigma(tilt: pose.tiltDegrees, reprojectionPx: pose.reprojectionPx, mmPerPx: mmPerPx)
        return solution
    }

    private static func solveTap(
        p1: SIMD2<Double>,
        p2: SIMD2<Double>,
        millimetres: Double,
        source: ScaleSourceKind,
        intrinsics: CameraIntrinsics,
        referenceObject: String,
        scanScale: String,
        measurementSource: String,
        scanMethod: String
    ) -> ScaleSolution {
        var solution = empty(source, sigma: 3.6, scanScale: scanScale, measurementSource: measurementSource, scanMethod: scanMethod)
        solution.referenceObject = referenceObject
        let pixels = length2(p2 - p1)
        guard intrinsics.isFinite, millimetres.isFinite, millimetres > 0, pixels > 1,
              p1.x.isFinite, p2.x.isFinite else {
            solution.issue = degenerate()
            return solution
        }
        solution.mmPerPx = millimetres / pixels
        solution.pxPerMm = pixels / millimetres
        solution.sigmaScaleMm = 3.6
        return solution
    }

    private static func solveTyped(axis: MeasureAxis, millimetres: Double, extent: PixelExtent?, intrinsics: CameraIntrinsics) -> ScaleSolution {
        var solution = empty(.typed, sigma: 3.6, scanScale: "manual", measurementSource: "estimate", scanMethod: "manual")
        solution.referenceObject = "typed \(axis.rawValue) \(format(millimetres))mm"
        guard intrinsics.isFinite, millimetres.isFinite, millimetres > 0, let extent else {
            solution.issue = degenerate()
            return solution
        }
        let pixels = axis == .height ? extent.heightPx : extent.widthPx
        guard pixels > 1 else {
            solution.issue = degenerate()
            return solution
        }
        solution.mmPerPx = millimetres / pixels
        solution.pxPerMm = pixels / millimetres
        return solution
    }

    private static func solveAuto(
        source: AutoScaleSource,
        mmPerPx: Double,
        intrinsics: CameraIntrinsics,
        lidarDepthMm: Double?
    ) -> ScaleSolution {
        let kind: ScaleSourceKind = source == .lidar ? .autoLidar : .autoObjectCapture
        let sigma = source == .lidar ? 2.0 : 3.6
        var solution = empty(
            kind,
            sigma: sigma,
            scanScale: source == .lidar ? "lidar" : nil,
            measurementSource: source == .lidar ? "lidar" : "object-capture",
            scanMethod: source == .lidar ? "single-photo" : "object-capture"
        )
        solution.referenceObject = source == .lidar ? "LiDAR" : "Object Capture"
        solution.depthMm = lidarDepth(lidarDepthMm)
        guard intrinsics.isFinite, mmPerPx.isFinite, mmPerPx > 0 else {
            solution.issue = degenerate()
            return solution
        }
        solution.mmPerPx = mmPerPx
        solution.pxPerMm = 1 / mmPerPx
        return solution
    }

    static func planeMap(corners: [SIMD2<Double>], size: CardReference, intrinsics: CameraIntrinsics) -> CardPlaneMap? {
        let object = PoseMath.modelCorners(size)
        let plane = object.map { SIMD2($0.x, $0.y) }
        var best: (rotation: Mat3, translation: SIMD3<Double>, score: Double)?
        for ordered in PoseMath.cycles(corners) {
            var seeds: [(rotation: Mat3, translation: SIMD3<Double>)] = []
            if let homography = PoseMath.homography(from: plane, to: ordered) {
                seeds.append(contentsOf: PoseMath.poseCandidates(homography: homography, intrinsics: intrinsics))
            }
            if let seed = frontoParallel(corners: ordered, intrinsics: intrinsics, reference: size) {
                seeds.append(seed)
            }
            for candidate in seeds {
                guard let pose = PoseMath.refine(
                    rotation: candidate.rotation,
                    translation: candidate.translation,
                    objectPoints: object,
                    imagePoints: ordered,
                    intrinsics: intrinsics
                ), pose.translation.z > 0 else { continue }
                // Keep the first correspondence (the caller's TL, TR, BR, BL order) unless another cycle is clearly better.
                if best == nil || pose.rmse < best!.score - 1e-4 {
                    best = (pose.rotation, pose.translation, pose.rmse)
                }
            }
        }
        guard let best, best.score < 8 else { return nil }
        let homography = imageHomography(rotation: best.rotation, translation: best.translation, intrinsics: intrinsics)
        guard let inverse = MeasureMath.inverse(homography) else { return nil }
        return CardPlaneMap(imageFromPlane: MeasureMath.rowMajor(homography), planeFromImage: MeasureMath.rowMajor(inverse))
    }

    /// Pixels from card-plane millimetres: `K [r1 r2 t]`.
    private static func imageHomography(rotation: Mat3, translation: SIMD3<Double>, intrinsics: CameraIntrinsics) -> Mat3 {
        let axes = Mat3(c0: rotation.c0, c1: rotation.c1, c2: translation)
        return PoseMath.intrinsicsMatrix(intrinsics) * axes
    }

    /// Same fronto-parallel seed `CardPose` uses, so a tilted card still picks the corner cycle that refines.
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

    private static func widthMillimetresPerPixel(corners: [SIMD2<Double>], widthMm: Double) -> Double {
        guard corners.count == 4, widthMm > 0 else { return 0 }
        let top = length2(corners[1] - corners[0])
        let bottom = length2(corners[2] - corners[3])
        let pixels = (top + bottom) / 2
        guard pixels > 1 else { return 0 }
        return widthMm / pixels
    }

    private static func cardSigma(tilt: Double, reprojectionPx: Double, mmPerPx: Double) -> Double {
        if tilt >= ScaleLimits.strongTiltDegrees { return 3.8 }
        if reprojectionPx > 2 { return min(4.5, 1.2 + (reprojectionPx - 2) * mmPerPx * 8) }
        return 1.0
    }

    private static func lidarDepth(_ raw: Double?) -> Double? {
        guard let raw, raw.isFinite, raw > 0 else { return nil }
        return raw
    }

    private static func cardLabel(_ size: CardReference) -> String {
        if size == .id1 { return "ISO/IEC 7810 ID-1 card 85.60x53.98mm" }
        return "printed card \(format(size.widthMm))x\(format(size.heightMm))mm"
    }

    private static func format(_ value: Double) -> String {
        String(format: "%g", value)
    }

    private static func empty(
        _ source: ScaleSourceKind,
        sigma: Double,
        scanScale: String?,
        measurementSource: String,
        scanMethod: String
    ) -> ScaleSolution {
        ScaleSolution(
            mmPerPx: 0,
            pxPerMm: 0,
            depthMm: nil,
            tiltDegrees: nil,
            reprojectionPx: nil,
            cardAreaFraction: nil,
            plane: nil,
            source: source,
            sigmaScaleMm: sigma,
            referenceObject: nil,
            scanScale: scanScale,
            measurementSource: measurementSource,
            scanMethod: scanMethod,
            issue: nil,
            isSharp: false
        )
    }

    private static func degenerate() -> MeasureIssue {
        MeasureIssue(
            code: "scale_degenerate",
            messageHe: "לא ניתן לחשב קנה מידה מהייחוס.",
            messageEn: "The reference does not determine a scale.",
            blocksSave: true
        )
    }
}
