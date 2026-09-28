import Foundation

/// Picks the depth source for one frame.
/// The card wins whenever a pose exists. LiDAR is used only at or beyond 300 mm.
/// With neither, the frame falls back to VIO.
public enum DistanceChooser {
    public struct Choice: Equatable, Sendable {
        public var rawZMm: Double
        public var source: DistanceSource
        public var tiltDegrees: Double

        public init(rawZMm: Double, source: DistanceSource, tiltDegrees: Double) {
            self.rawZMm = rawZMm
            self.source = source
            self.tiltDegrees = tiltDegrees
        }
    }

    public static func choose(cardDepthMm: Double?, cardTiltDegrees: Double?, lidarMm: Double?, vioMm: Double?) -> Choice? {
        if let cardDepthMm, cardDepthMm.isFinite, cardDepthMm > 0 {
            return Choice(rawZMm: cardDepthMm, source: .card, tiltDegrees: cardTiltDegrees ?? 0)
        }
        if let lidarMm, DistanceSource.lidar.accepts(rawZMm: lidarMm) {
            return Choice(rawZMm: lidarMm, source: .lidar, tiltDegrees: 0)
        }
        if let vioMm, vioMm.isFinite, vioMm > 0 {
            return Choice(rawZMm: vioMm, source: .vio, tiltDegrees: 0)
        }
        return nil
    }
}
