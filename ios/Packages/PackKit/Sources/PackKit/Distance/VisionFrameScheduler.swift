import Foundation

/// Decides which camera frames run rectangle detection.
/// A frame is dropped while a detection is still in flight.
/// When a detection takes longer than `slowSeconds` (1/20 s), the next frame
/// is skipped as well, so detection runs on at most every second frame and the
/// camera can stay at or above 20 fps.
public struct VisionFrameScheduler: Equatable {
    public var slowSeconds: TimeInterval
    private var inFlight = false
    private var skipNext = false

    public init(slowSeconds: TimeInterval = 1.0 / 20.0) {
        self.slowSeconds = slowSeconds
    }

    /// Call once per delivered camera frame, before starting detection.
    public mutating func shouldDetect() -> Bool {
        if inFlight { return false }
        if skipNext {
            skipNext = false
            return false
        }
        inFlight = true
        return true
    }

    public mutating func detectionFinished(elapsed: TimeInterval) {
        inFlight = false
        if elapsed > slowSeconds {
            skipNext = true
        }
    }
}
