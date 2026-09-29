import Foundation

/// Fires once after green has been held for at least 0.5 s when the source allows
/// auto-capture and tilt is at most 10°.
/// Among camera sources only the card allows it. VIO never fires. LiDAR never fires,
/// including below 300 mm, where `accepts` rejects the reading as well.
public struct AutoCaptureGate: Equatable {
    public var hold: TimeInterval
    public var maxTiltDegrees: Double
    private var qualifiedSince: TimeInterval?
    private var fired = false

    public init(hold: TimeInterval = 0.5, maxTiltDegrees: Double = 10) {
        self.hold = hold
        self.maxTiltDegrees = maxTiltDegrees
    }

    public mutating func reset() {
        qualifiedSince = nil
        fired = false
    }

    /// Returns true on the single frame where the hold completes.
    /// When `enabled` is false the hold is cleared and never counted, so turning
    /// auto-capture on later cannot fire from time accumulated while it was off.
    public mutating func update(
        isGreen: Bool,
        source: some DistanceSource,
        tiltDegrees: Double,
        zMm: Double,
        time: TimeInterval,
        enabled: Bool = true
    ) -> Bool {
        guard enabled else {
            reset()
            return false
        }
        let qualified = isGreen
            && source.allowsAutoCapture
            && source.accepts(rawZMm: zMm)
            && tiltDegrees.isFinite
            && tiltDegrees <= maxTiltDegrees
            && time.isFinite
        guard qualified else {
            reset()
            return false
        }
        if qualifiedSince == nil {
            qualifiedSince = time
            fired = false
        }
        guard let qualifiedSince, !fired, time - qualifiedSince >= hold else { return false }
        fired = true
        return true
    }
}
