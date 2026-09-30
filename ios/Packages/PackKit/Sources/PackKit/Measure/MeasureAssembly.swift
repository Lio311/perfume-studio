import Foundation

/// One saved still plus the silhouette MeasureKit already extracted.
public struct MeasureAssemblyPhoto: Sendable {
    public var angle: CaptureAngle
    public var intrinsics: CameraIntrinsics
    public var pixelWidth: Int
    public var pixelHeight: Int
    public var silhouette: Silhouette?
    public var cardCorners: [SIMD2<Double>]?
    public var lidarDepthMm: Double?
    public var capturedAt: String
    public var device: String?

    public init(
        angle: CaptureAngle,
        intrinsics: CameraIntrinsics,
        pixelWidth: Int,
        pixelHeight: Int,
        silhouette: Silhouette? = nil,
        cardCorners: [SIMD2<Double>]? = nil,
        lidarDepthMm: Double? = nil,
        capturedAt: String = "2026-09-29T00:00:00Z",
        device: String? = nil
    ) {
        self.angle = angle
        self.intrinsics = intrinsics
        self.pixelWidth = pixelWidth
        self.pixelHeight = pixelHeight
        self.silhouette = silhouette
        self.cardCorners = cardCorners
        self.lidarDepthMm = lidarDepthMm
        self.capturedAt = capturedAt
        self.device = device
    }
}

/// Photos, the chosen reference, and an optional LiDAR scale. The estimator stays in PackKit.
public struct MeasureAssemblyRequest: Sendable {
    public var kind: PartKind
    public var photos: [MeasureAssemblyPhoto]
    public var reference: ScaleReference?
    public var autoScale: ScaleReference?
    public var outlineEdited: Bool

    public init(
        kind: PartKind,
        photos: [MeasureAssemblyPhoto],
        reference: ScaleReference? = nil,
        autoScale: ScaleReference? = nil,
        outlineEdited: Bool = false
    ) {
        self.kind = kind
        self.photos = photos
        self.reference = reference
        self.autoScale = autoScale
        self.outlineEdited = outlineEdited
    }
}

public enum MeasureAssembly {
    /// Round parts are measured from the side still. A box takes width and height from the front
    /// and depth from the side, each with its own card when the reference is a card.
    public static func estimate(_ request: MeasureAssemblyRequest) -> MeasureResult {
        let primary = primaryPhoto(kind: request.kind, photos: request.photos)
        let primaryReference = reference(request.reference, for: primary)
        let primaryResult = estimateOne(
            kind: request.kind,
            photo: primary,
            side: nil,
            reference: primaryReference,
            autoScale: request.autoScale,
            outlineEdited: request.outlineEdited
        )
        guard request.kind == .box,
              let front = request.photos.first(where: { $0.angle == .front }),
              let side = request.photos.first(where: { $0.angle == .side }),
              front.silhouette != nil,
              side.silhouette != nil else {
            return primaryResult
        }
        let sideReference = boxSideReference(request.reference, front: front, side: side) ?? primaryReference
        let sideResult = estimateOne(
            kind: .box,
            photo: side,
            side: nil,
            reference: sideReference,
            autoScale: nil,
            outlineEdited: request.outlineEdited
        )
        guard sideResult.dimensions.widthMm > 0 else { return primaryResult }
        var combined = primaryResult
        combined.dimensions.depthMm = sideResult.dimensions.widthMm
        combined.measurements = primaryResult.measurements.map { item in
            guard item.key == "depthMm" else { return item }
            var copy = item
            copy.value = sideResult.dimensions.widthMm
            return copy
        }
        return combined
    }

    /// `mmPerPx = depth / fx` at the principal point. `ScaleRule` still rejects this for small parts.
    public static func lidarScale(depthMm: Double?, focalX: Double) -> ScaleReference? {
        guard let depthMm, depthMm.isFinite, depthMm > 1, focalX.isFinite, focalX > 1 else { return nil }
        return .auto(source: .lidar, mmPerPx: depthMm / focalX)
    }

    private static func estimateOne(
        kind: PartKind,
        photo: MeasureAssemblyPhoto?,
        side: MeasureAssemblyPhoto?,
        reference: ScaleReference?,
        autoScale: ScaleReference?,
        outlineEdited: Bool
    ) -> MeasureResult {
        let intrinsics = photo?.intrinsics ?? CameraIntrinsics(fx: 1, fy: 1, cx: 0, cy: 0)
        let frame = PixelSize(
            width: Double(photo?.pixelWidth ?? 0),
            height: Double(photo?.pixelHeight ?? 0)
        )
        return MeasureEstimator.estimate(MeasureRequest(
            kind: kind,
            intrinsics: intrinsics,
            frame: frame,
            reference: reference,
            autoScale: autoScale,
            front: photo?.silhouette,
            side: side?.silhouette,
            lidarDepthMm: photo?.lidarDepthMm,
            outlineEdited: outlineEdited,
            capturedAt: photo?.capturedAt ?? "2026-09-29T00:00:00Z",
            device: photo?.device
        ))
    }

    private static func primaryPhoto(kind: PartKind, photos: [MeasureAssemblyPhoto]) -> MeasureAssemblyPhoto? {
        switch kind {
        case .box, .label:
            return photos.first { $0.angle == .front } ?? photos.first
        case .bottle, .cap, .pump, .collar:
            return photos.first { $0.angle == .side } ?? photos.first
        }
    }

    /// Card taps stay on the photo they were marked on. A card reference uses that photo's corners.
    private static func reference(_ reference: ScaleReference?, for photo: MeasureAssemblyPhoto?) -> ScaleReference? {
        guard let reference else { return nil }
        guard case let .card(_, size) = reference else { return reference }
        guard let corners = photo?.cardCorners, corners.count == 4 else { return reference }
        return .card(corners: corners, size: size)
    }

    /// The side still has its own card quad. Reuse the chosen card size, not the front photo's pixels.
    private static func boxSideReference(
        _ reference: ScaleReference?,
        front: MeasureAssemblyPhoto,
        side: MeasureAssemblyPhoto
    ) -> ScaleReference? {
        guard let reference else { return nil }
        guard case let .card(_, size) = reference else { return nil }
        guard let corners = side.cardCorners, corners.count == 4 else { return nil }
        _ = front
        return .card(corners: corners, size: size)
    }
}
