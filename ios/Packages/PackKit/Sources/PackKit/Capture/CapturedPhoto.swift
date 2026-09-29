import Foundation

/// Where the distance number stored with a photo came from.
public enum CaptureDistanceSource: String, Codable, Equatable, Sendable {
    case card, lidar, vio, none
}

/// A point in saved-image pixels. Origin is the top-left, Y grows downward.
public struct ImagePoint: Equatable, Codable, Sendable {
    public var x: Double
    public var y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }

    public init(_ point: SIMD2<Double>) {
        self.init(x: point.x, y: point.y)
    }
}

/// Metadata stored next to one JPEG. The bitmap, the intrinsics, and `cardCorners`
/// share one pixel grid: the captured frame at full resolution (origin top-left, Y down).
/// The file's EXIF orientation is `.right`, so a portrait viewer shows it upright
/// without changing those pixels.
public struct CapturedPhoto: Equatable, Codable, Sendable {
    public var id: UUID
    public var angle: CaptureAngle
    public var fileName: String
    public var pixelWidth: Int
    public var pixelHeight: Int
    public var capturedAt: Date
    public var intrinsics: CameraIntrinsics
    public var distanceMm: Double?
    public var distanceSource: CaptureDistanceSource
    public var sigmaMm: Double?
    public var guideState: DistanceGuide.State?
    public var cardCorners: [ImagePoint]?
    public var tiltDegrees: Double?
    public var deviceModel: String
    public var hasLiDAR: Bool

    public init(
        id: UUID = UUID(),
        angle: CaptureAngle,
        fileName: String,
        pixelWidth: Int,
        pixelHeight: Int,
        capturedAt: Date,
        intrinsics: CameraIntrinsics,
        distanceMm: Double?,
        distanceSource: CaptureDistanceSource,
        sigmaMm: Double?,
        guideState: DistanceGuide.State?,
        cardCorners: [ImagePoint]?,
        tiltDegrees: Double?,
        deviceModel: String,
        hasLiDAR: Bool
    ) {
        self.id = id
        self.angle = angle
        self.fileName = fileName
        self.pixelWidth = pixelWidth
        self.pixelHeight = pixelHeight
        self.capturedAt = capturedAt
        self.intrinsics = intrinsics
        self.distanceMm = distanceMm
        self.distanceSource = distanceSource
        self.sigmaMm = sigmaMm
        self.guideState = guideState
        self.cardCorners = cardCorners
        self.tiltDegrees = tiltDegrees
        self.deviceModel = deviceModel
        self.hasLiDAR = hasLiDAR
    }
}
