import Foundation

public enum ConfidenceBand: String, Codable, Equatable, Sendable {
    /// Estimated error ≤ 3 mm: card found, sharp, tilt under 25°.
    case ok
    /// Estimated error 3–5 mm: taps, a typed dimension, an edited glass outline, or a strong tilt.
    case check
    /// Estimated error above 5 mm, or no scale source.
    case retake
}

/// σ from the scale source, pixel quantisation, and the parallax residual, added in quadrature.
public struct DimensionErrorModel: Equatable, Sendable {
    public var sigmaScaleMm: Double
    public var sigmaQuantisationMm: Double
    public var sigmaParallaxMm: Double
    public var totalMm: Double
    public var band: ConfidenceBand

    public init(
        sigmaScaleMm: Double,
        sigmaQuantisationMm: Double,
        sigmaParallaxMm: Double,
        totalMm: Double,
        band: ConfidenceBand
    ) {
        self.sigmaScaleMm = sigmaScaleMm
        self.sigmaQuantisationMm = sigmaQuantisationMm
        self.sigmaParallaxMm = sigmaParallaxMm
        self.totalMm = totalMm
        self.band = band
    }
}

public struct DimensionConfidence: Equatable, Sendable {
    public var key: String
    public var model: DimensionErrorModel

    public init(key: String, model: DimensionErrorModel) {
        self.key = key
        self.model = model
    }
}

public enum MeasureConfidence {
    public static func model(
        sigmaScaleMm: Double,
        sigmaQuantisationMm: Double,
        sigmaParallaxMm: Double,
        hasScale: Bool,
        outlineEdited: Bool
    ) -> DimensionErrorModel {
        let scale = hasScale ? max(0, sigmaScaleMm) : 0
        let quant = hasScale ? max(0, sigmaQuantisationMm) : 0
        let parallax = hasScale ? max(0, sigmaParallaxMm) : 0
        var total = hasScale ? MeasureMath.hypot3(scale, quant, parallax) : 10
        if hasScale, outlineEdited {
            // An edited glass outline is a `check`, even when the card itself was sharp.
            total = max(total, 4)
        }
        let band: ConfidenceBand
        if !hasScale || total > ScaleLimits.checkErrorMillimetres {
            band = .retake
        } else if total > ScaleLimits.okErrorMillimetres {
            band = .check
        } else {
            band = .ok
        }
        return DimensionErrorModel(
            sigmaScaleMm: scale,
            sigmaQuantisationMm: quant,
            sigmaParallaxMm: parallax,
            totalMm: total,
            band: band
        )
    }

    public static func scanConfidence(_ band: ConfidenceBand) -> Double {
        switch band {
        case .ok: return 0.9
        case .check: return 0.55
        case .retake: return 0.2
        }
    }
}
