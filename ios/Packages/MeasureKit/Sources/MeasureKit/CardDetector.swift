import CoreVideo
import Foundation
import ImageIO
import Vision
import PackKit

/// One rectangle in `capturedImage` pixels, plus Vision's confidence.
public struct CardDetection: Equatable, Sendable {
    public var corners: [SIMD2<Double>]
    public var confidence: Double

    public init(corners: [SIMD2<Double>], confidence: Double) {
        self.corners = corners
        self.confidence = confidence
    }
}

extension VisionImageOrientation {
    /// EXIF value passed to `VNImageRequestHandler`.
    var exif: CGImagePropertyOrientation {
        switch self {
        case .up: return .up
        case .upMirrored: return .upMirrored
        case .down: return .down
        case .downMirrored: return .downMirrored
        case .left: return .left
        case .leftMirrored: return .leftMirrored
        case .right: return .right
        case .rightMirrored: return .rightMirrored
        }
    }
}

/// Finds one reference card and returns its corners in `capturedImage` pixels
/// (origin at the top-left, Y downward): top-left, top-right, bottom-right, bottom-left.
/// The iPhone 16 test phone is portrait-only, so the default orientation is `.right`:
/// the sensor buffer is landscape and Vision must be told that. Corners are mapped
/// back into the buffer before anyone uses `ARCamera.intrinsics`.
public enum CardDetector {
    public static func detect(
        in pixelBuffer: CVPixelBuffer,
        orientation: VisionImageOrientation = .backCameraPortrait
    ) -> CardDetection? {
        let request = VNDetectRectanglesRequest()
        let tuning = CardDetectorTuning.id1
        // Vision's aspect ratio is shorter/longer and must stay in [0, 1].
        // 1.586 ± 0.1 becomes about 0.593...0.673.
        let minimum = min(1, max(0, tuning.visionMinimumAspectRatio))
        let maximum = min(1, max(minimum, tuning.visionMaximumAspectRatio))
        request.minimumAspectRatio = Float(minimum)
        request.maximumAspectRatio = Float(maximum)
        request.minimumSize = Float(tuning.minimumSize)
        request.maximumObservations = tuning.maximumObservations
        request.quadratureTolerance = Float(tuning.quadratureToleranceDegrees)

        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: orientation.exif, options: [:])
        guard (try? handler.perform([request])) != nil else { return nil }
        guard let observation = request.results?.first else { return nil }

        let width = Double(CVPixelBufferGetWidth(pixelBuffer))
        let height = Double(CVPixelBufferGetHeight(pixelBuffer))
        guard width > 1, height > 1 else { return nil }
        func pixel(_ point: CGPoint) -> SIMD2<Double> {
            CapturedImageSpace.pixel(
                fromVisionNormalized: SIMD2(Double(point.x), Double(point.y)),
                orientation: orientation,
                width: width,
                height: height
            )
        }
        let coarse = [
            pixel(observation.topLeft),
            pixel(observation.topRight),
            pixel(observation.bottomRight),
            pixel(observation.bottomLeft),
        ]
        let corners = refine(coarse, in: pixelBuffer) ?? coarse
        return CardDetection(corners: corners, confidence: Double(observation.confidence))
    }

    /// Sub-pixel edge fit on the luma plane. Falls back to the Vision corners when the fit is poor.
    private static func refine(_ coarse: [SIMD2<Double>], in pixelBuffer: CVPixelBuffer) -> [SIMD2<Double>]? {
        let format = CVPixelBufferGetPixelFormatType(pixelBuffer)
        guard format == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
                || format == kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange else { return nil }
        guard CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly) == kCVReturnSuccess else { return nil }
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0) else { return nil }
        let width = CVPixelBufferGetWidthOfPlane(pixelBuffer, 0)
        let height = CVPixelBufferGetHeightOfPlane(pixelBuffer, 0)
        let bytesPerRow = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
        guard width > 2, height > 2, bytesPerRow > 0 else { return nil }

        func luma(_ x: Int, _ y: Int) -> Double? {
            guard x >= 0, y >= 0, x < width, y < height else { return nil }
            return Double(base.advanced(by: y * bytesPerRow + x).assumingMemoryBound(to: UInt8.self).pointee)
        }

        let pairs = [(0, 1), (1, 2), (2, 3), (3, 0)]
        let edges = pairs.map { sampleEdge(from: coarse[$0.0], to: coarse[$0.1], luma: luma) }
        guard let refined = CornerRefiner.corners(edges: edges), refined.count == coarse.count else { return nil }
        return zip(refined, coarse).map { corner, original in
            let dx = corner.x - original.x
            let dy = corner.y - original.y
            return (dx * dx + dy * dy).squareRoot() <= 12 ? corner : original
        }
    }

    private static func sampleEdge(
        from start: SIMD2<Double>,
        to end: SIMD2<Double>,
        luma: (Int, Int) -> Double?
    ) -> [SIMD2<Double>] {
        let delta = end - start
        let edgeLength = (delta.x * delta.x + delta.y * delta.y).squareRoot()
        guard edgeLength > 8 else { return [] }
        let tangent = delta / edgeLength
        let normal = SIMD2(-tangent.y, tangent.x)
        var points: [SIMD2<Double>] = []
        for step in [0.2, 0.35, 0.5, 0.65, 0.8] {
            let origin = start + delta * step
            var bestOffset = 0
            var bestScore = 0.0
            var scores: [Int: Double] = [:]
            for offset in -10...10 {
                let ahead = origin + normal * Double(offset + 1)
                let behind = origin + normal * Double(offset - 1)
                guard let left = luma(Int(behind.x.rounded()), Int(behind.y.rounded())),
                      let right = luma(Int(ahead.x.rounded()), Int(ahead.y.rounded())) else { continue }
                let score = abs(right - left)
                scores[offset] = score
                if score > bestScore {
                    bestScore = score
                    bestOffset = offset
                }
            }
            guard bestScore > 8, let centre = scores[bestOffset] else { continue }
            let before = scores[bestOffset - 1] ?? centre
            let after = scores[bestOffset + 1] ?? centre
            let denominator = before - 2 * centre + after
            let shift = abs(denominator) > 1e-6 ? 0.5 * (before - after) / denominator : 0
            let clamped = min(1, max(-1, shift))
            points.append(origin + normal * Double(bestOffset) + normal * clamped)
        }
        return points
    }
}
