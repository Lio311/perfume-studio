import Foundation

/// How a surface is drawn. Glass finishes use `.blend` (glTF `alphaMode` BLEND).
public enum MeshAlphaMode: String, Equatable, Sendable {
    case opaque
    case blend
    case mask
}

/// PBR metallic-roughness material. `baseColor` is linear RGBA, alpha in `w`.
public struct MeshMaterial: Equatable, Sendable {
    public var baseColor: SIMD4<Float>
    public var metallic: Float
    public var roughness: Float
    public var alphaMode: MeshAlphaMode
    public var name: String?

    public init(
        baseColor: SIMD4<Float>,
        metallic: Float,
        roughness: Float,
        alphaMode: MeshAlphaMode,
        name: String? = nil
    ) {
        self.baseColor = baseColor
        self.metallic = metallic
        self.roughness = roughness
        self.alphaMode = alphaMode
        self.name = name
    }
}

public enum MeshRole: String, Equatable, Sendable, CaseIterable {
    case bottle, cap, pump, collar, box, label
}

/// Triangle mesh in metres, Y-up, right-handed. Positions, normals, and UVs are Float32.
public struct Mesh: Equatable, Sendable {
    public var positions: [SIMD3<Float>]
    public var normals: [SIMD3<Float>]
    public var uvs: [SIMD2<Float>]
    public var indices: [UInt32]
    public var material: MeshMaterial

    public init(
        positions: [SIMD3<Float>],
        normals: [SIMD3<Float>],
        uvs: [SIMD2<Float>],
        indices: [UInt32],
        material: MeshMaterial
    ) {
        self.positions = positions
        self.normals = normals
        self.uvs = uvs
        self.indices = indices
        self.material = material
    }

    public func glbMesh() -> GLBMesh {
        GLBMesh(
            positions: positions,
            normals: normals,
            uvs: uvs,
            indices: indices,
            material: GLBMaterial(
                baseColor: material.baseColor,
                metallic: material.metallic,
                roughness: material.roughness,
                alphaBlend: material.alphaMode == .blend,
                baseColorTexturePNG: nil
            )
        )
    }
}

public struct MeshPart: Equatable, Sendable {
    public var role: MeshRole
    public var mesh: Mesh

    public init(role: MeshRole, mesh: Mesh) {
        self.role = role
        self.mesh = mesh
    }
}
