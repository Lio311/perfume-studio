import Foundation

/// How `ARFrame.capturedImage` is rotated relative to the portrait UI.
/// Values match `CGImagePropertyOrientation` so MeasureKit can pass them to Vision.
/// The iPhone 16 test phone is portrait-only and has no LiDAR. Its back wide camera
/// delivers a landscape sensor buffer, so Vision's orientation is `.right`.
public enum VisionImageOrientation: String, Equatable, Sendable, Codable {
    case up
    case upMirrored
    case down
    case downMirrored
    case left
    case leftMirrored
    case right
    case rightMirrored

    /// Portrait interface, back wide camera. This is the iPhone 16 (standard) setup.
    /// Do not switch to `.up` when the device reports `.faceUp`: the interface is still portrait.
    public static let backCameraPortrait = VisionImageOrientation.right
}

/// Converts Vision's normalized points into `capturedImage` pixels.
/// Vision's origin is the lower-left of the *oriented* image. `ARCamera.intrinsics`
/// are in the sensor buffer: origin top-left, x right, y down, at `capturedImage` resolution.
/// The result is those pixels — not normalized, not left in the rotated image, y not flipped again.
public enum CapturedImageSpace {
    public static func pixel(
        fromVisionNormalized point: SIMD2<Double>,
        orientation: VisionImageOrientation,
        width: Double,
        height: Double
    ) -> SIMD2<Double> {
        let x = point.x
        let y = point.y
        switch orientation {
        case .up:
            return SIMD2(x * width, (1 - y) * height)
        case .down:
            return SIMD2((1 - x) * width, y * height)
        case .left:
            return SIMD2(y * width, x * height)
        case .right:
            return SIMD2((1 - y) * width, (1 - x) * height)
        case .upMirrored:
            return SIMD2((1 - x) * width, (1 - y) * height)
        case .downMirrored:
            return SIMD2(x * width, y * height)
        case .leftMirrored:
            return SIMD2(y * width, (1 - x) * height)
        case .rightMirrored:
            return SIMD2((1 - y) * width, x * height)
        }
    }

    public static func visionNormalized(
        fromPixel point: SIMD2<Double>,
        orientation: VisionImageOrientation,
        width: Double,
        height: Double
    ) -> SIMD2<Double> {
        let x = width > 0 ? point.x / width : 0
        let y = height > 0 ? point.y / height : 0
        switch orientation {
        case .up:
            return SIMD2(x, 1 - y)
        case .down:
            return SIMD2(1 - x, y)
        case .left:
            return SIMD2(y, x)
        case .right:
            return SIMD2(1 - y, 1 - x)
        case .upMirrored:
            return SIMD2(1 - x, 1 - y)
        case .downMirrored:
            return SIMD2(x, y)
        case .leftMirrored:
            return SIMD2(1 - y, x)
        case .rightMirrored:
            return SIMD2(y, 1 - x)
        }
    }
}
