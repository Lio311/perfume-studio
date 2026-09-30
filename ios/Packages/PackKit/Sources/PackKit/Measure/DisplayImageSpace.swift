import Foundation

/// Upright on-screen pixels (origin top-left, Y down) for a buffer stored with a
/// Vision/EXIF orientation. The app stores portrait back-camera JPEGs as `.right`.
public enum DisplayImageSpace {
    public static func orientedSize(
        bufferWidth: Double,
        bufferHeight: Double,
        orientation: VisionImageOrientation
    ) -> PixelSize {
        switch orientation {
        case .left, .leftMirrored, .right, .rightMirrored:
            return PixelSize(width: bufferHeight, height: bufferWidth)
        case .up, .upMirrored, .down, .downMirrored:
            return PixelSize(width: bufferWidth, height: bufferHeight)
        }
    }

    /// `point` is an upright pixel. The result is a `capturedImage` pixel.
    public static func bufferPoint(
        fromUpright point: SIMD2<Double>,
        bufferWidth: Double,
        bufferHeight: Double,
        orientation: VisionImageOrientation
    ) -> SIMD2<Double> {
        let oriented = orientedSize(bufferWidth: bufferWidth, bufferHeight: bufferHeight, orientation: orientation)
        let vx = oriented.width > 0 ? point.x / oriented.width : 0
        let vy = oriented.height > 0 ? 1 - point.y / oriented.height : 0
        return CapturedImageSpace.pixel(
            fromVisionNormalized: SIMD2(vx, vy),
            orientation: orientation,
            width: bufferWidth,
            height: bufferHeight
        )
    }

    public static func uprightPoint(
        fromBuffer point: SIMD2<Double>,
        bufferWidth: Double,
        bufferHeight: Double,
        orientation: VisionImageOrientation
    ) -> SIMD2<Double> {
        let oriented = orientedSize(bufferWidth: bufferWidth, bufferHeight: bufferHeight, orientation: orientation)
        let vision = CapturedImageSpace.visionNormalized(
            fromPixel: point,
            orientation: orientation,
            width: bufferWidth,
            height: bufferHeight
        )
        return SIMD2(vision.x * oriented.width, (1 - vision.y) * oriented.height)
    }
}
