import Foundation

/// Tunables for the rock-steady distance guide.
/// None of these depend on LiDAR.
public enum DistanceTiming {
    /// Median window ahead of the one-euro filter.
    public static let medianCount = 7
    /// Hold the last good card reading across missing or rejected detections.
    public static let lossHold: TimeInterval = 0.700
    /// Reject a pose when |Z_pnp - Z_width| / Z_width exceeds this. Z_width is `fx * W / w_px`.
    public static let depthAgreement = 0.08
    /// Reject a quad whose metric aspect is off the reference (ID-1 is 1.586) by more than this.
    public static let aspectTolerance = 0.06
    /// Reject a quad whose pixel area jumps by more than this from the last accepted frame.
    public static let areaJump = 0.25
    /// `VNRectangleObservation.confidence` below this is a bad detection.
    public static let minimumConfidence = 0.50
    /// Displayed centimetres change at most five times a second.
    public static let displayInterval: TimeInterval = 0.2
    /// Displayed centimetres stay put until the rounded value has moved by this much.
    public static let displayDeadbandCm = 0.2
    /// Direction may change only after `|e|` has passed 0 by more than `directionMargin * h`.
    public static let directionMargin = 0.5
    /// And that candidate has to hold for this many frames.
    public static let directionFrames = 3
    /// A hand-held still card, after filtering, stays inside this σ over one second.
    public static let stillSigmaMm = 1.5
    /// Keep the previous long-edge assignment until another edge is clearly longer.
    public static let edgeHysteresis = 0.92
}

/// Why a camera frame did not update the distance.
public enum CardRejectReason: String, Equatable, Sendable {
    case confidence
    case aspect
    case area
    case depthDisagree
    case pose
    /// No rectangle at all. Not counted as a bad detection.
    case missing

    public var countsAsRejection: Bool { self != .missing }
}
