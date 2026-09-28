import Foundation

/// Median of the last five raw estimates, then an exponential moving average with α = 0.25.
/// Resets when the source changes or when more than 300 ms pass without a sample.
public struct DistanceFilter: Equatable {
    public static let window = 5
    public static let alpha = 0.25
    public static let resetGap: TimeInterval = 0.300

    public private(set) var value: Double?
    private var samples: [Double] = []
    private var lastTime: TimeInterval?
    private var lastSourceID: String?

    public init() {}

    public mutating func reset() {
        value = nil
        samples.removeAll()
        lastTime = nil
        lastSourceID = nil
    }

    public struct Result: Equatable {
        public var millimetres: Double
        /// True when this sample started a new window (source change or a gap over 300 ms).
        public var didReset: Bool
    }

    /// Ignores readings the source rejects, and non-finite timestamps, without touching state.
    public mutating func push(zMm: Double, time: TimeInterval, source: some DistanceSource) -> Result? {
        guard source.accepts(rawZMm: zMm), time.isFinite else { return nil }
        var didReset = false
        if let lastSourceID, lastSourceID != source.id {
            clearWindow()
            didReset = true
        } else if let lastTime, time - lastTime > Self.resetGap {
            clearWindow()
            didReset = true
        }
        samples.append(zMm)
        if samples.count > Self.window { samples.removeFirst(samples.count - Self.window) }
        let median = Self.median(samples)
        if let value {
            self.value = Self.alpha * median + (1 - Self.alpha) * value
        } else {
            self.value = median
        }
        lastTime = time
        lastSourceID = source.id
        return Result(millimetres: self.value ?? median, didReset: didReset)
    }

    private mutating func clearWindow() {
        value = nil
        samples.removeAll()
    }

    static func median(_ values: [Double]) -> Double {
        let sorted = values.sorted()
        let count = sorted.count
        if count == 0 { return 0 }
        if count % 2 == 1 { return sorted[count / 2] }
        return 0.5 * (sorted[count / 2 - 1] + sorted[count / 2])
    }
}
