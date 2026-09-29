import Foundation

public enum PartKind: String, Codable, Equatable, CaseIterable, Sendable {
    case bottle, cap, label, pump, collar, box
}

public enum Neck: String, Codable, Equatable, CaseIterable {
    case FEA13, FEA15, FEA17, FEA18, FEA20
}

public struct Dimensions: Codable, Equatable {
    public var widthMm: Double
    public var heightMm: Double
    public var depthMm: Double
}

public struct PriceTier: Codable, Equatable {
    public var minQty: Int
    public var value: Double
}

public struct Price: Codable, Equatable {
    public var value: Double
    public var currency: String
    public var moq: Int?
    public var tiers: [PriceTier]?
    public var quotedAt: String?

    public init(value: Double, currency: String, moq: Int? = nil, tiers: [PriceTier]? = nil, quotedAt: String? = nil) {
        self.value = value
        self.currency = currency
        self.moq = moq
        self.tiers = tiers
        self.quotedAt = quotedAt
    }

    private enum CodingKeys: String, CodingKey {
        case value, currency, moq, tiers, quotedAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        value = try c.decode(Double.self, forKey: .value)
        currency = try c.decode(String.self, forKey: .currency)
        moq = try c.decodeIfPresent(Int.self, forKey: .moq)
        tiers = try c.decodeIfPresent([PriceTier].self, forKey: .tiers)
        quotedAt = try c.decodeIfPresent(String.self, forKey: .quotedAt)
    }

    /// Writes a normalised ISO code. `usd` and ` USD ` become `USD`; `₪` becomes `ILS`.
    /// A code that cannot be normalised is still written in upper case.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(value, forKey: .value)
        let trimmed = currency.trimmingCharacters(in: .whitespacesAndNewlines)
        let written = PackValidator.normalizeCurrency(trimmed)
            ?? trimmed.uppercased(with: Locale(identifier: "en_US_POSIX"))
        try c.encode(written, forKey: .currency)
        try c.encodeIfPresent(moq, forKey: .moq)
        try c.encodeIfPresent(tiers, forKey: .tiers)
        try c.encodeIfPresent(quotedAt, forKey: .quotedAt)
    }
}

public struct Appearance: Codable, Equatable {
    public var finish: String?
    public var gloss: String?
    public var finishSource: String?
    public var finishConfidence: Double?
    public var colorSource: String?
    public var colors: [String]?
}

public struct ImageRef: Codable, Equatable {
    public var url: String
    public var role: String
    public var width: Int?
    public var height: Int?
}

public struct MeshRef: Codable, Equatable {
    public struct BBox: Codable, Equatable {
        public var x: Double
        public var y: Double
        public var z: Double
    }

    public var format: String
    public var url: String?
    public var dataUri: String?
    public var bundlePath: String?
    public var units: String
    public var upAxis: String
    public var origin: String
    public var triangles: Int?
    public var bytes: Int?
    public var sha256: String?
    public var bboxMm: BBox?
}

/// One recorded measurement. The pack stores these under `measurements`.
public struct Measurements: Codable, Equatable {
    public var key: String
    public var value: Double
    public var source: String
    public var toleranceMm: Double?
}

public struct ScanInfo: Codable, Equatable {
    public struct NeckSuggestion: Codable, Equatable {
        public var suggested: Neck?
        public var confidence: Double?
        public var measuredMm: Double?
        public var basis: String?
        public var confirmedByUser: Bool
        public var verifiedBySupplier: Bool?
    }

    public var method: String
    public var capturedAt: String
    public var device: String?
    public var appVersion: String?
    public var material: String?
    public var scale: String?
    public var referenceObject: String?
    public var confidence: Double?
    public var neckSuggestion: NeckSuggestion?
    public var dimsVerifiedBySupplier: Bool?
    public var toleranceMm: Double?
}

public struct LocalizedName: Codable, Equatable {
    public var he: String?
    public var en: String?
}

public struct PartParams: Codable, Equatable {
    public var section: String?
    public var profile: String?
    public var shoulder: Double?
    public var softness: Double?
    public var faceted: Bool?
    public var overhangMm: Double?
    public var style: String?
    public var radiusFactor: Double?
    public var nozzleMm: Double?
    public var wallMm: Double?
    public var rings: Int?
    public var knurl: Bool?
    public var flareMm: Double?
    public var form: String?
    public var padMm: Double?
    public var liftMm: Double?
}

public struct PackGenerator: Codable, Equatable {
    public var name: String
    public var version: String?
    public var exportedAt: String?
}

public struct SupplierContact: Codable, Equatable {
    public var company: String?
    public var booth: String?
    public var event: String?
    public var country: String?
    public var contactName: String?
    public var role: String?
    public var email: String?
    public var phone: String?
    public var whatsapp: String?
    public var wechat: String?
    public var website: String?
    public var notes: String?
}

