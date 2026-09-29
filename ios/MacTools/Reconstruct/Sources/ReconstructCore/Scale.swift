import Foundation

public enum ScaleAxis: String, Equatable, Codable, Sendable {
    case height
    case width
}

public struct Similarity: Equatable, Sendable {
    public var factor: Double
    public var translation: Vec3

    public init(factor: Double, translation: Vec3) {
        self.factor = factor
        self.translation = translation
    }

    /// Uniform scale, then translation. Grounds the model on y = 0 and centres X/Z when built by `ModelScaler`.
    public func apply(_ point: Vec3) -> Vec3 {
        Vec3(
            point.x * factor + translation.x,
            point.y * factor + translation.y,
            point.z * factor + translation.z
        )
    }
}

public enum ModelScaler {
    public static func axisFactor(bounds: BoundingBox, axis: ScaleAxis, millimetres: Double) -> Double? {
        guard millimetres.isFinite, millimetres > 0 else { return nil }
        let extent: Double
        switch axis {
        case .height:
            extent = bounds.size.y
        case .width:
            extent = max(bounds.size.x, bounds.size.z)
        }
        guard extent.isFinite, extent > 1e-8 else { return nil }
        let factor = millimetres / extent
        guard factor.isFinite, factor > 0 else { return nil }
        return factor
    }

    /// Places the scaled base on y = 0 and the X/Z centre on the origin.
    public static func similarity(bounds: BoundingBox, factor: Double) -> Similarity? {
        guard factor.isFinite, factor > 0 else { return nil }
        let scaledMin = bounds.min * factor
        let scaledMax = bounds.max * factor
        let translation = Vec3(
            -0.5 * (scaledMin.x + scaledMax.x),
            -scaledMin.y,
            -0.5 * (scaledMin.z + scaledMax.z)
        )
        return Similarity(factor: factor, translation: translation)
    }

    public static func apply(positions: [Vec3], similarity: Similarity) -> [Vec3] {
        positions.map { similarity.apply($0) }
    }
}

public struct AxisFallback: Equatable, Sendable {
    public var axis: ScaleAxis
    public var millimetres: Double
    public var source: String

    public init(axis: ScaleAxis, millimetres: Double, source: String) {
        self.axis = axis
        self.millimetres = millimetres
        self.source = source
    }
}

public enum ScalePlan: Equatable, Sendable {
    case axis(ScaleAxis, millimetres: Double, source: String)
    case card(fallback: AxisFallback?)
    case missing
}

public enum ReferenceResolver {
    /// CLI axis flags win. Otherwise capture.json prefers height, then width.
    /// `--card` keeps a typed dimension only as the fallback.
    public static func resolve(cliHeight: Double?, cliWidth: Double?, useCard: Bool, capture: CaptureManifest?) -> ScalePlan {
        let typed = typedReference(cliHeight: cliHeight, cliWidth: cliWidth, capture: capture, cliOnly: false)
        let cliTyped = typedReference(cliHeight: cliHeight, cliWidth: cliWidth, capture: capture, cliOnly: true)
        if useCard {
            return .card(fallback: cliTyped ?? typed)
        }
        if let cliTyped {
            return .axis(cliTyped.axis, millimetres: cliTyped.millimetres, source: cliTyped.source)
        }
        if let typed {
            return .axis(typed.axis, millimetres: typed.millimetres, source: typed.source)
        }
        return .missing
    }

    public static let missingMessage = """
    שגיאה: אין ייחוס קנה מידה. העבירו --height-mm, --width-mm או --card, או הוסיפו מידות ב-capture.json. מודל בלי קנה מידה אינו שמיש לאריזה.
    Error: No scale reference. Pass --height-mm, --width-mm, or --card, or add dimensions to capture.json. An unscaled model is useless for packaging.
    """

    private static func typedReference(cliHeight: Double?, cliWidth: Double?, capture: CaptureManifest?, cliOnly: Bool) -> AxisFallback? {
        if let cliHeight, cliHeight > 0 {
            return AxisFallback(axis: .height, millimetres: cliHeight, source: "cli")
        }
        if let cliWidth, cliWidth > 0 {
            return AxisFallback(axis: .width, millimetres: cliWidth, source: "cli")
        }
        if cliOnly { return nil }
        if let height = capture?.heightMm, height > 0 {
            return AxisFallback(axis: .height, millimetres: height, source: "capture.json")
        }
        if let width = capture?.widthMm, width > 0 {
            return AxisFallback(axis: .width, millimetres: width, source: "capture.json")
        }
        return nil
    }
}

public struct ScaleSolution: Equatable, Sendable {
    public var factor: Double
    public var similarity: Similarity
    public var reference: ReportReference
    public var warnings: [String]
    public var scaledAxis: ScaleAxis?

    public init(
        factor: Double,
        similarity: Similarity,
        reference: ReportReference,
        warnings: [String],
        scaledAxis: ScaleAxis?
    ) {
        self.factor = factor
        self.similarity = similarity
        self.reference = reference
        self.warnings = warnings
        self.scaledAxis = scaledAxis
    }
}

