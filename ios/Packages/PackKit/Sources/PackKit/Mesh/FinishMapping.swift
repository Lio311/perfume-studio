import Foundation

/// Colour hex plus finish/gloss → metallic-roughness.
///
/// Finish numbers come from the web renderer:
/// - metalness / roughness: `FinishMaterial` in `src/scene/materials.tsx`
///   (metal 1 / 0.22, matte black 0 / 0.68, wood 0 / 0.7, other solids 0 / 0.84).
/// - glass roughness: `computeGlassProps` in `src/model/materials.ts`
///   (clear 0.015, frosted 0.34, tinted 0.05).
/// - glass alpha: `materialOpacity = 0.08 + t * 0.92` with the default slider
///   `t` from `GLASS_FINISH_DEFAULTS` (clear 0.14, frosted 0.35, tinted 0.2).
///
/// `appearance.finish` wins over `appearance.gloss`. Gloss values that the
/// renderer does not branch on (`satin`) use the nearest documented roughness.
/// Schema enums: `appearance.finish` and `appearance.gloss` in `supplier-pack.schema.json`,
/// matching `FinishId` in `src/model/types.ts`.
public enum FinishMapping {
    public struct Factors: Equatable, Sendable {
        public var metallic: Float
        public var roughness: Float
        public var alpha: Float
        public var alphaMode: MeshAlphaMode

        public init(metallic: Float, roughness: Float, alpha: Float, alphaMode: MeshAlphaMode) {
            self.metallic = metallic
            self.roughness = roughness
            self.alpha = alpha
            self.alphaMode = alphaMode
        }
    }

    public static let clearAlpha: Float = 0.08 + 0.14 * 0.92
    public static let frostedAlpha: Float = 0.08 + 0.35 * 0.92
    public static let tintedAlpha: Float = 0.08 + 0.20 * 0.92

    /// Fallback swatches from `FINISHES` in `src/model/materials.ts`, used when `color` is not `#rrggbb`.
    public static let defaultHex: [String: String] = [
        "clear": "#f4f0e8",
        "frosted": "#f2f2f0",
        "tinted": "#6e857c",
        "gold": "#D6B26A",
        "silver": "#d5d8de",
        "rose": "#e4b7ae",
        "matteBlack": "#141414",
        "wood": "#8a5a3a",
        "leather": "#6b3c32",
    ]

    public static func factors(finish: String?, gloss: String?) -> Factors {
        if let finish, let mapped = finishFactors[finish] {
            return mapped
        }
        if let gloss, let mapped = glossFactors[gloss] {
            return mapped
        }
        return Factors(metallic: 0, roughness: 0.84, alpha: 1, alphaMode: .opaque)
    }

    public static func material(colorHex: String, appearance: Appearance?, name: String? = nil) -> MeshMaterial {
        let surface = factors(finish: appearance?.finish, gloss: appearance?.gloss)
        let rgb = parseHex(colorHex)
            ?? appearance?.finish.flatMap { defaultHex[$0] }.flatMap(parseHex)
            ?? SIMD3<Float>(1, 1, 1)
        return MeshMaterial(
            baseColor: SIMD4(rgb.x, rgb.y, rgb.z, surface.alpha),
            metallic: surface.metallic,
            roughness: surface.roughness,
            alphaMode: surface.alphaMode,
            name: name ?? appearance?.finish ?? appearance?.gloss
        )
    }

    public static func parseHex(_ text: String) -> SIMD3<Float>? {
        var hex = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard hex.count == 6, let value = UInt32(hex, radix: 16) else { return nil }
        return SIMD3(
            Float((value >> 16) & 0xff) / 255,
            Float((value >> 8) & 0xff) / 255,
            Float(value & 0xff) / 255
        )
    }

    private static let clear = Factors(metallic: 0, roughness: 0.015, alpha: clearAlpha, alphaMode: .blend)
    private static let frosted = Factors(metallic: 0, roughness: 0.34, alpha: frostedAlpha, alphaMode: .blend)
    private static let tinted = Factors(metallic: 0, roughness: 0.05, alpha: tintedAlpha, alphaMode: .blend)
    private static let metal = Factors(metallic: 1, roughness: 0.22, alpha: 1, alphaMode: .opaque)

    private static let finishFactors: [String: Factors] = [
        "clear": clear,
        "frosted": frosted,
        "tinted": tinted,
        "gold": metal,
        "silver": metal,
        "rose": metal,
        "matteBlack": Factors(metallic: 0, roughness: 0.68, alpha: 1, alphaMode: .opaque),
        "wood": Factors(metallic: 0, roughness: 0.7, alpha: 1, alphaMode: .opaque),
        "leather": Factors(metallic: 0, roughness: 0.84, alpha: 1, alphaMode: .opaque),
    ]

    /// `gloss` is the schema surface class. `satin` is not a branch in `FinishMaterial`;
    /// 0.45 sits between board gloss (0.16 in `boardSurface`) and matte black (0.68).
    private static let glossFactors: [String: Factors] = [
        "matte": Factors(metallic: 0, roughness: 0.68, alpha: 1, alphaMode: .opaque),
        "satin": Factors(metallic: 0, roughness: 0.45, alpha: 1, alphaMode: .opaque),
        "gloss": Factors(metallic: 0, roughness: 0.16, alpha: 1, alphaMode: .opaque),
        "metallic": metal,
        "frosted": frosted,
        "transparent": clear,
    ]
}
