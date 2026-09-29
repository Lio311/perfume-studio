import Foundation

public enum MeasureAxis: String, Codable, Equatable, Sendable {
    case height
    case width
}

public enum AutoScaleSource: String, Codable, Equatable, Sendable {
    case lidar
    case objectCapture
}

/// One entry in the built-in coin table.
/// Diameters are the Bank of Israel figures for the new-shekel series. To verify before use in the field.
public struct CoinSpec: Equatable, Sendable {
    public var id: String
    public var nameEn: String
    public var nameHe: String
    /// Nominal diameter in millimetres. To verify.
    public var diameterMm: Double

    public init(id: String, nameEn: String, nameHe: String, diameterMm: Double) {
        self.id = id
        self.nameEn = nameEn
        self.nameHe = nameHe
        self.diameterMm = diameterMm
    }
}

public enum ScaleReference: Equatable, Sendable {
    /// Four image corners, top-left, top-right, bottom-right, bottom-left.
    /// `size` defaults to ISO/IEC 7810 ID-1 (85.60 × 53.98 mm). A printed scan card passes its own size.
    case card(corners: [SIMD2<Double>], size: CardReference)
    case coin(p1: SIMD2<Double>, p2: SIMD2<Double>, diameterMm: Double)
    case ruler(p1: SIMD2<Double>, p2: SIMD2<Double>, mm: Double)
    case custom(p1: SIMD2<Double>, p2: SIMD2<Double>, mm: Double)
    case typedDimension(axis: MeasureAxis, mm: Double)
    /// Allowed only for a bottle or a box whose measured size is at least 80 mm. `ScaleRule` enforces that.
    case auto(source: AutoScaleSource, mmPerPx: Double)

    public static func card(_ corners: [SIMD2<Double>], size: CardReference = .id1) -> ScaleReference {
        .card(corners: corners, size: size)
    }

    public static func coin(_ spec: CoinSpec, p1: SIMD2<Double>, p2: SIMD2<Double>) -> ScaleReference {
        .coin(p1: p1, p2: p2, diameterMm: spec.diameterMm)
    }
}

public enum CoinTable {
    /// New-shekel series diameters published by the Bank of Israel. To verify.
    /// 10 / 5 / 1 agora and ½ new shekel (50 agorot), plus ₪1 / ₪2 / ₪5 / ₪10.
    /// 1 agora was withdrawn in 1991 and 5 agorot in 2008; they stay in the table so an old coin can still be named.
    public static let coins: [CoinSpec] = [
        CoinSpec(id: "ils-10-agorot", nameEn: "10 agorot", nameHe: "10 אגורות", diameterMm: 22),
        CoinSpec(id: "ils-5-agorot", nameEn: "5 agorot", nameHe: "5 אגורות", diameterMm: 19.5),
        CoinSpec(id: "ils-1-agora", nameEn: "1 agora", nameHe: "1 אגורה", diameterMm: 17),
        CoinSpec(id: "ils-50-agorot", nameEn: "1/2 new shekel", nameHe: "½ שקל חדש", diameterMm: 26),
        CoinSpec(id: "ils-1", nameEn: "1 new shekel", nameHe: "שקל חדש 1", diameterMm: 18),
        CoinSpec(id: "ils-2", nameEn: "2 new shekels", nameHe: "2 שקלים חדשים", diameterMm: 21.6),
        CoinSpec(id: "ils-5", nameEn: "5 new shekels", nameHe: "5 שקלים חדשים", diameterMm: 24),
        CoinSpec(id: "ils-10", nameEn: "10 new shekels", nameHe: "10 שקלים חדשים", diameterMm: 23),
    ]

    public static func coin(id: String) -> CoinSpec? {
        coins.first { $0.id == id }
    }
}