public enum ScaleSolve {
    public static func solve(bounds: BoundingBox, plan: ScalePlan, cardMillimetresPerUnit: Double?) -> ScaleSolution? {
        switch plan {
        case .missing:
            return nil
        case .axis(let axis, let millimetres, let source):
            return axisSolution(bounds: bounds, axis: axis, millimetres: millimetres, source: source, warnings: [])
        case .card(let fallback):
            if let card = cardMillimetresPerUnit, card.isFinite, card > 0,
               let similarity = ModelScaler.similarity(bounds: bounds, factor: card) {
                return ScaleSolution(
                    factor: card,
                    similarity: similarity,
                    reference: ReportReference(
                        kind: "card",
                        millimetres: nil,
                        source: "poses",
                        cardWidthMm: CardScale.widthMm,
                        cardHeightMm: CardScale.heightMm
                    ),
                    warnings: [],
                    scaledAxis: nil
                )
            }
            guard let fallback else { return nil }
            let warning = bilingual(
                "אזהרה: שחזור קנה המידה מהכרטיס נכשל. משתמשים ב-\(fallback.axis.rawValue) \(formatMm(fallback.millimetres)) מ\"מ מ-\(fallback.source).",
                "Warning: Card scale failed. Using \(fallback.axis.rawValue) \(formatMm(fallback.millimetres)) mm from \(fallback.source)."
            )
            return axisSolution(
                bounds: bounds,
                axis: fallback.axis,
                millimetres: fallback.millimetres,
                source: fallback.source,
                warnings: [warning]
            )
        }
    }

    private static func axisSolution(
        bounds: BoundingBox,
        axis: ScaleAxis,
        millimetres: Double,
        source: String,
        warnings: [String]
    ) -> ScaleSolution? {
        guard let factor = ModelScaler.axisFactor(bounds: bounds, axis: axis, millimetres: millimetres),
              let similarity = ModelScaler.similarity(bounds: bounds, factor: factor) else {
            return nil
        }
        return ScaleSolution(
            factor: factor,
            similarity: similarity,
            reference: ReportReference(
                kind: axis.rawValue,
                millimetres: millimetres,
                source: source,
                cardWidthMm: nil,
                cardHeightMm: nil
            ),
            warnings: warnings,
            scaledAxis: axis
        )
    }

    private static func bilingual(_ he: String, _ en: String) -> String {
        he + "\n" + en
    }

    private static func formatMm(_ value: Double) -> String {
        String(format: "%.2f", value)
    }
}

public enum DimensionCheck {
    public static let toleranceMm = 5.0

    /// Compares capture.json M3 dimensions with the scaled box on axes that were not the scale reference.
    public static func warnings(
        after: BoundingBox,
        captureHeight: Double?,
        captureWidth: Double?,
        captureDepth: Double?,
        scaledAxis: ScaleAxis?
    ) -> [String] {
        var notes: [String] = []
        if scaledAxis != .height, let expected = captureHeight {
            notes.append(contentsOf: compare(axis: "height", measured: after.size.y, expected: expected))
        }
        if scaledAxis != .width, let expected = captureWidth {
            let measured = max(after.size.x, after.size.z)
            notes.append(contentsOf: compare(axis: "width", measured: measured, expected: expected))
        }
        if let expected = captureDepth {
            let measured = min(after.size.x, after.size.z)
            notes.append(contentsOf: compare(axis: "depth", measured: measured, expected: expected))
        }
        return notes
    }

    private static func compare(axis: String, measured: Double, expected: Double) -> [String] {
        guard measured.isFinite, expected.isFinite, expected > 0 else { return [] }
        let delta = abs(measured - expected)
        guard delta > toleranceMm else { return [] }
        return [bilingual(
            "אזהרה: אחרי קנה המידה, \(axis) הוא \(formatMm(measured)) מ\"מ והמידה מ-M3 היא \(formatMm(expected)) מ\"מ (הפרש \(formatMm(delta)) מ\"מ, מעל 5).",
            "Warning: After scaling, \(axis) is \(formatMm(measured)) mm and the M3 dimension is \(formatMm(expected)) mm (difference \(formatMm(delta)) mm, above 5)."
        )]
    }

    private static func formatMm(_ value: Double) -> String {
        String(format: "%.2f", value)
    }

    private static func bilingual(_ he: String, _ en: String) -> String {
        he + "\n" + en
    }
}

public enum MeshNormals {
    /// Area-weighted vertex normals. A vertex with no area stays zero.
    public static func generate(positions: [Vec3], indices: [UInt32]) -> [Vec3] {
        var accum = Array(repeating: Vec3.zero, count: positions.count)
        var triangle = 0
        while triangle + 2 < indices.count {
            let i0 = Int(indices[triangle])
            let i1 = Int(indices[triangle + 1])
            let i2 = Int(indices[triangle + 2])
            triangle += 3
            guard i0 < positions.count, i1 < positions.count, i2 < positions.count else { continue }
            let crossed = (positions[i1] - positions[i0]).cross(positions[i2] - positions[i0])
            accum[i0] = accum[i0] + crossed
            accum[i1] = accum[i1] + crossed
            accum[i2] = accum[i2] + crossed
        }
        return accum.map { $0.normalized() ?? .zero }
    }
}
