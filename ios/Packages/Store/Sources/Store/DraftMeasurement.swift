import Foundation
import PackKit

/// Measurements, scan info, and the lathe profile written into a draft `part.json`.
public struct DraftMeasurement: Equatable, Codable, Sendable {
    public var widthMm: Double
    public var heightMm: Double
    public var depthMm: Double
    public var lathe: [Double]?
    public var neckOuterDiameterMm: Double?
    public var profile: String
    public var measurements: [Measurements]
    public var scan: ScanInfo
    /// Per-axis confidence from the measure screen. Missing on drafts saved before M4.
    public var fieldConfidence: [DimensionConfidence]?
    public var finish: String?
    public var finishSource: String?
    public var colorHex: String?
    public var colorSource: String?
    public var price: Price?

    public init(
        widthMm: Double,
        heightMm: Double,
        depthMm: Double,
        lathe: [Double]?,
        neckOuterDiameterMm: Double?,
        profile: String,
        measurements: [Measurements],
        scan: ScanInfo,
        fieldConfidence: [DimensionConfidence]? = nil,
        finish: String? = nil,
        finishSource: String? = nil,
        colorHex: String? = nil,
        colorSource: String? = nil,
        price: Price? = nil
    ) {
        self.widthMm = widthMm
        self.heightMm = heightMm
        self.depthMm = depthMm
        self.lathe = lathe
        self.neckOuterDiameterMm = neckOuterDiameterMm
        self.profile = profile
        self.measurements = measurements
        var stored = scan
        stored.dimsVerifiedBySupplier = false
        stored.toleranceMm = ScaleLimits.toleranceMillimetres
        if var suggestion = stored.neckSuggestion {
            suggestion.verifiedBySupplier = false
            stored.neckSuggestion = suggestion
        }
        self.scan = stored
        self.fieldConfidence = fieldConfidence
        self.finish = finish
        self.finishSource = finishSource
        self.colorHex = colorHex
        self.colorSource = colorSource
        self.price = price
    }

    public init(result: MeasureResult) {
        self.init(
            widthMm: result.dimensions.widthMm,
            heightMm: result.dimensions.heightMm,
            depthMm: result.dimensions.depthMm,
            lathe: result.lathe,
            neckOuterDiameterMm: result.neckOuterDiameterMm,
            profile: result.shape.rawValue,
            measurements: result.measurements,
            scan: result.scan ?? ScanInfo(
                method: "manual",
                capturedAt: "2026-09-29T00:00:00Z",
                device: nil,
                appVersion: PackKit.version,
                material: nil,
                scale: nil,
                referenceObject: nil,
                confidence: nil,
                neckSuggestion: nil,
                dimsVerifiedBySupplier: false,
                toleranceMm: ScaleLimits.toleranceMillimetres
            ),
            fieldConfidence: result.confidence
        )
    }

    public func reviewDraft(kind: PartKind) -> ReviewDraft {
        let finish = self.finish.flatMap { FinishCatalog.isKnown($0) ? $0 : nil } ?? FinishCatalog.defaultFinish(for: kind)
        return ReviewDraft(
            kind: kind,
            dimensions: dimensions,
            confidence: fieldConfidence ?? [],
            finish: finish,
            colorHex: colorHex ?? "#888888",
            colorSource: colorSource,
            neckOuterDiameterMm: neckOuterDiameterMm,
            price: price.map { stored in
                ReviewPriceInput(
                    value: stored.value,
                    currency: stored.currency,
                    moq: stored.moq.map(Double.init),
                    tiers: (stored.tiers ?? []).map { ReviewTierInput(minQty: Double($0.minQty), value: $0.value) }
                )
            },
            profile: profile,
            lathe: lathe,
            measurements: measurements,
            scan: scan
        )
    }

    public var dimensions: Dimensions {
        Dimensions(widthMm: widthMm, heightMm: heightMm, depthMm: depthMm)
    }

    /// Supplier-pack check for this draft. The measure screen shows these issues.
    public func validationIssues(kind: PartKind) -> [Issue] {
        guard let data = packJSON(kind: kind) else { return [] }
        return PackValidator.issues(inPackJSON: data)
    }

    public func packJSON(kind: PartKind) -> Data? {
        var part: [String: Any] = [
            "id": "measure-draft-part",
            "kind": kind.rawValue,
            "code": "DRAFT",
            "name": kind.hebrewName,
            "neck": NSNull(),
            "widthMm": widthMm,
            "heightMm": heightMm,
            "depthMm": depthMm,
            "capacityMl": NSNull(),
            "profile": profile,
            "color": colorHex ?? "#888888",
            "thumb": "",
            "page": 1,
            "dimsVerifiedBySupplier": false,
        ]
        if let lathe { part["lathe"] = lathe }
        let resolvedFinish = finish.flatMap { FinishCatalog.isKnown($0) ? $0 : nil } ?? FinishCatalog.defaultFinish(for: kind)
        var appearance: [String: Any] = [
            "finish": resolvedFinish,
            "finishSource": finishSource ?? "heuristic",
        ]
        if let colorSource { appearance["colorSource"] = colorSource }
        if let colorHex { appearance["colors"] = [colorHex] }
        part["appearance"] = appearance
        if let price {
            var object: [String: Any] = [
                "value": price.value,
                "currency": price.currency,
            ]
            if let moq = price.moq { object["moq"] = moq }
            if let tiers = price.tiers, !tiers.isEmpty {
                object["tiers"] = tiers.map { ["minQty": $0.minQty, "value": $0.value] }
            }
            if let quotedAt = price.quotedAt { object["quotedAt"] = quotedAt }
            part["price"] = object
        }
        if !measurements.isEmpty {
            part["measurements"] = measurements.map { item -> [String: Any] in
                var object: [String: Any] = [
                    "key": item.key,
                    "value": item.value,
                    "source": item.source,
                ]
                if let tolerance = item.toleranceMm { object["toleranceMm"] = tolerance }
                return object
            }
        }
        var scanObject: [String: Any] = [
            "method": scan.method,
            "capturedAt": scan.capturedAt,
            "dimsVerifiedBySupplier": false,
            "toleranceMm": ScaleLimits.toleranceMillimetres,
        ]
        if let device = scan.device { scanObject["device"] = device }
        if let scale = scan.scale { scanObject["scale"] = scale }
        if let reference = scan.referenceObject { scanObject["referenceObject"] = reference }
        if let confidence = scan.confidence { scanObject["confidence"] = confidence }
        part["scan"] = scanObject
        let pack: [String: Any] = [
            "id": "measure-draft",
            "name": "measure",
            "createdAt": 0,
            "parts": [part],
        ]
        return try? JSONSerialization.data(withJSONObject: pack, options: [.sortedKeys])
    }
}
