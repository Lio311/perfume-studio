import Foundation

public struct ReportReference: Equatable, Codable, Sendable {
    public var kind: String
    public var millimetres: Double?
    public var source: String
    public var cardWidthMm: Double?
    public var cardHeightMm: Double?

    public init(kind: String, millimetres: Double?, source: String, cardWidthMm: Double?, cardHeightMm: Double?) {
        self.kind = kind
        self.millimetres = millimetres
        self.source = source
        self.cardWidthMm = cardWidthMm
        self.cardHeightMm = cardHeightMm
    }
}

public struct ReportBox: Equatable, Codable, Sendable {
    public var min: Vec3
    public var max: Vec3
    public var size: Vec3

    public init(min: Vec3, max: Vec3, size: Vec3) {
        self.min = min
        self.max = max
        self.size = size
    }

    public init(bounds: BoundingBox) {
        min = bounds.min
        max = bounds.max
        size = bounds.size
    }
}

public struct ReportOutputs: Equatable, Codable, Sendable {
    public var usdz: String
    public var scaledUsdz: String
    public var obj: String
    public var glb: String?

    public init(usdz: String, scaledUsdz: String, obj: String, glb: String?) {
        self.usdz = usdz
        self.scaledUsdz = scaledUsdz
        self.obj = obj
        self.glb = glb
    }
}

public struct ReconstructionReport: Equatable, Codable, Sendable {
    public var name: String
    public var detail: String
    public var imageCount: Int
    public var durationSeconds: Double
    public var scaleFactor: Double
    public var reference: ReportReference
    public var boundingBoxMmBefore: ReportBox
    public var boundingBoxMmAfter: ReportBox
    public var warnings: [String]
    public var outputs: ReportOutputs

    public init(
        name: String,
        detail: String,
        imageCount: Int,
        durationSeconds: Double,
        scaleFactor: Double,
        reference: ReportReference,
        boundingBoxMmBefore: ReportBox,
        boundingBoxMmAfter: ReportBox,
        warnings: [String],
        outputs: ReportOutputs
    ) {
        self.name = name
        self.detail = detail
        self.imageCount = imageCount
        self.durationSeconds = durationSeconds
        self.scaleFactor = scaleFactor
        self.reference = reference
        self.boundingBoxMmBefore = boundingBoxMmBefore
        self.boundingBoxMmAfter = boundingBoxMmAfter
        self.warnings = warnings
        self.outputs = outputs
    }
}

public enum ReportCodec {
    public static func encode(_ report: ReconstructionReport) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(report)
    }

    public static func decode(_ data: Data) throws -> ReconstructionReport {
        try JSONDecoder().decode(ReconstructionReport.self, from: data)
    }
}
