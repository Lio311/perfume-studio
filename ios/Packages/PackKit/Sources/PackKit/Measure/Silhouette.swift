import Foundation

/// Binary mask in image pixels, row-major. A non-zero byte is part of the part.
public struct Silhouette: Equatable, Sendable {
    public var width: Int
    public var height: Int
    public var pixels: [UInt8]

    public init(width: Int, height: Int, pixels: [UInt8]) {
        self.width = width
        self.height = height
        self.pixels = pixels
    }

    public var isValid: Bool {
        width > 0 && height > 0 && pixels.count == width * height
    }

    public func contains(x: Int, y: Int) -> Bool {
        guard isValid, x >= 0, y >= 0, x < width, y < height else { return false }
        return pixels[y * width + x] != 0
    }

    /// Foreground runs, top to bottom. `left` and `right` are inclusive pixel columns.
    public func rows() -> [(y: Int, left: Int, right: Int)] {
        guard isValid else { return [] }
        var found: [(y: Int, left: Int, right: Int)] = []
        found.reserveCapacity(height)
        for y in 0..<height {
            let start = y * width
            var left = -1
            var right = -1
            for x in 0..<width where pixels[start + x] != 0 {
                if left < 0 { left = x }
                right = x
            }
            if left >= 0 { found.append((y, left, right)) }
        }
        return found
    }
}
