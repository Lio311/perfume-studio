import Foundation

/// Namespace + version marker. Real modules land per milestone:
/// M0: Models (SupplierPack/SupplierPart/Price) + JSON round-trip of Fixtures a/b, rejection of c.
/// M1: Distance (pinhole pose, median+EMA filter, hysteresis guide state machine).
/// M3a: Measure (scale, parallax, profile, dimensions, confidence).
public enum PackKit {
    public static let version = "0.1.0"
}
