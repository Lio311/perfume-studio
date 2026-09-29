import Foundation

public struct SubjectOutline: Equatable, Sendable {
    public var silhouette: Silhouette
    public var needsOutlineReview: Bool

    public init(silhouette: Silhouette, needsOutlineReview: Bool) {
        self.silhouette = silhouette
        self.needsOutlineReview = needsOutlineReview
    }
}

/// Whether a mask is too hollow or too small to trust without a glass-outline edit.
public enum MaskQuality {
    public static func needsOutlineReview(_ silhouette: Silhouette) -> Bool {
        guard silhouette.isValid else { return true }
        let rows = silhouette.rows()
        guard rows.count >= 8, let first = rows.first, let last = rows.last else { return true }
        let pixels = silhouette.pixels.reduce(0) { $0 + ($1 == 0 ? 0 : 1) }
        guard pixels > 40 else { return true }
        let minX = rows.map(\.left).min() ?? 0
        let maxX = rows.map(\.right).max() ?? 0
        let bbox = Double(maxX - minX + 1) * Double(last.y - first.y + 1)
        guard bbox > 0 else { return true }
        return Double(pixels) / bbox < 0.45
    }
}

/// Edge fallback when Vision's instance mask is missing or only catches a glass rim.
/// Luminance is 0...255, row-major, origin top-left. The card quad is excluded.
public enum EdgeContour {
    public static func extract(
        luminance: [UInt8],
        width: Int,
        height: Int,
        card: [SIMD2<Double>]? = nil,
        threshold: UInt8 = 40,
        cardPadding: Double = 3
    ) -> SubjectOutline? {
        guard width > 2, height > 2, luminance.count == width * height else { return nil }
        let excluded = exclusion(card: card, padding: cardPadding, width: width, height: height)
        var mask = [UInt8](repeating: 0, count: width * height)
        for index in luminance.indices where luminance[index] >= threshold && !excluded[index] {
            mask[index] = 255
        }
        guard let component = nearestComponent(mask: mask, width: width, height: height, card: card, excluded: excluded) else {
            return nil
        }
        let silhouette = Silhouette(width: width, height: height, pixels: component)
        guard silhouette.rows().count >= 2 else { return nil }
        return SubjectOutline(silhouette: silhouette, needsOutlineReview: MaskQuality.needsOutlineReview(silhouette))
    }

    /// Nearest-neighbour downsample used before a contour on a full-resolution still.
    public static func downsample(
        _ pixels: [UInt8],
        width: Int,
        height: Int,
        maxEdge: Int
    ) -> (pixels: [UInt8], width: Int, height: Int) {
        guard width > 0, height > 0, pixels.count == width * height, maxEdge > 1 else {
            return (pixels, width, height)
        }
        let longest = max(width, height)
        guard longest > maxEdge else { return (pixels, width, height) }
        let scale = Double(maxEdge) / Double(longest)
        let dstWidth = max(2, Int((Double(width) * scale).rounded()))
        let dstHeight = max(2, Int((Double(height) * scale).rounded()))
        var output = [UInt8](repeating: 0, count: dstWidth * dstHeight)
        for y in 0..<dstHeight {
            let sourceY = min(height - 1, Int(Double(y) / Double(dstHeight) * Double(height)))
            for x in 0..<dstWidth {
                let sourceX = min(width - 1, Int(Double(x) / Double(dstWidth) * Double(width)))
                output[y * dstWidth + x] = pixels[sourceY * width + sourceX]
            }
        }
        return (output, dstWidth, dstHeight)
    }

    /// Scales a working-resolution mask back to saved-image pixels.
    public static func upsample(mask: [UInt8], from source: (width: Int, height: Int), to width: Int, height: Int) -> [UInt8] {
        guard source.width > 0, source.height > 0, mask.count == source.width * source.height, width > 0, height > 0 else {
            return [UInt8](repeating: 0, count: max(0, width * height))
        }
        if source.width == width && source.height == height { return mask }
        var output = [UInt8](repeating: 0, count: width * height)
        for y in 0..<height {
            let sourceY = min(source.height - 1, y * source.height / height)
            for x in 0..<width {
                let sourceX = min(source.width - 1, x * source.width / width)
                output[y * width + x] = mask[sourceY * source.width + sourceX]
            }
        }
        return output
    }

