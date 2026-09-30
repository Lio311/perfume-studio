import Foundation

/// Schema `appearance.finish` values, in the order the review chips show them.
public enum FinishCatalog {
    public static let ids: [String] = [
        "clear", "frosted", "tinted", "gold", "silver", "rose", "matteBlack", "wood", "leather",
    ]

    /// Defaults follow `createDefaultDesign` in `src/model/design.ts`.
    public static func defaultFinish(for kind: PartKind) -> String {
        switch kind {
        case .bottle: return "clear"
        case .box: return "matteBlack"
        case .cap, .pump, .collar, .label: return "gold"
        }
    }

    public static func hebrewName(_ id: String) -> String {
        switch id {
        case "clear": return "זכוכית שקופה"
        case "frosted": return "זכוכית חלבית"
        case "tinted": return "זכוכית כהה"
        case "gold": return "זהב"
        case "silver": return "כסף"
        case "rose": return "רוז גולד"
        case "matteBlack": return "שחור מט"
        case "wood": return "עץ"
        case "leather": return "עור"
        default: return id
        }
    }

    public static func isKnown(_ id: String) -> Bool {
        ids.contains(id)
    }
}

public struct ReviewTierInput: Equatable, Sendable {
    public var minQty: Double?
    public var value: Double?

    public init(minQty: Double?, value: Double?) {
        self.minQty = minQty
        self.value = value
    }
}

/// Optional supplier price as the review screen edits it. Invalid numbers stay here so `PackValidator` can reject them.
public struct ReviewPriceInput: Equatable, Sendable {
    public var value: Double?
    public var currency: String?
    public var moq: Double?
    public var tiers: [ReviewTierInput]
    public var unknownKeys: [String: String]

    public init(
        value: Double?,
        currency: String?,
        moq: Double?,
        tiers: [ReviewTierInput],
        unknownKeys: [String: String] = [:]
    ) {
        self.value = value
        self.currency = currency
        self.moq = moq
        self.tiers = tiers
        self.unknownKeys = unknownKeys
    }
}

/// Editable review state. Dimension edits go through `Rescale`; save gating uses `PackValidator`.
public struct ReviewDraft: Equatable, Sendable {
    public var kind: PartKind
    public var dimensions: Dimensions
    public var confidence: [DimensionConfidence]
    public var finish: String
    public var colorHex: String
    public var colorSource: String?
    public var neckOuterDiameterMm: Double?
    public var price: ReviewPriceInput?
    public var profile: String
    public var lathe: [Double]?
    public var measurements: [Measurements]
    public var scan: ScanInfo

    public init(
        kind: PartKind,
        dimensions: Dimensions,
        confidence: [DimensionConfidence],
        finish: String,
        colorHex: String,
        colorSource: String?,
        neckOuterDiameterMm: Double?,
        price: ReviewPriceInput?,
        profile: String,
        lathe: [Double]?,
        measurements: [Measurements],
        scan: ScanInfo
    ) {
        self.kind = kind
        self.dimensions = dimensions
        self.confidence = confidence
        self.finish = finish
        self.colorHex = colorHex
        self.colorSource = colorSource
        self.neckOuterDiameterMm = neckOuterDiameterMm
        self.price = price
        self.profile = profile
        self.lathe = lathe
        self.measurements = measurements
        self.scan = scan
    }

    public func band(for key: String) -> ConfidenceBand {
        confidence.first { $0.key == key }?.model.band ?? .check
    }
}

public enum ReviewModel {
    /// Editing one axis rescales width, height, depth, the neck suggestion, and linear measurements together.
    public static func rescale(_ draft: ReviewDraft, axis: MeasureAxis, to millimetres: Double) -> ReviewDraft {
        let scaled = Rescale.apply(measureResult(draft), axis: axis, to: millimetres)
        var copy = draft
        copy.dimensions = scaled.dimensions
        copy.lathe = scaled.lathe
        copy.neckOuterDiameterMm = scaled.neckOuterDiameterMm
        copy.measurements = scaled.measurements
        copy.confidence = scaled.confidence
        if let scan = scaled.scan {
            copy.scan = scan
        }
        copy.scan.dimsVerifiedBySupplier = false
        if var suggestion = copy.scan.neckSuggestion {
            suggestion.verifiedBySupplier = false
            suggestion.measuredMm = scaled.neckOuterDiameterMm
            copy.scan.neckSuggestion = suggestion
        }
        return copy
    }

