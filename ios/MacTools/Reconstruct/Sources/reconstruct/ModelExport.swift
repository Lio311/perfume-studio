import Foundation
import ReconstructCore

#if os(macOS)
import CoreGraphics
import ModelIO
import simd

struct LoadedMesh {
    var mesh: ExtractedMesh
    var material: MDLMaterial?
}

enum ModelExportError: Error {
    case message(String)
}

enum ModelExport {
    static func load(usdz: URL) throws -> [LoadedMesh] {
        guard FileManager.default.fileExists(atPath: usdz.path) else {
            throw ModelExportError.message(bilingual(
                "שגיאה: קובץ ה-USDZ לא נמצא: \(usdz.path)",
                "Error: USDZ file was not found: \(usdz.path)"
            ))
        }
        let asset = MDLAsset(url: usdz)
        asset.loadTextures()
        var loaded: [LoadedMesh] = []
        let count = asset.count
        for index in 0..<count {
            guard let object = asset.object(at: index) else { continue }
            walk(object, transform: matrix_identity_float4x4, into: &loaded)
        }
        let triangles = loaded.reduce(0) { $0 + $1.mesh.indices.count / 3 }
        guard triangles > 0 else {
            throw ModelExportError.message(bilingual(
                "שגיאה: לא נמצאה גאומטריה ב-USDZ.",
                "Error: The USDZ file has no triangle geometry."
            ))
        }
        return loaded
    }

    static func write(_ meshes: [LoadedMesh], usdz: URL, obj: URL) throws {
        let asset = makeAsset(meshes)
        do {
            try asset.export(to: usdz)
        } catch {
            throw ModelExportError.message(bilingual(
                "שגיאה: ייצוא USDZ נכשל: \(usdz.path)",
                "Error: USDZ export failed: \(usdz.path)"
            ) + "\n" + error.localizedDescription)
        }
        do {
            try makeAsset(meshes).export(to: obj)
        } catch {
            throw ModelExportError.message(bilingual(
                "שגיאה: ייצוא OBJ נכשל: \(obj.path)",
                "Error: OBJ export failed: \(obj.path)"
            ) + "\n" + error.localizedDescription)
        }
    }

    private static func makeAsset(_ meshes: [LoadedMesh]) -> MDLAsset {
        let allocator = MDLMeshBufferDataAllocator()
        let asset = MDLAsset(bufferAllocator: allocator)
        for loaded in meshes {
            asset.add(makeMesh(loaded, allocator: allocator))
        }
        return asset
    }

    private static func walk(_ object: MDLObject, transform: simd_float4x4, into loaded: inout [LoadedMesh]) {
        let local = object.transform?.matrix ?? matrix_identity_float4x4
        let world = simd_mul(transform, local)
        if let mesh = object as? MDLMesh {
            loaded.append(contentsOf: extract(mesh, world: world))
        }
        for child in object.children.objects {
            walk(child, transform: world, into: &loaded)
        }
    }

    private static func extract(_ mesh: MDLMesh, world: simd_float4x4) -> [LoadedMesh] {
        guard mesh.vertexCount > 0,
              let positionAttribute = mesh.vertexAttributeData(forAttributeNamed: MDLVertexAttributePosition),
              let localPositions = readVectors(positionAttribute, count: mesh.vertexCount, components: 3)
        else { return [] }

        let positions = localPositions.map { transformPoint(world, $0) }
        let localNormals = mesh.vertexAttributeData(forAttributeNamed: MDLVertexAttributeNormal)
            .flatMap { readVectors($0, count: mesh.vertexCount, components: 3) }
        let normals: [SIMD3<Float>]
        if let localNormals, localNormals.count == positions.count {
            normals = localNormals.map { transformNormal(world, $0) }
        } else {
            normals = []
        }
        let uvs = mesh.vertexAttributeData(forAttributeNamed: MDLVertexAttributeTextureCoordinate)
            .flatMap { readUVs($0, count: mesh.vertexCount) } ?? Array(repeating: SIMD2<Float>(0, 0), count: positions.count)

        guard let submeshes = mesh.submeshes, !submeshes.isEmpty else { return [] }
        var extracted: [LoadedMesh] = []
        for submesh in submeshes {
            guard let indices = triangleIndices(submesh), !indices.isEmpty else { continue }
            let resolvedNormals: [SIMD3<Float>]
            if normals.count == positions.count {
                resolvedNormals = normals
            } else {
                let generated = MeshNormals.generate(
                    positions: positions.map { Vec3(Double($0.x), Double($0.y), Double($0.z)) },
                    indices: indices
                )
                resolvedNormals = generated.map { SIMD3<Float>(Float($0.x), Float($0.y), Float($0.z)) }
            }
            let (color, png) = readMaterial(submesh.material)
            let metallic = submesh.material?.property(with: .metallic)?.floatValue ?? 0
            let roughness = submesh.material?.property(with: .roughness)?.floatValue ?? 1
            extracted.append(LoadedMesh(
                mesh: ExtractedMesh(
                    positions: positions,
                    normals: resolvedNormals,
                    uvs: uvs,
                    indices: indices,
                    material: ExtractedMaterial(
                        baseColor: color,
                        metallic: metallic,
                        roughness: roughness,
                        alphaBlend: color.w < 0.999,
                        baseColorTexturePNG: png
                    )
                ),
                material: submesh.material
            ))
        }
        return extracted
    }

