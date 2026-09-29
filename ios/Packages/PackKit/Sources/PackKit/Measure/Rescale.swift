import Foundation

/// Editing one dimension rescales the others uniformly (M4). The normalised lathe is unchanged
/// because it is already a fraction of the widest radius; millimetre radii and the height follow the factor.
public enum Rescale {
    public static func dimensions(_ dimensions: Dimensions, axis: MeasureAxis, to millimetres: Double) -> Dimensions {
        let current = axis == .height ? dimensions.heightMm : dimensions.widthMm
        guard current.isFinite, current > 0, millimetres.isFinite, millimetres > 0 else { return dimensions }
        let factor = millimetres / current
        return Dimensions(
            widthMm: dimensions.widthMm * factor,
            heightMm: dimensions.heightMm * factor,
            depthMm: dimensions.depthMm * factor
        )
    }

    public static func apply(_ result: MeasureResult, axis: MeasureAxis, to millimetres: Double) -> MeasureResult {
        let current = axis == .height ? result.dimensions.heightMm : result.dimensions.widthMm
        guard current.isFinite, current > 0, millimetres.isFinite, millimetres > 0 else { return result }
        let factor = millimetres / current
        var copy = result
        copy.dimensions = dimensions(result.dimensions, axis: axis, to: millimetres)
        if let neck = result.neckOuterDiameterMm {
            copy.neckOuterDiameterMm = neck * factor
        }
        if var profile = result.profile {
            profile.radiiMm = profile.radiiMm.map { $0 * factor }
            profile.heightMm *= factor
            copy.profile = profile
        }
        copy.measurements = result.measurements.map { item in
            var edited = item
            if linearKeys.contains(item.key) {
                edited.value = item.value * factor
            }
            return edited
        }
        copy.confidence = result.confidence.map { item in
            var model = item.model
            model.sigmaScaleMm *= abs(factor)
            model.sigmaQuantisationMm *= abs(factor)
            model.sigmaParallaxMm *= abs(factor)
            model.totalMm *= abs(factor)
            if model.totalMm > ScaleLimits.checkErrorMillimetres {
                model.band = .retake
            } else if model.totalMm > ScaleLimits.okErrorMillimetres {
                model.band = .check
            } else {
                model.band = .ok
            }
            return DimensionConfidence(key: item.key, model: model)
        }
        if let scan = result.scan {
            var updated = scan
            updated.dimsVerifiedBySupplier = false
            updated.toleranceMm = ScaleLimits.toleranceMillimetres
            let worst = copy.confidence.map(\.model.band).min { rank($0) < rank($1) } ?? .retake
            updated.confidence = MeasureConfidence.scanConfidence(worst)
            copy.scan = updated
        }
        copy.dimsVerifiedBySupplier = false
        copy.toleranceMm = ScaleLimits.toleranceMillimetres
        return copy
    }

    private static let linearKeys: Set<String> = [
        "widthMm", "heightMm", "depthMm", "diameterMm", "neckOuterDiameterMm",
    ]

    private static func rank(_ band: ConfidenceBand) -> Int {
        switch band {
        case .retake: return 0
        case .check: return 1
        case .ok: return 2
        }
    }
}
