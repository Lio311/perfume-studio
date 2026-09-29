import Foundation
import ReconstructCore

#if PACKKIT_GLB
import PackKit

/// Maps `ExtractedMesh` onto PackKit's `GLBWriter` once M7a has merged.
public struct PackKitGLBEncoder: GLBEncoding {
    public init() {}

    public func encode(meshes: [ExtractedMesh], generator: String) throws -> Data {
        let payload = GLBDraft.drafts(from: meshes).map { draft in
            GLBMesh(
                positions: draft.positions,
                normals: draft.normals,
                uvs: draft.uvs,
                indices: draft.indices,
                material: GLBMaterial(
                    baseColor: draft.baseColor,
                    metallic: draft.metallic,
                    roughness: draft.roughness,
                    alphaBlend: draft.alphaBlend,
                    baseColorTexturePNG: draft.baseColorTexturePNG
                )
            )
        }
        return try GLBWriter.write(meshes: payload, generator: generator)
    }
}
#endif
