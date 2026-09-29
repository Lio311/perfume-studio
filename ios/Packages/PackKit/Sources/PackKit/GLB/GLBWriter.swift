import Foundation

public enum GLBWriterError: Error, Equatable {
    case noMeshes
    case invalidMesh(String)
}

/// PBR material stored on a `GLBMesh`. `baseColorTexturePNG` is an optional embedded PNG
/// (glTF image bufferView, `mimeType` `image/png`) so a photogrammetry mesh can carry a texture.
public struct GLBMaterial: Equatable, Sendable {
    public var baseColor: SIMD4<Float>
    public var metallic: Float
    public var roughness: Float
    public var alphaBlend: Bool
    public var baseColorTexturePNG: Data?

    public init(
        baseColor: SIMD4<Float>,
        metallic: Float,
        roughness: Float,
        alphaBlend: Bool,
        baseColorTexturePNG: Data? = nil
    ) {
        self.baseColor = baseColor
        self.metallic = metallic
        self.roughness = roughness
        self.alphaBlend = alphaBlend
        self.baseColorTexturePNG = baseColorTexturePNG
    }
}

/// One glTF mesh primitive.
///
/// Vectors are packed SIMD values, not flat `[Float]` arrays:
/// `positions` and `normals` are `[SIMD3<Float>]` (xyz), `uvs` are `[SIMD2<Float>]` (uv).
/// `GLBWriter` stores them as Float32 (`componentType` 5126) and indices as UInt32 (5125).
public struct GLBMesh: Equatable, Sendable {
    public var positions: [SIMD3<Float>]
    public var normals: [SIMD3<Float>]
    public var uvs: [SIMD2<Float>]
    public var indices: [UInt32]
    public var material: GLBMaterial

    public init(
        positions: [SIMD3<Float>],
        normals: [SIMD3<Float>],
        uvs: [SIMD2<Float>],
        indices: [UInt32],
        material: GLBMaterial
    ) {
        self.positions = positions
        self.normals = normals
        self.uvs = uvs
        self.indices = indices
        self.material = material
    }
}

/// glTF 2.0 binary (`.glb`): 12-byte header, JSON chunk padded with spaces, BIN chunk padded with zeros.
public enum GLBWriter {
    public static func write(meshes: [GLBMesh], generator: String = "PerfumeStudio PackKit") throws -> Data {
        guard !meshes.isEmpty else { throw GLBWriterError.noMeshes }
        for (index, mesh) in meshes.enumerated() {
            try validate(mesh, index: index)
        }

        var bin = Data()
        var bufferViews: [[String: Any]] = []
        var accessors: [[String: Any]] = []
        var images: [[String: Any]] = []
        var textures: [[String: Any]] = []
        var materials: [[String: Any]] = []
        var gltfMeshes: [[String: Any]] = []
        var nodes: [[String: Any]] = []

        func align() {
            let remainder = bin.count % 4
            if remainder != 0 {
                bin.append(contentsOf: repeatElement(UInt8(0), count: 4 - remainder))
            }
        }

        func addView(bytes: Data, target: Int?) -> Int {
            align()
            let offset = bin.count
            bin.append(bytes)
            var view: [String: Any] = [
                "buffer": 0,
                "byteOffset": offset,
                "byteLength": bytes.count,
            ]
            if let target { view["target"] = target }
            bufferViews.append(view)
            return bufferViews.count - 1
        }

        var samplerAdded = false
        for (index, mesh) in meshes.enumerated() {
            let positionView = addView(bytes: vec3Bytes(mesh.positions), target: 34962)
            let (minPosition, maxPosition) = bounds(mesh.positions)
            accessors.append([
                "bufferView": positionView,
                "byteOffset": 0,
                "componentType": 5126,
                "count": mesh.positions.count,
                "type": "VEC3",
                "min": minPosition,
                "max": maxPosition,
            ])
            let positionAccessor = accessors.count - 1

            let normalView = addView(bytes: vec3Bytes(mesh.normals), target: 34962)
            accessors.append([
                "bufferView": normalView,
                "byteOffset": 0,
                "componentType": 5126,
                "count": mesh.normals.count,
                "type": "VEC3",
            ])
            let normalAccessor = accessors.count - 1

            let uvView = addView(bytes: vec2Bytes(mesh.uvs), target: 34962)
            accessors.append([
                "bufferView": uvView,
                "byteOffset": 0,
                "componentType": 5126,
                "count": mesh.uvs.count,
                "type": "VEC2",
            ])
            let uvAccessor = accessors.count - 1

            let indexView = addView(bytes: indexBytes(mesh.indices), target: 34963)
            accessors.append([
                "bufferView": indexView,
                "byteOffset": 0,
                "componentType": 5125,
                "count": mesh.indices.count,
                "type": "SCALAR",
            ])
            let indexAccessor = accessors.count - 1

            var pbr: [String: Any] = [
                "baseColorFactor": [
                    Double(mesh.material.baseColor.x),
                    Double(mesh.material.baseColor.y),
                    Double(mesh.material.baseColor.z),
                    Double(mesh.material.baseColor.w),
                ],
                "metallicFactor": Double(mesh.material.metallic),
                "roughnessFactor": Double(mesh.material.roughness),
            ]
            if let png = mesh.material.baseColorTexturePNG, !png.isEmpty {
                let imageView = addView(bytes: png, target: nil)
                images.append([
                    "bufferView": imageView,
                    "mimeType": "image/png",
                ])
                if !samplerAdded { samplerAdded = true }
                textures.append([
                    "sampler": 0,
                    "source": images.count - 1,
                ])
                pbr["baseColorTexture"] = ["index": textures.count - 1]
            }
            materials.append([
                "name": "material-\(index)",
                "pbrMetallicRoughness": pbr,
                "alphaMode": mesh.material.alphaBlend ? "BLEND" : "OPAQUE",
            ])
            gltfMeshes.append([
                "name": "mesh-\(index)",
                "primitives": [[
                    "attributes": [
                        "POSITION": positionAccessor,
                        "NORMAL": normalAccessor,
                        "TEXCOORD_0": uvAccessor,
                    ],
                    "indices": indexAccessor,
                    "material": index,
                    "mode": 4,
                ]],
            ])
            nodes.append([
                "name": "node-\(index)",
                "mesh": index,
            ])
        }

        align()
        var root: [String: Any] = [
            "asset": [
                "version": "2.0",
                "generator": generator,
            ],
            "scene": 0,
            "scenes": [["nodes": Array(nodes.indices)]],
            "nodes": nodes,
            "meshes": gltfMeshes,
            "materials": materials,
            "accessors": accessors,
            "bufferViews": bufferViews,
            "buffers": [["byteLength": bin.count]],
        ]
        if samplerAdded {
            root["samplers"] = [[
                "magFilter": 9729,
                "minFilter": 9729,
                "wrapS": 10497,
                "wrapT": 10497,
            ]]
            root["textures"] = textures
            root["images"] = images
        }

        let json = try JSONSerialization.data(withJSONObject: root, options: [.sortedKeys])
        return pack(json: json, bin: bin)
    }