    private static func makeMesh(_ loaded: LoadedMesh, allocator: MDLMeshBufferDataAllocator) -> MDLMesh {
        let mesh = loaded.mesh
        let count = mesh.positions.count
        var floats: [Float] = []
        floats.reserveCapacity(count * 8)
        for index in 0..<count {
            let position = mesh.positions[index]
            let normal = index < mesh.normals.count ? mesh.normals[index] : SIMD3<Float>(0, 1, 0)
            let uv = index < mesh.uvs.count ? mesh.uvs[index] : SIMD2<Float>(0, 0)
            floats.append(contentsOf: [position.x, position.y, position.z, normal.x, normal.y, normal.z, uv.x, uv.y])
        }
        let vertexData = floats.withUnsafeBufferPointer { Data(buffer: $0) }
        let vertexBuffer = allocator.newBuffer(with: vertexData, type: .vertex)
        let descriptor = MDLVertexDescriptor()
        descriptor.addOrReplaceAttribute(MDLVertexAttribute(
            name: MDLVertexAttributePosition,
            format: .float3,
            offset: 0,
            bufferIndex: 0
        ))
        descriptor.addOrReplaceAttribute(MDLVertexAttribute(
            name: MDLVertexAttributeNormal,
            format: .float3,
            offset: MemoryLayout<Float>.stride * 3,
            bufferIndex: 0
        ))
        descriptor.addOrReplaceAttribute(MDLVertexAttribute(
            name: MDLVertexAttributeTextureCoordinate,
            format: .float2,
            offset: MemoryLayout<Float>.stride * 6,
            bufferIndex: 0
        ))
        descriptor.layouts[0] = MDLVertexBufferLayout(stride: MemoryLayout<Float>.stride * 8)

        let indexData = mesh.indices.withUnsafeBufferPointer { Data(buffer: $0) }
        let indexBuffer = allocator.newBuffer(with: indexData, type: .index)
        let material = loaded.material ?? defaultMaterial(for: mesh.material)
        let submesh = MDLSubmesh(
            indexBuffer: indexBuffer,
            indexCount: mesh.indices.count,
            indexType: .uInt32,
            geometryType: .triangles,
            material: material
        )
        return MDLMesh(
            vertexBuffers: [vertexBuffer],
            vertexCount: count,
            descriptor: descriptor,
            submeshes: [submesh]
        )
    }

    private static func defaultMaterial(for material: ExtractedMaterial) -> MDLMaterial {
        let scattering = MDLPhysicallyPlausibleScatteringFunction()
        let mdl = MDLMaterial(name: "reconstruct", scatteringFunction: scattering)
        let color = CGColor(
            srgbRed: CGFloat(material.baseColor.x),
            green: CGFloat(material.baseColor.y),
            blue: CGFloat(material.baseColor.z),
            alpha: CGFloat(material.baseColor.w)
        )
        mdl.setProperty(MDLMaterialProperty(name: "baseColor", semantic: .baseColor, color: color))
        if let metallic = mdl.property(with: .metallic) {
            metallic.floatValue = material.metallic
        }
        if let roughness = mdl.property(with: .roughness) {
            roughness.floatValue = material.roughness
        }
        return mdl
    }

    private static func readMaterial(_ material: MDLMaterial?) -> (SIMD4<Float>, Data?) {
        guard let property = material?.property(with: .baseColor) else {
            return (SIMD4<Float>(1, 1, 1, 1), nil)
        }
        var color = SIMD4<Float>(1, 1, 1, 1)
        switch property.type {
        case .float4:
            let value = property.float4Value
            color = SIMD4(value.x, value.y, value.z, value.w)
        case .float3:
            let value = property.float3Value
            color = SIMD4(value.x, value.y, value.z, 1)
        case .color:
            if let cg = property.color, let components = cg.components, components.count >= 3 {
                let alpha: CGFloat = components.count > 3 ? components[3] : 1
                color = SIMD4(Float(components[0]), Float(components[1]), Float(components[2]), Float(alpha))
            }
        default:
            break
        }
        let png = property.textureSamplerValue?.texture.flatMap(pngData)
        return (color, png)
    }

