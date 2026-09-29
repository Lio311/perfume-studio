import CoreGraphics
import CoreVideo
import Foundation
import ImageIO
import Vision
import PackKit

public struct SubjectMaskOutput: Sendable {
    public var silhouette: Silhouette
    public var needsOutlineReview: Bool

    public init(silhouette: Silhouette, needsOutlineReview: Bool) {
        self.silhouette = silhouette
        self.needsOutlineReview = needsOutlineReview
    }
}

/// Foreground instance nearest the card, excluding the card itself.
/// A weak or glass mask falls back to an edge contour and sets `needsOutlineReview`.
public enum SubjectMasker {
    public static func mask(
        image: CGImage,
        card: [SIMD2<Double>]?,
        orientation: VisionImageOrientation = .backCameraPortrait
    ) -> SubjectMaskOutput? {
        let vision = visionMask(image: image, card: card, orientation: orientation)
        let edge = edgeMask(image: image, card: card)
        switch (vision, edge) {
        case let (vision?, edge?):
            if !vision.needsOutlineReview { return vision }
            if !edge.needsOutlineReview { return edge }
            return SubjectMaskOutput(silhouette: edge.silhouette, needsOutlineReview: true)
        case let (vision?, nil):
            return vision
        case let (nil, edge?):
            return edge
        case (nil, nil):
            return nil
        }
    }

    public static func luminance(image: CGImage) -> [UInt8]? {
        let width = image.width
        let height = image.height
        guard width > 0, height > 0 else { return nil }
        var pixels = [UInt8](repeating: 0, count: width * height)
        guard let context = CGContext(
            data: &pixels,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width,
            space: CGColorSpaceCreateDeviceGray(),
            bitmapInfo: CGImageAlphaInfo.none.rawValue
        ) else { return nil }
        context.translateBy(x: 0, y: CGFloat(height))
        context.scaleBy(x: 1, y: -1)
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return pixels
    }

    private static func edgeMask(image: CGImage, card: [SIMD2<Double>]?) -> SubjectMaskOutput? {
        guard let full = luminance(image: image) else { return nil }
        let working = EdgeContour.downsample(full, width: image.width, height: image.height, maxEdge: 960)
        let scaledCard = card?.map { corner in
            SIMD2(
                corner.x * Double(working.width) / Double(image.width),
                corner.y * Double(working.height) / Double(image.height)
            )
        }
        guard let outline = EdgeContour.extract(
            luminance: working.pixels,
            width: working.width,
            height: working.height,
            card: scaledCard
        ) else { return nil }
        if working.width == image.width, working.height == image.height {
            return SubjectMaskOutput(silhouette: outline.silhouette, needsOutlineReview: outline.needsOutlineReview)
        }
        let pixels = EdgeContour.upsample(
            mask: outline.silhouette.pixels,
            from: (working.width, working.height),
            to: image.width,
            height: image.height
        )
        let silhouette = Silhouette(width: image.width, height: image.height, pixels: pixels)
        return SubjectMaskOutput(
            silhouette: silhouette,
            needsOutlineReview: outline.needsOutlineReview || MaskQuality.needsOutlineReview(silhouette)
        )
    }

    private static func visionMask(
        image: CGImage,
        card: [SIMD2<Double>]?,
        orientation: VisionImageOrientation
    ) -> SubjectMaskOutput? {
        let request = VNGenerateForegroundInstanceMaskRequest()
        let handler = VNImageRequestHandler(cgImage: image, orientation: orientation.exif, options: [:])
        guard (try? handler.perform([request])) != nil, let observation = request.results?.first else { return nil }
        var best: (pixels: [UInt8], area: Int, distance: Double)?
        for instance in observation.allInstances {
            guard let buffer = try? observation.generateScaledMaskForImage(forInstances: IndexSet(integer: instance), from: handler),
                  let raster = rasterize(buffer, image: image, orientation: orientation) else { continue }
            let score = scoreInstance(raster.pixels, width: image.width, height: image.height, card: card)
            guard let score else { continue }
            if best == nil || score.distance < best!.distance || (score.distance == best!.distance && score.area > best!.area) {
                best = (raster.pixels, score.area, score.distance)
            }
        }
        guard let best else { return nil }
        let silhouette = Silhouette(width: image.width, height: image.height, pixels: best.pixels)
        guard silhouette.rows().count >= 2 else { return nil }
        return SubjectMaskOutput(silhouette: silhouette, needsOutlineReview: MaskQuality.needsOutlineReview(silhouette))
    }

