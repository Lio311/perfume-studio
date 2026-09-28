import Foundation

/// Fires once after green has been held for at least 0.5 s on a card whose tilt is at most 10°.
/// Never fires for VIO, and never fires for LiDAR below 300 mm. LiDAR never auto-captures:
/// the only firing source is the card.
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
    public mutating func update(
        isGreen: Bool,
        source: DistanceSource,
        tiltDegrees: Double,
        zMm: Double,
        time: TimeInterval
    ) -> Bool {
        let qualified = isGreen
            && source == .card
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
