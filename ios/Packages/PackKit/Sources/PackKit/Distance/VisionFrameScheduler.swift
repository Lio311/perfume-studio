import Foundation

/// Picks the latest camera frame for rectangle detection and drops the rest.
/// Detection runs one frame at a time, off the main thread. A result whose token
/// is no longer `latest` is stale and must be discarded — the caller then starts
/// `latest`. The scheduler does not retain pixel buffers or ARFrames.
public struct VisionFrameScheduler: Equatable {
    public private(set) var latest = 0
    public private(set) var inFlight: Int?

    public init() {}

    /// A new camera frame arrived. Returns its token. Older tokens are stale.
    public mutating func arrived() -> Int {
        latest += 1
        return latest
    }

    /// Begin detection for `token` when nothing is running and `token` is still latest.
    public mutating func start(_ token: Int) -> Bool {
        guard inFlight == nil, token == latest else { return false }
        inFlight = token
        return true
    }

    /// Finish the detection that started with `token`.
    /// True only when that frame is still the latest one.
    public mutating func finish(_ token: Int) -> Bool {
        guard inFlight == token else { return false }
        inFlight = nil
        return token == latest
    }
}
