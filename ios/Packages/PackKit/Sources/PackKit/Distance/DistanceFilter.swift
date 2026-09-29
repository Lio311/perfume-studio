import Foundation

/// Median of the last seven raw estimates, then a one-euro filter.
/// Resets only when the source id changes. A gap in time does not reset:
/// brief losses are held by the guide, and the next card sample continues.
public struct DistanceFilter: Equatable {
    public static let window = DistanceTiming.medianCount
    /// Low-pass corner when the hand is still, hertz. Tuned with the median so
    /// ±3 mm at 2–8 Hz stays at or under 1.5 mm σ.
    public static let minCutoffHz = 0.8
    /// How fast the corner opens as the smoothed speed grows, hertz per (mm/s).
    public static let beta = 0.015
    public static let derivativeCutoffHz = 1.0

    public private(set) var value: Double?
    private var samples: [Double] = []
    private var lastSourceID: String?
    private var oneEuro = OneEuroFilter(
        minCutoff: DistanceFilter.minCutoffHz,
        beta: DistanceFilter.beta,
        derivativeCutoff: DistanceFilter.derivativeCutoffHz
    )

    public init() {}

    public mutating func reset() {
        value = nil
        samples.removeAll()
        lastSourceID = nil
        oneEuro.reset()
    }

    public struct Result: Equatable {
        public var millimetres: Double
        /// True when this sample started a new window because the source id changed.
        public var didReset: Bool
    }

    /// Ignores readings the source rejects, and non-finite timestamps, without touching state.
    public mutating func push(zMm: Double, time: TimeInterval, source: some DistanceSource) -> Result? {
        guard source.accepts(rawZMm: zMm), time.isFinite else { return nil }
        var didReset = false
        if let lastSourceID, lastSourceID != source.id {
            clearWindow()
            didReset = true
        }
        samples.append(zMm)
        if samples.count > Self.window { samples.removeFirst(samples.count - Self.window) }
        let median = Self.median(samples)
        let filtered = oneEuro.filter(median, time: time)
        value = filtered
        lastSourceID = source.id
        return Result(millimetres: filtered, didReset: didReset)
    }

    private mutating func clearWindow() {
        value = nil
        samples.removeAll()
        oneEuro.reset()
    }

    static func median(_ values: [Double]) -> Double {
        let sorted = values.sorted()
        let count = sorted.count
        if count == 0 { return 0 }
        if count % 2 == 1 { return sorted[count / 2] }
        return 0.5 * (sorted[count / 2 - 1] + sorted[count / 2])
    }
}

/// Casiez one-euro filter. `te` is clamped so a held gap does not snap the next sample through.
private struct OneEuroFilter: Equatable {
    var minCutoff: Double
    var beta: Double
    var derivativeCutoff: Double
    private var previous: Double?
    private var previousDerivative = 0.0
    private var previousTime: TimeInterval?

    init(minCutoff: Double, beta: Double, derivativeCutoff: Double) {
        self.minCutoff = minCutoff
        self.beta = beta
        self.derivativeCutoff = derivativeCutoff
    }

    mutating func reset() {
        previous = nil
        previousDerivative = 0
        previousTime = nil
    }

    mutating func filter(_ sample: Double, time: TimeInterval) -> Double {
        guard let previous, let previousTime else {
            self.previous = sample
            self.previousTime = time
            previousDerivative = 0
            return sample
        }
        let elapsed = min(max(time - previousTime, 1.0 / 120), 0.1)
        let derivative = (sample - previous) / elapsed
        let smoothedDerivative = smooth(derivative, previous: previousDerivative, cutoff: derivativeCutoff, elapsed: elapsed)
        let cutoff = minCutoff + beta * abs(smoothedDerivative)
        let filtered = smooth(sample, previous: previous, cutoff: cutoff, elapsed: elapsed)
        self.previous = filtered
        previousDerivative = smoothedDerivative
        self.previousTime = time
        return filtered
    }

    private func smooth(_ sample: Double, previous: Double, cutoff: Double, elapsed: Double) -> Double {
        let tau = 1 / (2 * Double.pi * max(cutoff, 1e-3))
        let alpha = 1 / (1 + tau / elapsed)
        return alpha * sample + (1 - alpha) * previous
    }
}
