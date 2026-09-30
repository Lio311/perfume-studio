import CoreGraphics
import Foundation
import ImageIO
import MeasureKit
import PackKit

/// Dominant colour inside the subject mask. The average itself is `DominantColor` (Linux-tested).
enum SideColorSampler {
    static func dominantHex(jpeg: Data, corners: [ImagePoint]?) -> String? {
        guard let source = CGImageSourceCreateWithData(jpeg as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { return nil }
        let card = corners?.map { SIMD2($0.x, $0.y) }
        let silhouette = SubjectMasker.mask(image: image, card: card)?.silhouette
        return dominantHex(image: image, silhouette: silhouette)
    }

    static func dominantHex(image: CGImage, silhouette: Silhouette?) -> String? {
        let maxEdge = 64
        let scale = min(1, Double(maxEdge) / Double(max(image.width, image.height)))
        let width = max(1, Int((Double(image.width) * scale).rounded()))
        let height = max(1, Int((Double(image.height) * scale).rounded()))
        var rgba = [UInt8](repeating: 0, count: width * height * 4)
        guard let context = CGContext(
            data: &rgba,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        context.translateBy(x: 0, y: CGFloat(height))
        context.scaleBy(x: 1, y: -1)
        context.interpolationQuality = .medium
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

        var pixels: [RGBPixel] = []
        var mask: [Bool] = []
        pixels.reserveCapacity(width * height)
        mask.reserveCapacity(width * height)
        for y in 0..<height {
            for x in 0..<width {
                let offset = (y * width + x) * 4
                pixels.append(RGBPixel(r: rgba[offset], g: rgba[offset + 1], b: rgba[offset + 2]))
                if let silhouette, silhouette.isValid {
                    let sx = min(silhouette.width - 1, max(0, Int(Double(x) / Double(width) * Double(silhouette.width))))
                    let sy = min(silhouette.height - 1, max(0, Int(Double(y) / Double(height) * Double(silhouette.height))))
                    mask.append(silhouette.contains(x: sx, y: sy))
                } else {
                    mask.append(true)
                }
            }
        }
        return DominantColor.hex(pixels: pixels, mask: mask)
    }
}
