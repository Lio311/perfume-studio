import Foundation

/// Decides when the last accepted distance sample is still worth showing.
/// After `limit` (700 ms) with no sample the readout is cleared.
/// Inside the window the ring is dimmed and the filter is left alone.
public struct DistanceSampleHold: Equatable {
    public var limit: TimeInterval
    public private(set) var isDimmed = false
    private var lastSample: TimeInterval?

    public init(limit: TimeInterval = DistanceTiming.lossHold) {
        self.limit = limit
    }

    public mutating func reset() {
        lastSample = nil
        isDimmed = false
    }

    /// `true` while a sample should stay on screen.
    public mutating func update(hasSample: Bool, time: TimeInterval) -> Bool {
        guard time.isFinite else {
            isDimmed = lastSample != nil && !hasSample
            return lastSample != nil
        }
        if hasSample {
            lastSample = time
            isDimmed = false
            return true
        }
        guard let lastSample else {
            isDimmed = false
            return false
        }
        if time - lastSample >= limit {
            self.lastSample = nil
            isDimmed = false
            return false
        }
        isDimmed = true
        return true
    }
}