    /// The neck figure stays an unverified suggestion. The UI labels it "לאימות מול הספק".
    public static func setNeck(_ draft: ReviewDraft, millimetres: Double?) -> ReviewDraft {
        var copy = draft
        copy.neckOuterDiameterMm = millimetres
        copy.measurements = draft.measurements.map { item in
            guard item.key == "neckOuterDiameterMm", let millimetres else { return item }
            var edited = item
            edited.value = millimetres
            return edited
        }
        copy.scan.dimsVerifiedBySupplier = false
        if var suggestion = copy.scan.neckSuggestion {
            suggestion.measuredMm = millimetres
            suggestion.verifiedBySupplier = false
            suggestion.confirmedByUser = false
            copy.scan.neckSuggestion = suggestion
        }
        return copy
    }

    public static func issues(_ draft: ReviewDraft) -> [Issue] {
        guard let data = packJSON(draft) else {
            return [Issue(code: "pack_invalid", path: "", severity: .error, messageHe: "הקובץ אינו חבילת ספק.", messageEn: "The file is not a supplier pack.")]
        }
        return PackValidator.issues(inPackJSON: data)
    }

    /// Blocking errors disable "שמור לתיבת יציאה". Warnings do not.
    public static func outboxBlocked(_ draft: ReviewDraft) -> Bool {
        issues(draft).contains { $0.severity == .error }
    }

    /// A price that can be written. Incomplete or invalid input returns nil.
    /// A successful rebuild keeps `quotedAt` from the price already stored.
    public static func storedPrice(_ input: ReviewPriceInput?, quotedAt: String? = nil) -> Price? {
        guard let input,
              let value = input.value, value > 0,
              let currency = input.currency,
              let normalized = PackValidator.normalizeCurrency(currency) else { return nil }
        if let moq = input.moq, moq < 1 || moq.rounded() != moq { return nil }
        var tiers: [PriceTier] = []
        for tier in input.tiers {
            guard let minQty = tier.minQty, minQty.rounded() == minQty, minQty >= 0,
                  let tierValue = tier.value, tierValue > 0 else { return nil }
            tiers.append(PriceTier(minQty: Int(minQty), value: tierValue))
        }
        return Price(
            value: value,
            currency: normalized,
            moq: input.moq.map { Int($0) },
            tiers: tiers.isEmpty ? nil : tiers,
            quotedAt: quotedAt
        )
    }

    public static func priceObject(_ price: ReviewPriceInput) -> [String: Any] {
        var object: [String: Any] = [:]
        if let value = price.value { object["value"] = value }
        if let currency = price.currency { object["currency"] = currency }
        if let moq = price.moq { object["moq"] = moq }
        if !price.tiers.isEmpty {
            object["tiers"] = price.tiers.map { tier -> [String: Any] in
                var row: [String: Any] = [:]
                if let minQty = tier.minQty { row["minQty"] = minQty }
                if let value = tier.value { row["value"] = value }
                return row
            }
        }
        for (key, value) in price.unknownKeys where !key.isEmpty {
            object[key] = value
        }
        return object
    }

    public static func packJSON(_ draft: ReviewDraft) -> Data? {
        var part: [String: Any] = [
            "id": "review-part",
            "kind": draft.kind.rawValue,
            "code": "DRAFT",
            "name": draft.kind.rawValue,
            "neck": NSNull(),
            "widthMm": draft.dimensions.widthMm,
            "heightMm": draft.dimensions.heightMm,
            "depthMm": draft.dimensions.depthMm,
            "capacityMl": NSNull(),
            "profile": draft.profile,
            "color": draft.colorHex,
            "thumb": "",
            "page": 1,
            "dimsVerifiedBySupplier": false,
        ]
        if let lathe = draft.lathe { part["lathe"] = lathe }
        var appearance: [String: Any] = [
            "finish": draft.finish,
            "finishSource": "user",
        ]
        if let colorSource = draft.colorSource { appearance["colorSource"] = colorSource }
        if draft.colorHex.hasPrefix("#") { appearance["colors"] = [draft.colorHex] }
        part["appearance"] = appearance
        if let price = draft.price {
            part["price"] = priceObject(price)
        }
        let pack: [String: Any] = [
            "id": "review",
            "name": "review",
            "createdAt": 0,
            "parts": [part],
        ]
        return try? JSONSerialization.data(withJSONObject: pack, options: [.sortedKeys])
    }

    private static func measureResult(_ draft: ReviewDraft) -> MeasureResult {
        MeasureResult(
            kind: draft.kind,
            dimensions: draft.dimensions,
            profile: nil,
            lathe: draft.lathe,
            neckOuterDiameterMm: draft.neckOuterDiameterMm,
            shape: .other,
            measurements: draft.measurements,
            scan: draft.scan,
            confidence: draft.confidence,
            issues: [],
            suspect: false,
            saveBlocked: false,
            dimsVerifiedBySupplier: false,
            toleranceMm: ScaleLimits.toleranceMillimetres,
            scale: nil
        )
    }
}
