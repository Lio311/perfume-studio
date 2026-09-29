import Foundation

/// Stateful source picker.
/// A missing or rejected card keeps the last card reading for `grace` (700 ms)
/// without feeding the filter and without falling through to VIO or LiDAR.
/// Only after that window does the frame use LiDAR or VIO, which is a real source change.
/// LiDAR stays optional: a phone without it simply has no LiDAR sample.
public struct DistanceSourceChooser: Equatable {
    public var grace: TimeInterval
    private var held: DistanceChooser.Choice?
    private var heldAt: TimeInterval?

    public init(grace: TimeInterval = DistanceTiming.lossHold) {
        self.grace = grace
    }

    public enum Decision: Equatable, Sendable {
        /// Push this measurement through the filter.
        case measure(DistanceChooser.Choice)
        /// Keep the last card reading. Do not push the filter and do not change source.
        case hold(DistanceChooser.Choice)
    }

    public mutating func reset() {
        held = nil
        heldAt = nil
    }

    public mutating func update(
        card: DistanceChooser.Choice?,
        lidarMm: Double?,
        vioMm: Double?,
        time: TimeInterval
    ) -> Decision? {
        if let card, card.source == .card, card.rawZMm.isFinite, card.rawZMm > 0 {
            held = card
            heldAt = time
            return .measure(card)
        }
        if let held, let heldAt, time.isFinite, heldAt.isFinite, time >= heldAt, time - heldAt <= grace {
            return .hold(held)
        }
        self.held = nil
        self.heldAt = nil
        guard let fallback = DistanceChooser.choose(
            cardDepthMm: nil,
            cardTiltDegrees: nil,
            lidarMm: lidarMm,
            vioMm: vioMm
        ) else { return nil }
        return .measure(fallback)
    }
}
