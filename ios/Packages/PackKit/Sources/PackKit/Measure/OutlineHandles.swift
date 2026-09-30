import Foundation

/// One row band of a glass outline. `left` and `right` are inclusive pixel columns.
public struct OutlineBand: Equatable, Sendable {
    public var y: Double
    public var left: Double
    public var right: Double

    public init(y: Double, left: Double, right: Double) {
        self.y = y
        self.left = left
        self.right = right
    }
}

/// Drag handles for a weak (glass) outline, and the silhouette those handles describe.
public enum OutlineHandles {
    public static let minimumBands = 8

    public static func bands(from silhouette: Silhouette, count: Int = minimumBands) -> [OutlineBand] {
        let rows = silhouette.rows()
        guard let first = rows.first, let last = rows.last, last.y >= first.y else { return [] }
        let samples = max(minimumBands, count)
        if samples == 1 {
            return [OutlineBand(y: Double(first.y), left: Double(first.left), right: Double(first.right))]
        }
        var bands: [OutlineBand] = []
        bands.reserveCapacity(samples)
        for index in 0..<samples {
            let t = Double(index) / Double(samples - 1)
            let y = Double(first.y) + t * Double(last.y - first.y)
            let row = row(at: y, rows: rows)
            bands.append(OutlineBand(y: y, left: Double(row.left), right: Double(row.right)))
        }
        return bands
    }

    /// Fills every row between the first and last band by interpolating the handles.
    public static func silhouette(from bands: [OutlineBand], width: Int, height: Int) -> Silhouette {
        var pixels = [UInt8](repeating: 0, count: max(0, width * height))
        guard width > 0, height > 0, pixels.count == width * height else {
            return Silhouette(width: width, height: height, pixels: pixels)
        }
        let ordered = bands
            .filter { $0.y.isFinite && $0.left.isFinite && $0.right.isFinite }
            .sorted { $0.y < $1.y }
        guard let first = ordered.first, let last = ordered.last else {
            return Silhouette(width: width, height: height, pixels: pixels)
        }
        let y0 = max(0, Int(floor(first.y)))
        let y1 = min(height - 1, Int(ceil(last.y)))
        guard y0 <= y1 else { return Silhouette(width: width, height: height, pixels: pixels) }
        for y in y0...y1 {
            let edge = interpolate(bands: ordered, y: Double(y))
            var left = Int(floor(min(edge.left, edge.right)))
            var right = Int(ceil(max(edge.left, edge.right)))
            left = max(0, min(width - 1, left))
            right = max(0, min(width - 1, right))
            if right < left { continue }
            let start = y * width
            for x in left...right {
                pixels[start + x] = 255
            }
        }
        return Silhouette(width: width, height: height, pixels: pixels)
    }

    private static func row(
        at y: Double,
        rows: [(y: Int, left: Int, right: Int)]
    ) -> (y: Int, left: Int, right: Int) {
        var best = rows[0]
        var bestDistance = abs(Double(rows[0].y) - y)
        for row in rows {
            let distance = abs(Double(row.y) - y)
            if distance < bestDistance {
                best = row
                bestDistance = distance
            }
        }
        return best
    }

    private static func interpolate(bands: [OutlineBand], y: Double) -> (left: Double, right: Double) {
        if y <= bands[0].y { return (bands[0].left, bands[0].right) }
        if y >= bands[bands.count - 1].y { return (bands[bands.count - 1].left, bands[bands.count - 1].right) }
        for index in 1..<bands.count where y <= bands[index].y {
            let previous = bands[index - 1]
            let next = bands[index]
            let span = next.y - previous.y
            let t = span > 1e-6 ? (y - previous.y) / span : 0
            return (
                previous.left + (next.left - previous.left) * t,
                previous.right + (next.right - previous.right) * t
            )
        }
        return (bands[0].left, bands[0].right)
    }
}