public struct SupplierPack: Codable, Equatable {
    public var id: String
    public var name: String
    public var createdAt: Int
    public var parts: [SupplierPart]
    public var version: Int?
    public var source: String?
    public var generator: PackGenerator?
    public var supplier: SupplierContact?
}

public struct SupplierPart: Codable, Equatable {
    public var id: String
    public var kind: PartKind
    public var code: String
    public var name: String
    public var names: LocalizedName?
    public var neck: Neck?
    public var dimensions: Dimensions
    public var capacityMl: Double?
    public var profile: String
    public var color: String
    public var thumb: String
    public var page: Int
    public var lathe: [Double]?
    public var source: String?
    public var neckFinish: String?
    public var notes: String?
    public var price: Price?
    public var measurements: [Measurements]?
    public var scan: ScanInfo?
    public var mesh: MeshRef?
    public var params: PartParams?
    public var appearance: Appearance?
    public var images: [ImageRef]?
    public var thumbUrl: String?

    enum CodingKeys: String, CodingKey {
        case id, kind, code, name, names, neck
        case widthMm, heightMm, depthMm, capacityMl
        case profile, color, thumb, page
        case lathe, source, neckFinish, notes
        case price, measurements, scan, mesh, params
        case appearance, images, thumbUrl
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = try c.decode(PartKind.self, forKey: .kind)
        code = try c.decode(String.self, forKey: .code)
        name = try c.decode(String.self, forKey: .name)
        names = try c.decodeIfPresent(LocalizedName.self, forKey: .names)
        neck = try c.decodeIfPresent(Neck.self, forKey: .neck)
        dimensions = Dimensions(
            widthMm: try c.decode(Double.self, forKey: .widthMm),
            heightMm: try c.decode(Double.self, forKey: .heightMm),
            depthMm: try c.decode(Double.self, forKey: .depthMm)
        )
        capacityMl = try c.decodeIfPresent(Double.self, forKey: .capacityMl)
        profile = try c.decode(String.self, forKey: .profile)
        color = try c.decode(String.self, forKey: .color)
        thumb = try c.decode(String.self, forKey: .thumb)
        page = try c.decode(Int.self, forKey: .page)
        lathe = try c.decodeIfPresent([Double].self, forKey: .lathe)
        source = try c.decodeIfPresent(String.self, forKey: .source)
        neckFinish = try c.decodeIfPresent(String.self, forKey: .neckFinish)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        price = try c.decodeIfPresent(Price.self, forKey: .price)
        measurements = try c.decodeIfPresent([Measurements].self, forKey: .measurements)
        scan = try c.decodeIfPresent(ScanInfo.self, forKey: .scan)
        mesh = try c.decodeIfPresent(MeshRef.self, forKey: .mesh)
        params = try c.decodeIfPresent(PartParams.self, forKey: .params)
        appearance = try c.decodeIfPresent(Appearance.self, forKey: .appearance)
        images = try c.decodeIfPresent([ImageRef].self, forKey: .images)
        thumbUrl = try c.decodeIfPresent(String.self, forKey: .thumbUrl)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(kind, forKey: .kind)
        try c.encode(code, forKey: .code)
        try c.encode(name, forKey: .name)
        try c.encodeIfPresent(names, forKey: .names)
        if let neck {
            try c.encode(neck, forKey: .neck)
        } else {
            try c.encodeNil(forKey: .neck)
        }
        try c.encode(dimensions.widthMm, forKey: .widthMm)
        try c.encode(dimensions.heightMm, forKey: .heightMm)
        try c.encode(dimensions.depthMm, forKey: .depthMm)
        if let capacityMl {
            try c.encode(capacityMl, forKey: .capacityMl)
        } else {
            try c.encodeNil(forKey: .capacityMl)
        }
        try c.encode(profile, forKey: .profile)
        try c.encode(color, forKey: .color)
        try c.encode(thumb, forKey: .thumb)
        try c.encode(page, forKey: .page)
        try c.encodeIfPresent(lathe, forKey: .lathe)
        try c.encodeIfPresent(source, forKey: .source)
        try c.encodeIfPresent(neckFinish, forKey: .neckFinish)
        try c.encodeIfPresent(notes, forKey: .notes)
        try c.encodeIfPresent(price, forKey: .price)
        try c.encodeIfPresent(measurements, forKey: .measurements)
        try c.encodeIfPresent(scan, forKey: .scan)
        try c.encodeIfPresent(mesh, forKey: .mesh)
        try c.encodeIfPresent(params, forKey: .params)
        try c.encodeIfPresent(appearance, forKey: .appearance)
        try c.encodeIfPresent(images, forKey: .images)
        try c.encodeIfPresent(thumbUrl, forKey: .thumbUrl)
    }
}
