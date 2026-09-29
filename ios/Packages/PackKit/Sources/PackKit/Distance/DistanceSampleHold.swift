import Foundation

/// Decides when the last accepted distance sample is still worth showing.
/// After `limit` (500 ms) with no sample the readout is cleared.
public struct DistanceSampleHold: Equatable {
    public var limit: TimeInterval
    private var lastSample: TimeInterval?

    public init(limit: TimeInterval = 0.5) {
        self.limit = limit
    }

    public mutating func reset() {
        lastSample = nil
    }

    /// `true` while a sample should stay on screen.
    public mutating func update(hasSample: Bool, time: TimeInterval) -> Bool {
        guard time.isFinite else { return lastSample != nil }
        if hasSample {
            lastSample = time
            return true
        }
        guard let lastSample else { return false }
        if time - lastSample >= limit {
            self.lastSample = nil
            return false
        }
        return true
    }
}
