import Foundation

public struct ExtractedMaterial: Equatable, Sendable {
    public var baseColor: SIMD4<Float>
    public var metallic: Float
    public var roughness: Float
    public var alphaBlend: Bool
    public var baseColorTexturePNG: Data?

    public init(
        baseColor: SIMD4<Float> = SIMD4<Float>(1, 1, 1, 1),
        metallic: Float = 0,
        roughness: Float = 1,
        alphaBlend: Bool = false,
        baseColorTexturePNG: Data? = nil
    ) {
        self.baseColor = baseColor
        self.metallic = metallic
        self.roughness = roughness
        self.alphaBlend = alphaBlend
        self.baseColorTexturePNG = baseColorTexturePNG
    }
}

/// Neutral mesh produced by the ModelIO extractor. Positions are in millimetres after scaling.
public struct ExtractedMesh: Equatable, Sendable {
    public var positions: [SIMD3<Float>]
    public var normals: [SIMD3<Float>]
    public var uvs: [SIMD2<Float>]
    public var indices: [UInt32]
    public var material: ExtractedMaterial

    public init(
        positions: [SIMD3<Float>],
        normals: [SIMD3<Float>],
        uvs: [SIMD2<Float>],
        indices: [UInt32],
        material: ExtractedMaterial
    ) {
        self.positions = positions
        self.normals = normals
        self.uvs = uvs
        self.indices = indices
        self.material = material
    }
}

/// The PackKit `GLBWriter` shape, kept here so the adapter and the tests share one mapping.
public struct GLBMeshDraft: Equatable, Sendable {
    public var positions: [SIMD3<Float>]
    public var normals: [SIMD3<Float>]
    public var uvs: [SIMD2<Float>]
    public var indices: [UInt32]
    public var baseColor: SIMD4<Float>
    public var metallic: Float
    public var roughness: Float
    public var alphaBlend: Bool
    public var baseColorTexturePNG: Data?

    public init(
        positions: [SIMD3<Float>],
        normals: [SIMD3<Float>],
        uvs: [SIMD2<Float>],
        indices: [UInt32],
        baseColor: SIMD4<Float>,
        metallic: Float,
        roughness: Float,
        alphaBlend: Bool,
        baseColorTexturePNG: Data?
    ) {
        self.positions = positions
        self.normals = normals
        self.uvs = uvs
        self.indices = indices
        self.baseColor = baseColor
        self.metallic = metallic
        self.roughness = roughness
        self.alphaBlend = alphaBlend
        self.baseColorTexturePNG = baseColorTexturePNG
    }
}

public protocol GLBEncoding {
    func encode(meshes: [ExtractedMesh], generator: String) throws -> Data
}

public enum GLBDraft {
    public static func drafts(from meshes: [ExtractedMesh]) -> [GLBMeshDraft] {
        meshes.map { mesh in
            GLBMeshDraft(
                positions: mesh.positions,
                normals: mesh.normals,
                uvs: mesh.uvs,
                indices: mesh.indices,
                baseColor: mesh.material.baseColor,
                metallic: mesh.material.metallic,
                roughness: mesh.material.roughness,
                alphaBlend: mesh.material.alphaBlend,
                baseColorTexturePNG: mesh.material.baseColorTexturePNG
            )
        }
    }
}

public enum GLBAvailabilityNote {
    public static let message = """
    GLB לא נכתב: נדרש GLBWriter מ-PackKit (M7a). בינתיים נכתבו USDZ ו-OBJ. אחרי המיזוג של M7a, הפעילו את PACKKIT_GLB ב-Package.swift.
    GLB was not written: PackKit GLBWriter (M7a) is required. USDZ and OBJ were written. After M7a merges, turn on PACKKIT_GLB in Package.swift.
    """
}

public enum MeshPositions {
    public static func vectors(_ positions: [SIMD3<Float>]) -> [Vec3] {
        positions.map { Vec3(Double($0.x), Double($0.y), Double($0.z)) }
    }

    public static func simd(_ positions: [Vec3]) -> [SIMD3<Float>] {
        positions.map { SIMD3<Float>(Float($0.x), Float($0.y), Float($0.z)) }
    }

    public static func bounds(of meshes: [ExtractedMesh]) -> BoundingBox? {
        BoundingBox.enclosing(meshes.flatMap { vectors($0.positions) })
    }

    public static func applying(_ similarity: Similarity, to meshes: [ExtractedMesh]) -> [ExtractedMesh] {
        meshes.map { mesh in
            var copy = mesh
            copy.positions = simd(ModelScaler.apply(positions: vectors(mesh.positions), similarity: similarity))
            return copy
        }
    }
}
