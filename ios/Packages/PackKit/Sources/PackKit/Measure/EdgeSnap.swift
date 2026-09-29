import Foundation

/// Snaps a tap to the strongest nearby edge in a luminance image (0...255, row-major, top-left origin).
public enum EdgeSnap {
    /// `radius` is the search window in luminance pixels. A flat neighbourhood returns `point`.
    public static func snap(
        point: SIMD2<Double>,
        luminance: [UInt8],
        width: Int,
        height: Int,
        radius: Int = 6,
        minimumGradient: Double = 12
    ) -> SIMD2<Double> {
        guard width > 2, height > 2, luminance.count == width * height, radius > 0,
              point.x.isFinite, point.y.isFinite else { return point }
        let originX = Int(point.x.rounded())
        let originY = Int(point.y.rounded())
        var bestScore = minimumGradient
        var best = point
        var bestDistance = Double.greatestFiniteMagnitude
        let x0 = max(1, originX - radius)
        let x1 = min(width - 2, originX + radius)
        let y0 = max(1, originY - radius)
        let y1 = min(height - 2, originY + radius)
        guard x0 <= x1, y0 <= y1 else { return point }
        for y in y0...y1 {
            for x in x0...x1 {
                let gx = Double(luminance[y * width + (x + 1)]) - Double(luminance[y * width + (x - 1)])
                let gy = Double(luminance[(y + 1) * width + x]) - Double(luminance[(y - 1) * width + x])
                let score = (gx * gx + gy * gy).squareRoot()
                let dx = Double(x) - point.x
                let dy = Double(y) - point.y
                let distance = dx * dx + dy * dy
                if score > bestScore + 1e-6 || (abs(score - bestScore) <= 1e-6 && distance < bestDistance) {
                    bestScore = score
                    bestDistance = distance
                    best = SIMD2(Double(x), Double(y))
                }
            }
        }
        return best
    }
}