    private static func exclusion(card: [SIMD2<Double>]?, padding: Double, width: Int, height: Int) -> [Bool] {
        var excluded = [Bool](repeating: false, count: width * height)
        guard var corners = card, corners.count == 4 else { return excluded }
        corners = expand(corners, by: padding)
        let minY = max(0, Int(floor(corners.map(\.y).min() ?? 0)))
        let maxY = min(height - 1, Int(ceil(corners.map(\.y).max() ?? 0)))
        let minX = max(0, Int(floor(corners.map(\.x).min() ?? 0)))
        let maxX = min(width - 1, Int(ceil(corners.map(\.x).max() ?? 0)))
        guard minY <= maxY, minX <= maxX else { return excluded }
        for y in minY...maxY {
            for x in minX...maxX where contains(SIMD2(Double(x) + 0.5, Double(y) + 0.5), polygon: corners) {
                excluded[y * width + x] = true
            }
        }
        return excluded
    }

    private static func expand(_ corners: [SIMD2<Double>], by pixels: Double) -> [SIMD2<Double>] {
        guard pixels > 0, corners.count == 4 else { return corners }
        let centre = corners.reduce(SIMD2(0, 0), +) / 4
        return corners.map { corner in
            let delta = corner - centre
            let length = (delta.x * delta.x + delta.y * delta.y).squareRoot()
            guard length > 1e-6 else { return corner }
            return corner + delta / length * pixels
        }
    }

    private static func contains(_ point: SIMD2<Double>, polygon: [SIMD2<Double>]) -> Bool {
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

    private static func nearestComponent(
        mask: [UInt8],
        width: Int,
        height: Int,
        card: [SIMD2<Double>]?,
        excluded: [Bool]
    ) -> [UInt8]? {
        var seen = [Bool](repeating: false, count: width * height)
        var best: [Int] = []
        var bestScore = Double.greatestFiniteMagnitude
        var bestArea = 0
        let anchor = cardCentroid(card)
        var stack: [Int] = []
        for start in mask.indices where mask[start] != 0 && !seen[start] {
            stack.removeAll(keepingCapacity: true)
            stack.append(start)
            seen[start] = true
            var indexes: [Int] = []
            var sumX = 0.0
            var sumY = 0.0
            while let index = stack.popLast() {
                indexes.append(index)
                let x = index % width
                let y = index / width
                sumX += Double(x)
                sumY += Double(y)
                for next in neighbours(x: x, y: y, width: width, height: height) where mask[next] != 0 && !seen[next] {
                    seen[next] = true
                    stack.append(next)
                }
            }
            guard indexes.count >= 30 else { continue }
            if touchesCard(indexes, excluded: excluded, width: width, height: height) { continue }
            let centroid = SIMD2(sumX / Double(indexes.count), sumY / Double(indexes.count))
            if let card, card.count == 4, contains(centroid, polygon: card) { continue }
            let score: Double
            if let anchor {
                let dx = centroid.x - anchor.x
                let dy = centroid.y - anchor.y
                score = dx * dx + dy * dy
            } else {
                score = -Double(indexes.count)
            }
            if score < bestScore || (abs(score - bestScore) < 1e-6 && indexes.count > bestArea) {
                bestScore = score
                bestArea = indexes.count
                best = indexes
            }
        }
        guard !best.isEmpty else { return nil }
        var output = [UInt8](repeating: 0, count: width * height)
        for index in best { output[index] = 255 }
        return output
    }

    /// A card fringe shares an edge with the excluded quad. The part is placed beside the card, not on it.
    private static func touchesCard(_ indexes: [Int], excluded: [Bool], width: Int, height: Int) -> Bool {
        guard excluded.contains(true) else { return false }
        for index in indexes {
            let x = index % width
            let y = index / width
            if x > 0, excluded[index - 1] { return true }
            if x + 1 < width, excluded[index + 1] { return true }
            if y > 0, excluded[index - width] { return true }
            if y + 1 < height, excluded[index + width] { return true }
        }
        return false
    }

    private static func neighbours(x: Int, y: Int, width: Int, height: Int) -> [Int] {
        var found: [Int] = []
        if x > 0 { found.append(y * width + x - 1) }
        if x + 1 < width { found.append(y * width + x + 1) }
        if y > 0 { found.append((y - 1) * width + x) }
        if y + 1 < height { found.append((y + 1) * width + x) }
        return found
    }

    private static func cardCentroid(_ card: [SIMD2<Double>]?) -> SIMD2<Double>? {
        guard let card, card.count == 4 else { return nil }
        return card.reduce(SIMD2(0, 0), +) / 4
    }
}