    private static func validate(_ mesh: GLBMesh, index: Int) throws {
        let count = mesh.positions.count
        guard count > 0 else { throw GLBWriterError.invalidMesh("mesh \(index) has no vertices") }
        guard mesh.normals.count == count, mesh.uvs.count == count else {
            throw GLBWriterError.invalidMesh("mesh \(index) attribute counts differ")
        }
        guard mesh.indices.count >= 3, mesh.indices.count.isMultiple(of: 3) else {
            throw GLBWriterError.invalidMesh("mesh \(index) indices are not triangles")
        }
        guard mesh.indices.allSatisfy({ Int($0) < count }) else {
            throw GLBWriterError.invalidMesh("mesh \(index) index out of range")
        }
    }

    private static func bounds(_ values: [SIMD3<Float>]) -> ([Double], [Double]) {
        var minV = SIMD3<Float>(repeating: .greatestFiniteMagnitude)
        var maxV = SIMD3<Float>(repeating: -.greatestFiniteMagnitude)
        for value in values {
            minV = SIMD3(min(minV.x, value.x), min(minV.y, value.y), min(minV.z, value.z))
            maxV = SIMD3(max(maxV.x, value.x), max(maxV.y, value.y), max(maxV.z, value.z))
        }
        return (
            [Double(minV.x), Double(minV.y), Double(minV.z)],
            [Double(maxV.x), Double(maxV.y), Double(maxV.z)]
        )
    }

    private static func vec3Bytes(_ values: [SIMD3<Float>]) -> Data {
        var data = Data(capacity: values.count * 12)
        for value in values {
            append(value.x, to: &data)
            append(value.y, to: &data)
            append(value.z, to: &data)
        }
        return data
    }

    private static func vec2Bytes(_ values: [SIMD2<Float>]) -> Data {
        var data = Data(capacity: values.count * 8)
        for value in values {
            append(value.x, to: &data)
            append(value.y, to: &data)
        }
        return data
    }

    private static func indexBytes(_ values: [UInt32]) -> Data {
        var data = Data(capacity: values.count * 4)
        for value in values {
            appendUInt32(value, to: &data)
        }
        return data
    }

    private static func append(_ value: Float, to data: inout Data) {
        appendUInt32(value.bitPattern, to: &data)
    }

    private static func appendUInt32(_ value: UInt32, to data: inout Data) {
        var little = value.littleEndian
        withUnsafeBytes(of: &little) { data.append(contentsOf: $0) }
    }

    private static func pack(json: Data, bin: Data) -> Data {
        var jsonChunk = json
        let jsonPad = (4 - jsonChunk.count % 4) % 4
        if jsonPad > 0 {
            jsonChunk.append(contentsOf: repeatElement(UInt8(0x20), count: jsonPad))
        }
        var binChunk = bin
        let binPad = (4 - binChunk.count % 4) % 4
        if binPad > 0 {
            binChunk.append(contentsOf: repeatElement(UInt8(0), count: binPad))
        }
        let total = 12 + 8 + jsonChunk.count + 8 + binChunk.count
        var file = Data()
        appendUInt32(0x46546C67, to: &file)
        appendUInt32(2, to: &file)
        appendUInt32(UInt32(total), to: &file)
        appendUInt32(UInt32(jsonChunk.count), to: &file)
        appendUInt32(0x4E4F534A, to: &file)
        file.append(jsonChunk)
        appendUInt32(UInt32(binChunk.count), to: &file)
        appendUInt32(0x004E4942, to: &file)
        file.append(binChunk)
        return file
    }
}
