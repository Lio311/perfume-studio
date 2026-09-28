import Foundation

/// A depth provider. The filter, guide, and gate depend only on this protocol,
/// so a later milestone can add another source (for example an object-capture depth)
/// without changing them. Identity is `id`: a change of id resets the filter.
/// Defaults refuse auto-capture and accept any positive finite depth.
public protocol DistanceSource: Sendable {
    var id: String { get }
    var isApproximate: Bool { get }
    var allowsAutoCapture: Bool { get }
    /// `rawZMm` is the raw (pre-calibration) depth.
    func accepts(rawZMm: Double) -> Bool
}

extension DistanceSource {
    public var isApproximate: Bool { false }
    public var allowsAutoCapture: Bool { false }

    public func accepts(rawZMm: Double) -> Bool {
        rawZMm.isFinite && rawZMm > 0
    }
}

/// Camera depths used by the M1 guide.
/// The card is the only one that may auto-capture.
/// LiDAR is optional and only valid at or beyond 300 mm. VIO is approximate.
public enum CameraDistance: String, DistanceSource, Equatable, Sendable, Codable {
    case card
    case lidar
    case vio

    /// LiDAR readings closer than this are ignored. The sensor is not reliable there.
    public static let lidarMinimumMm: Double = 300

    public var id: String { rawValue }

    public var isApproximate: Bool { self == .vio }

    public var allowsAutoCapture: Bool { self == .card }

    public func accepts(rawZMm: Double) -> Bool {
        guard rawZMm.isFinite, rawZMm > 0 else { return false }
        if self == .lidar, rawZMm < Self.lidarMinimumMm { return false }
        return true
    }
}

/// Equatable snapshot of a `DistanceSource`, safe to publish and compare.
public struct DistanceSourceInfo: Equatable, Sendable {
    public var id: String
    public var isApproximate: Bool
    public var allowsAutoCapture: Bool

    public init(id: String, isApproximate: Bool, allowsAutoCapture: Bool) {
        self.id = id
        self.isApproximate = isApproximate
        self.allowsAutoCapture = allowsAutoCapture
    }

    public init(_ source: some DistanceSource) {
        self.init(id: source.id, isApproximate: source.isApproximate, allowsAutoCapture: source.allowsAutoCapture)
    }

    public var label: String {
        switch id {
        case CameraDistance.card.id: return "כרטיס"
        case CameraDistance.lidar.id: return "LiDAR"
        case CameraDistance.vio.id: return "VIO"
        default: return id
        }
    }
}

/// Bias, scale, and an uncertainty that later milestones fill in.
/// Applied as `calibrated = raw * scale + biasMm`. Identity leaves raw Z unchanged.
public struct DistanceCalibration: Equatable, Sendable {
    public var biasMm: Double
    public var scale: Double
    /// One-standard-deviation uncertainty of the calibrated depth, millimetres.
    public var sigmaMm: Double

    public init(biasMm: Double, scale: Double, sigmaMm: Double) {
        self.biasMm = biasMm
        self.scale = scale
        self.sigmaMm = sigmaMm
    }

    public static let identity = DistanceCalibration(biasMm: 0, scale: 1, sigmaMm: 0)

    public func apply(to rawZMm: Double) -> Double {
        rawZMm * scale + biasMm
    }
}

/// Pinhole intrinsics, pixels. X right, Y down, principal point `(cx, cy)`.
public struct CameraIntrinsics: Equatable, Sendable {
    public var fx: Double
    public var fy: Double
    public var cx: Double
    public var cy: Double

    public init(fx: Double, fy: Double, cx: Double, cy: Double) {
        self.fx = fx
        self.fy = fy
        self.cx = cx
        self.cy = cy
    }

    public var isFinite: Bool {
        fx.isFinite && fy.isFinite && cx.isFinite && cy.isFinite && fx > 0 && fy > 0
    }

    /// Scale when a detector runs on a buffer whose pixel size is not `capturedImage`.
    public func scaled(from source: PixelSize, to destination: PixelSize) -> CameraIntrinsics {
        guard source.width > 0, source.height > 0, destination.width > 0, destination.height > 0 else { return self }
        let sx = destination.width / source.width
        let sy = destination.height / source.height
        return CameraIntrinsics(fx: fx * sx, fy: fy * sy, cx: cx * sx, cy: cy * sy)
    }
}

public struct PixelSize: Equatable, Sendable {
    public var width: Double
    public var height: Double

    public init(width: Double, height: Double) {
        self.width = width
        self.height = height
    }
}

/// Physical size of the reference rectangle. ID-1 is the default (ISO/IEC 7810).
public struct CardReference: Equatable, Sendable {
    public var widthMm: Double
    public var heightMm: Double

    public init(widthMm: Double, heightMm: Double) {
        self.widthMm = widthMm
        self.heightMm = heightMm
    }

    /// ISO/IEC 7810 ID-1 (credit-card size), 85.60 × 53.98 mm.
    public static let id1 = CardReference(widthMm: 85.60, heightMm: 53.98)

    public var isFinite: Bool { widthMm.isFinite && heightMm.isFinite && widthMm > 0 && heightMm > 0 }
}

/// Strings the distance UI shows. Kept here so device code and tests share one spelling.
public enum DistanceText {
    public static let closer = "קרב"
    public static let farther = "הרחק"
    public static let approximateAccuracy = "דיוק המרחק משוער"
    public static let cameraDeviceOnly = "המצלמה זמינה רק במכשיר"
    public static let lidarUnavailable = "LiDAR: לא זמין במכשיר זה"
    public static let lidarAvailable = "LiDAR: זמין"
    public static let centimeters = "ס״מ"
}

/// Population standard deviation of depth samples in a trailing one-second window.
public struct DistanceSpread {
    private var samples: [(time: TimeInterval, zMm: Double)] = []

    public init() {}

    public mutating func reset() { samples.removeAll() }

    /// Returns σ in millimetres. Zero until two samples sit inside the window.
    public mutating func push(_ zMm: Double, time: TimeInterval) -> Double {
        samples.append((time, zMm))
        samples.removeAll { time - $0.time > 1 }
        guard samples.count >= 2 else { return 0 }
        let n = Double(samples.count)
        let mean = samples.reduce(0.0) { $0 + $1.zMm } / n
        let variance = samples.reduce(0.0) { $0 + ($1.zMm - mean) * ($1.zMm - mean) } / n
        return variance.squareRoot()
    }
}

/// Frames per second from timestamps falling inside the trailing one-second window.
public struct FrameRateMeter {
    private var times: [TimeInterval] = []

    public init() {}

    public mutating func reset() { times.removeAll() }

    public mutating func push(time: TimeInterval) -> Double {
        times.append(time)
        times.removeAll { time - $0 > 1 }
        guard let first = times.first, let last = times.last, times.count >= 2, last > first else { return 0 }
        return Double(times.count - 1) / (last - first)
    }
}