    private static func scoreInstance(
        _ pixels: [UInt8],
        width: Int,
        height: Int,
        card: [SIMD2<Double>]?
    ) -> (area: Int, distance: Double)? {
        var area = 0
        var inside = 0
        var sumX = 0.0
        var sumY = 0.0
        for y in 0..<height {
            for x in 0..<width where pixels[y * width + x] != 0 {
                area += 1
                sumX += Double(x)
                sumY += Double(y)
                if let card, card.count == 4, pointInPolygon(SIMD2(Double(x) + 0.5, Double(y) + 0.5), card) {
                    inside += 1
                }
            }
        }
        guard area >= 80 else { return nil }
        if inside * 2 > area { return nil }
        let centroid = SIMD2(sumX / Double(area), sumY / Double(area))
        let anchor = card.flatMap { corners -> SIMD2<Double>? in
            guard corners.count == 4 else { return nil }
            return corners.reduce(SIMD2(0, 0), +) / 4
        }
        let distance: Double
        if let anchor {
            let dx = centroid.x - anchor.x
            let dy = centroid.y - anchor.y
            distance = dx * dx + dy * dy
        } else {
            distance = -Double(area)
        }
        return (area, distance)
    }

    private static func pointInPolygon(_ point: SIMD2<Double>, _ polygon: [SIMD2<Double>]) -> Bool {
        var inside = false
        var previous = polygon[polygon.count - 1]
        for corner in polygon {
            let intersects = (corner.y > point.y) != (previous.y > point.y)
            if intersects {
                let x = (previous.x - corner.x) * (point.y - corner.y) / (previous.y - corner.y) + corner.x
                if point.x < x { inside.toggle() }
            }
            previous = corner
        }
        return inside
    }

    private static func rasterize(
        _ buffer: CVPixelBuffer,
        image: CGImage,
        orientation: VisionImageOrientation
    ) -> (pixels: [UInt8], width: Int, height: Int)? {
        guard CVPixelBufferLockBaseAddress(buffer, .readOnly) == kCVReturnSuccess else { return nil }
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(buffer) else { return nil }
        let maskWidth = CVPixelBufferGetWidth(buffer)
        let maskHeight = CVPixelBufferGetHeight(buffer)
        let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
        guard CVPixelBufferGetPixelFormatType(buffer) == kCVPixelFormatType_OneComponent8,
              maskWidth > 1, maskHeight > 1, rowBytes > 0 else { return nil }
        var raw = [UInt8](repeating: 0, count: maskWidth * maskHeight)
        let pointer = base.assumingMemoryBound(to: UInt8.self)
        for y in 0..<maskHeight {
            for x in 0..<maskWidth {
                raw[y * maskWidth + x] = pointer[y * rowBytes + x] == 0 ? 0 : 255
            }
        }
        if maskWidth == image.width && maskHeight == image.height {
            return (raw, maskWidth, maskHeight)
        }
        guard maskWidth == image.height, maskHeight == image.width else { return nil }
        var mapped = [UInt8](repeating: 0, count: image.width * image.height)
        for y in 0..<maskHeight {
            for x in 0..<maskWidth where raw[y * maskWidth + x] != 0 {
                let bufferPoint = DisplayImageSpace.bufferPoint(
                    fromUpright: SIMD2(Double(x), Double(y)),
                    bufferWidth: Double(image.width),
                    bufferHeight: Double(image.height),
                    orientation: orientation
                )
                let bx = Int(bufferPoint.x.rounded())
                let by = Int(bufferPoint.y.rounded())
                guard bx >= 0, by >= 0, bx < image.width, by < image.height else { continue }
                mapped[by * image.width + bx] = 255
            }
        }
        return (mapped, image.width, image.height)
    }
}
