import Foundation

/// A camera video format reduced to the numbers the picker needs.
public struct CameraVideoFormat: Equatable, Sendable {
    public var width: Int
    public var height: Int
    public var framesPerSecond: Int
    public var isWide: Bool

    public init(width: Int, height: Int, framesPerSecond: Int, isWide: Bool) {
        self.width = width
        self.height = height
        self.framesPerSecond = framesPerSecond
        self.isWide = isWide
    }
}

/// Prefers a 1920×1440 wide-camera format, otherwise the nearest 4:3 format
/// no wider than 1920, at 30 fps or faster. Never prefers the ultra-wide camera
/// when a wide format exists. Falls back to the largest fast wide format so
/// capture can still start.
public enum WideVideoFormatPicker {
    public static func pick(_ formats: [CameraVideoFormat]) -> CameraVideoFormat? {
        let wide = formats.filter(\.isWide)
        let pool = wide.isEmpty ? formats : wide
        guard !pool.isEmpty else { return nil }
        let fast = pool.filter { $0.framesPerSecond >= 30 }
        let timed = fast.isEmpty ? pool : fast
        let preferred = timed.filter { $0.width <= 1920 && isFourByThree($0) }
        if let best = nearestTo1920x1440(preferred) { return best }
        return largest(timed)
    }

    static func isFourByThree(_ format: CameraVideoFormat) -> Bool {
        guard format.width > 0, format.height > 0 else { return false }
        let long = Double(max(format.width, format.height))
        let short = Double(min(format.width, format.height))
        return abs(long / short - 4.0 / 3.0) < 0.02
    }

    private static func nearestTo1920x1440(_ formats: [CameraVideoFormat]) -> CameraVideoFormat? {
        formats.min { lhs, rhs in
            let left = squaredDistance(lhs)
            let right = squaredDistance(rhs)
            if left != right { return left < right }
            if lhs.framesPerSecond != rhs.framesPerSecond { return lhs.framesPerSecond > rhs.framesPerSecond }
            return lhs.width > rhs.width
        }
    }

    private static func squaredDistance(_ format: CameraVideoFormat) -> Int {
        let width = format.width - 1920
        let height = format.height - 1440
        return width * width + height * height
    }

    private static func largest(_ formats: [CameraVideoFormat]) -> CameraVideoFormat? {
        formats.max { lhs, rhs in
            let left = lhs.width * lhs.height
            let right = rhs.width * rhs.height
            if left != right { return left < right }
            return lhs.framesPerSecond < rhs.framesPerSecond
        }
    }
}
