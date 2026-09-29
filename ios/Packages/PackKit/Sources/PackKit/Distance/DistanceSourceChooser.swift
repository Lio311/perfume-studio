import Foundation

/// Stateful source picker. A missing card is held as `.card` for `grace`
/// (300 ms by default) so one dropped detection does not fall through to VIO
/// or LiDAR and reset the filter, the guide, and the auto-capture hold.
public struct DistanceSourceChooser: Equatable {
    public var grace: TimeInterval
    private var held: DistanceChooser.Choice?
    private var heldAt: TimeInterval?

    public init(grace: TimeInterval = 0.300) {
        self.grace = grace
    }

    public mutating func reset() {
        held = nil
        heldAt = nil
    }

    public mutating func update(
        cardDepthMm: Double?,
        cardTiltDegrees: Double?,
        lidarMm: Double?,
        vioMm: Double?,
        time: TimeInterval
    ) -> DistanceChooser.Choice? {
        if let card = DistanceChooser.choose(
            cardDepthMm: cardDepthMm,
            cardTiltDegrees: cardTiltDegrees,
            lidarMm: nil,
            vioMm: nil
        ), card.source == .card {
            held = card
            heldAt = time
            return card
        }
        if let held, let heldAt, time.isFinite, heldAt.isFinite, time >= heldAt, time - heldAt <= grace {
            return held
        }
        self.held = nil
        self.heldAt = nil
        return DistanceChooser.choose(
            cardDepthMm: nil,
            cardTiltDegrees: nil,
            lidarMm: lidarMm,
            vioMm: vioMm
        )
    }
}