    private static func pngData(_ texture: MDLTexture) -> Data? {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("reconstruct-\(UUID().uuidString).png")
        defer { try? FileManager.default.removeItem(at: url) }
        guard texture.write(to: url) else { return nil }
        return try? Data(contentsOf: url)
    }

    private static func triangleIndices(_ submesh: MDLSubmesh) -> [UInt32]? {
        guard let raw = readIndices(submesh) else { return nil }
        switch submesh.geometryType {
        case .triangles:
            return raw
        case .triangleStrips:
            guard raw.count >= 3 else { return [] }
            var triangles: [UInt32] = []
            for index in 0..<(raw.count - 2) {
                let a = raw[index]
                let b = raw[index + 1]
                let c = raw[index + 2]
                if a == b || b == c || a == c { continue }
                if index % 2 == 0 {
                    triangles.append(contentsOf: [a, b, c])
                } else {
                    triangles.append(contentsOf: [b, a, c])
                }
            }
            return triangles
        default:
            return []
        }
    }

    private static func readIndices(_ submesh: MDLSubmesh) -> [UInt32]? {
        let count = submesh.indexCount
        if count == 0 { return [] }
        let bytes = submesh.indexBuffer.map().bytes
        var values: [UInt32] = []
        values.reserveCapacity(count)
        switch submesh.indexType {
        case .uInt32:
            let buffer = bytes.bindMemory(to: UInt32.self, capacity: count)
            for index in 0..<count { values.append(buffer[index]) }
        case .uInt16:
            let buffer = bytes.bindMemory(to: UInt16.self, capacity: count)
            for index in 0..<count { values.append(UInt32(buffer[index])) }
        case .uInt8:
            let buffer = bytes.bindMemory(to: UInt8.self, capacity: count)
            for index in 0..<count { values.append(UInt32(buffer[index])) }
        default:
            return nil
        }
        return values
    }

    private static func readVectors(_ attribute: MDLVertexAttributeData, count: Int, components: Int) -> [SIMD3<Float>]? {
        let available: Int
        switch attribute.format {
        case .float3: available = 3
        case .float4: available = 4
        default: return nil
        }
        guard available >= components else { return nil }
        var vectors: [SIMD3<Float>] = []
        vectors.reserveCapacity(count)
        for index in 0..<count {
            let pointer = attribute.dataStart.advanced(by: index * attribute.stride).bindMemory(to: Float.self, capacity: available)
            vectors.append(SIMD3(pointer[0], pointer[1], pointer[2]))
        }
        return vectors
    }

    private static func readUVs(_ attribute: MDLVertexAttributeData, count: Int) -> [SIMD2<Float>]? {
        let available: Int
        switch attribute.format {
        case .float2: available = 2
        case .float3: available = 3
        case .float4: available = 4
        default: return nil
        }
        var values: [SIMD2<Float>] = []
        values.reserveCapacity(count)
        for index in 0..<count {
            let pointer = attribute.dataStart.advanced(by: index * attribute.stride).bindMemory(to: Float.self, capacity: available)
            values.append(SIMD2(pointer[0], pointer[1]))
        }
        return values
    }

    private static func transformPoint(_ matrix: simd_float4x4, _ point: SIMD3<Float>) -> SIMD3<Float> {
        let transformed = matrix * SIMD4<Float>(point.x, point.y, point.z, 1)
        return SIMD3(transformed.x, transformed.y, transformed.z)
    }

    private static func transformNormal(_ matrix: simd_float4x4, _ normal: SIMD3<Float>) -> SIMD3<Float> {
        let upper = simd_float3x3(columns: (
            SIMD3(matrix.columns.0.x, matrix.columns.0.y, matrix.columns.0.z),
            SIMD3(matrix.columns.1.x, matrix.columns.1.y, matrix.columns.1.z),
            SIMD3(matrix.columns.2.x, matrix.columns.2.y, matrix.columns.2.z)
        ))
        let transformed = simd_inverse(simd_transpose(upper)) * normal
        let length = simd_length(transformed)
        guard length.isFinite, length > 1e-8 else { return normal }
        return transformed / length
    }
}

private func bilingual(_ he: String, _ en: String) -> String {
    he + "\n" + en
}
#endif
