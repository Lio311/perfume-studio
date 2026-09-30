import Foundation

extension PackKit {
    /// Mesh the pack and write a binary glTF. Generator defaults to `PerfumeStudio PackKit`.
    public static func exportGLB(_ pack: SupplierPack, generator: String = "PerfumeStudio PackKit") throws -> Data {
        try GLBWriter.write(meshes: MeshBuilder.build(pack).map { $0.mesh.glbMesh() }, generator: generator)
    }

    /// Mesh one part and write a binary glTF.
    public static func exportGLB(_ part: SupplierPart, generator: String = "PerfumeStudio PackKit") throws -> Data {
        try GLBWriter.write(meshes: MeshBuilder.build(part).map { $0.mesh.glbMesh() }, generator: generator)
    }
}
