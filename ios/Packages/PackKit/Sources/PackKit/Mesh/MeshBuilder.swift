import Foundation

/// Builds part meshes in metres, Y-up, origin at the base centre.
///
/// Bottle, cap, pump, and collar are revolutions of the M3a lathe (42 samples when the
/// part has none). They stack on the bottle the way `computeFit` places catalog parts,
/// simplified because a measured part has no ferrule table:
/// - Bottle base is y = 0. The web does the same (`BottlePart` home `[0, 0, 0]`).
/// - Collar top is flush with the bottle lip (the neck top). The web sinks the collar
///   by an overlap of about `0.72 * collarHeight` (`collarBottom = lip - overlap` in
///   `src/model/fit.ts`). Without a neck finish length, the collar occupies the top of
///   the bottle instead of floating on a pedestal.
/// - Cap and pump sit on the neck top (`y = bottle height`). The web seats the cap at
///   `collarTop - 0.45` and a crimp pump on the lip (`pumpBase = lip`). Measured pumps
///   use the crimp seat. The 0.45 mm cap bite is omitted so a stacked bottle+cap is
///   exactly the sum of the two heights.
/// - A label on a pack with a bottle is a band on +Z, 0.2 mm off the glass. Alone, it is a plane.
/// - The carton sits beside the bottle by `bottleWidth/2 + boxWidth/2 + 32` mm on −X,
///   the gap `Assembly.tsx` uses for the `together` stage. A lone box stays at the origin.
public enum MeshBuilder {
    /// Radial segments. `src/import/lathe.ts`: `new THREE.LatheGeometry(points, 128)`.
    public static let latheSegments = LatheMesh.segments

    public struct Options: Equatable, Sendable {
        public var cornerRadiusMm: Double?
        /// Radial gap between a curved label and the bottle, in millimetres.
        public var labelOffsetMm: Double

        public init(cornerRadiusMm: Double? = nil, labelOffsetMm: Double = 0.2) {
            self.cornerRadiusMm = cornerRadiusMm
            self.labelOffsetMm = labelOffsetMm
        }
    }

    /// `min(2 mm, 5% of the short side)`.
    public static func defaultCornerRadiusMm(widthMm: Double, depthMm: Double) -> Double {
        let short = max(0, min(widthMm, depthMm))
        return min(2, 0.05 * short)
    }

    public static func build(_ part: SupplierPart, options: Options = Options()) -> [MeshPart] {
        let role = MeshRole(rawValue: part.kind.rawValue) ?? .bottle
        let material = FinishMapping.material(colorHex: part.color, appearance: part.appearance, name: part.name)
        let mesh: Mesh
        switch part.kind {
        case .bottle, .cap, .pump, .collar:
            mesh = LatheMesh.revolve(
                profile: part.lathe ?? [],
                widthMm: part.dimensions.widthMm,
                heightMm: part.dimensions.heightMm,
                material: material
            )
        case .box:
            let radius = options.cornerRadiusMm ?? defaultCornerRadiusMm(
                widthMm: part.dimensions.widthMm,
                depthMm: part.dimensions.depthMm
            )
            mesh = RoundedBoxMesh.mesh(
                widthMm: part.dimensions.widthMm,
                depthMm: part.dimensions.depthMm,
                heightMm: part.dimensions.heightMm,
                cornerRadiusMm: radius,
                material: material
            )
        case .label:
            mesh = LabelMesh.plane(
                widthMm: part.dimensions.widthMm,
                heightMm: part.dimensions.heightMm,
                offsetMm: options.labelOffsetMm,
                material: material
            )
        }
        return [MeshPart(role: role, mesh: mesh)]
    }

    public static func build(_ pack: SupplierPack, options: Options = Options()) -> [MeshPart] {
        let bottle = pack.parts.first { $0.kind == .bottle }
        let bottleHeight = bottle?.dimensions.heightMm ?? 0
        let bottleWidth = bottle?.dimensions.widthMm ?? 0
        return pack.parts.map { part in
            if part.kind == .label, let bottle {
                let material = FinishMapping.material(colorHex: part.color, appearance: part.appearance, name: part.name)
                let band = LabelMesh.band(
                    bottleWidthMm: bottle.dimensions.widthMm,
                    bottleHeightMm: bottle.dimensions.heightMm,
                    profile: bottle.lathe ?? [],
                    labelWidthMm: part.dimensions.widthMm,
                    labelHeightMm: part.dimensions.heightMm,
                    offsetMm: options.labelOffsetMm,
                    material: material
                )
                return MeshPart(role: .label, mesh: band)
            }
            let local = build(part, options: options)[0]
            let shift = placement(of: part, bottleHeightMm: bottleHeight, bottleWidthMm: bottleWidth)
            return MeshPart(role: local.role, mesh: translated(local.mesh, millimetres: shift))
        }
    }

    private static func placement(of part: SupplierPart, bottleHeightMm: Double, bottleWidthMm: Double) -> SIMD3<Double> {
        switch part.kind {
        case .bottle, .label:
            return SIMD3(0, 0, 0)
        case .collar:
            return SIMD3(0, max(0, bottleHeightMm - part.dimensions.heightMm), 0)
        case .cap, .pump:
            return SIMD3(0, bottleHeightMm, 0)
        case .box:
            guard bottleWidthMm > 0 else { return SIMD3(0, 0, 0) }
            let x = -(bottleWidthMm / 2 + part.dimensions.widthMm / 2 + 32)
            return SIMD3(x, 0, 0)
        }
    }

    private static func translated(_ mesh: Mesh, millimetres offset: SIMD3<Double>) -> Mesh {
        let delta = SIMD3<Float>(Float(offset.x / 1000), Float(offset.y / 1000), Float(offset.z / 1000))
        guard delta != .zero else { return mesh }
        var copy = mesh
        copy.positions = mesh.positions.map { $0 + delta }
        return copy
    }
}
