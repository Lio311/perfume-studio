import Foundation

/// One sRGB pixel. Colour extraction stays on these values so it can run under `swift test` on Linux.
public struct RGBPixel: Equatable, Sendable {
    public var r: UInt8
    public var g: UInt8
    public var b: UInt8

    public init(r: UInt8, g: UInt8, b: UInt8) {
        self.r = r
        self.g = g
        self.b = b
    }
}

/// Dominant subject colour. Highlights and very dark pixels are ignored, then a small k-means picks the largest cluster.
public enum DominantColor {
    /// Relative luminance below this is treated as a shadow, not the part.
    public static let minimumLuminance = 0.06
    /// Relative luminance above this is treated as a highlight.
    public static let maximumLuminance = 0.92

    public static func luminance(_ pixel: RGBPixel) -> Double {
        let r = Double(pixel.r) / 255
        let g = Double(pixel.g) / 255
        let b = Double(pixel.b) / 255
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    /// `mask[i] == true` keeps pixel `i`. A nil mask keeps every pixel, then highlights and shadows are dropped.
    /// Returns `#rrggbb`, or nil when nothing remains.
    public static func hex(pixels: [RGBPixel], mask: [Bool]? = nil) -> String? {
        var kept: [RGBPixel] = []
        kept.reserveCapacity(pixels.count)
        for (index, pixel) in pixels.enumerated() {
            if let mask {
                guard mask.indices.contains(index), mask[index] else { continue }
            }
            let y = luminance(pixel)
            guard y >= minimumLuminance, y <= maximumLuminance else { continue }
            kept.append(pixel)
        }
        guard let winner = dominant(kept) else { return nil }
        return String(format: "#%02x%02x%02x", winner.r, winner.g, winner.b)
    }

    private static func dominant(_ pixels: [RGBPixel]) -> RGBPixel? {
        guard !pixels.isEmpty else { return nil }
        if pixels.count == 1 { return pixels[0] }
        let k = min(3, pixels.count)
        var centers = seeds(pixels, k: k)
        var assignments = [Int](repeating: 0, count: pixels.count)
        for _ in 0..<8 {
            var changed = false
            for (index, pixel) in pixels.enumerated() {
                let next = nearest(pixel, centers: centers)
                if assignments[index] != next {
                    assignments[index] = next
                    changed = true
                }
            }
            var sums = Array(repeating: (r: 0.0, g: 0.0, b: 0.0, n: 0), count: k)
            for (index, pixel) in pixels.enumerated() {
                let bin = assignments[index]
                sums[bin].r += Double(pixel.r)
                sums[bin].g += Double(pixel.g)
                sums[bin].b += Double(pixel.b)
                sums[bin].n += 1
            }
            for index in 0..<k where sums[index].n > 0 {
                centers[index] = RGBPixel(
                    r: UInt8((sums[index].r / Double(sums[index].n)).rounded()),
                    g: UInt8((sums[index].g / Double(sums[index].n)).rounded()),
                    b: UInt8((sums[index].b / Double(sums[index].n)).rounded())
                )
            }
            if !changed { break }
        }
        var counts = Array(repeating: 0, count: k)
        for bin in assignments { counts[bin] += 1 }
        guard let winner = counts.enumerated().max(by: { lhs, rhs in
            if lhs.element == rhs.element { return lhs.offset > rhs.offset }
            return lhs.element < rhs.element
        }) else { return nil }
        return centers[winner.offset]
    }

    private static func seeds(_ pixels: [RGBPixel], k: Int) -> [RGBPixel] {
        var chosen: [RGBPixel] = []
        let slots = [0, pixels.count / 2, pixels.count - 1]
        for slot in slots where chosen.count < k {
            let pixel = pixels[slot]
            if !chosen.contains(pixel) { chosen.append(pixel) }
        }
        var index = 0
        while chosen.count < k {
            chosen.append(pixels[index % pixels.count])
            index += 1
        }
        return chosen
    }

    private static func nearest(_ pixel: RGBPixel, centers: [RGBPixel]) -> Int {
        var best = 0
        var bestDistance = Int.max
        for (index, center) in centers.enumerated() {
            let dr = Int(pixel.r) - Int(center.r)
            let dg = Int(pixel.g) - Int(center.g)
            let db = Int(pixel.b) - Int(center.b)
            let distance = dr * dr + dg * dg + db * db
            if distance < bestDistance {
                bestDistance = distance
                best = index
            }
        }
        return best
    }
}
