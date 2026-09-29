import XCTest
@testable import PackKit

final class GLBWriterTests: XCTestCase {
    func testHeaderChunksAccessorsAndMinMax() throws {
        let mesh = triangle()
        let data = try GLBWriter.write(meshes: [mesh])
        let json = try validateGLB(data)
        let asset = try XCTUnwrap(json["asset"] as? [String: Any])
        XCTAssertEqual(asset["version"] as? String, "2.0")
        XCTAssertEqual(asset["generator"] as? String, "PerfumeStudio PackKit")
        let accessors = try XCTUnwrap(json["accessors"] as? [[String: Any]])
        let position = accessors[0]
        XCTAssertEqual(jsonInt(position["componentType"]), 5126)
        XCTAssertEqual(jsonInt(position["count"]), 3)
        XCTAssertEqual(position["type"] as? String, "VEC3")
        let minPosition = try XCTUnwrap(jsonDoubles(position["min"]))
        let maxPosition = try XCTUnwrap(jsonDoubles(position["max"]))
        XCTAssertEqual(minPosition[0], 0, accuracy: 1e-6)
        XCTAssertEqual(minPosition[1], 0, accuracy: 1e-6)
        XCTAssertEqual(maxPosition[0], 1, accuracy: 1e-6)
        XCTAssertEqual(maxPosition[1], 1, accuracy: 1e-6)
        let indexAccessor = accessors[3]
        XCTAssertEqual(jsonInt(indexAccessor["componentType"]), 5125)
        XCTAssertEqual(jsonInt(indexAccessor["count"]), 3)
        let views = try XCTUnwrap(json["bufferViews"] as? [[String: Any]])
        XCTAssertEqual(jsonInt(views[0]["target"]), 34962)
        XCTAssertEqual(jsonInt(views[3]["target"]), 34963)
        XCTAssertEqual(jsonInt(views[0]["byteLength"]), 36)
        XCTAssertEqual(jsonInt(views[2]["byteLength"]), 24)
        XCTAssertEqual(jsonInt(views[3]["byteLength"]), 12)
        let materials = try XCTUnwrap(json["materials"] as? [[String: Any]])
        XCTAssertEqual(materials[0]["alphaMode"] as? String, "OPAQUE")
        let meshes = try XCTUnwrap(json["meshes"] as? [[String: Any]])
        XCTAssertEqual(meshes.count, 1)
    }

    func testGlassBlendAndEmbeddedPNG() throws {
        var material = GLBMaterial(baseColor: SIMD4(0.9, 0.9, 0.9, 0.2088), metallic: 0, roughness: 0.015, alphaBlend: true)
        material.baseColorTexturePNG = tinyPNG
        var mesh = triangle()
        mesh.material = material
        let data = try GLBWriter.write(meshes: [mesh], generator: "PerfumeStudio PackKit")
        let json = try validateGLB(data)
        let materials = try XCTUnwrap(json["materials"] as? [[String: Any]])
        XCTAssertEqual(materials[0]["alphaMode"] as? String, "BLEND")
        let images = try XCTUnwrap(json["images"] as? [[String: Any]])
        XCTAssertEqual(images[0]["mimeType"] as? String, "image/png")
        let views = try XCTUnwrap(json["bufferViews"] as? [[String: Any]])
        let imageView = try XCTUnwrap(jsonInt(images[0]["bufferView"]))
        XCTAssertNil(views[imageView]["target"])
        XCTAssertEqual(jsonInt(views[imageView]["byteLength"]), tinyPNG.count)
        let textures = try XCTUnwrap(json["textures"] as? [[String: Any]])
        XCTAssertEqual(textures.count, 1)
        let bin = binaryChunk(data)
        let offset = try XCTUnwrap(jsonInt(views[imageView]["byteOffset"]))
        XCTAssertEqual(bin.subdata(in: offset..<(offset + tinyPNG.count)), tinyPNG)
    }

    func testExportGLBFromAPart() throws {
        let part = try MeshSupport.part(kind: "cap", width: 20, height: 15, depth: 20, lathe: [1, 1, 1, 0.8], finish: "gold", color: "#D6B26A")
        let data = try PackKit.exportGLB(part)
        let json = try validateGLB(data)
        let meshes = try XCTUnwrap(json["meshes"] as? [[String: Any]])
        XCTAssertEqual(meshes.count, 1)
        let materials = try XCTUnwrap(json["materials"] as? [[String: Any]])
        let pbr = try XCTUnwrap(materials[0]["pbrMetallicRoughness"] as? [String: Any])
        XCTAssertEqual(jsonDouble(pbr["metallicFactor"]) ?? -1, 1, accuracy: 1e-5)
    }

    func testRejectsAnEmptyListAndABrokenMesh() {
        XCTAssertThrowsError(try GLBWriter.write(meshes: []))
        var mesh = triangle()
        mesh.indices = [0, 1, 9]
        XCTAssertThrowsError(try GLBWriter.write(meshes: [mesh]))
    }

    func testCommittedSampleGLBs() throws {
        for name in ["cylinder", "cap", "box"] {
            let url = try XCTUnwrap(
                Bundle.module.url(forResource: name, withExtension: "glb", subdirectory: "Fixtures/revolve/samples")
            )
            let data = try Data(contentsOf: url)
            XCTAssertLessThan(data.count, 200_000, name)
            _ = try validateGLB(data)
        }
    }

    func testWritesThreeSampleGLBs() throws {
        let cylinder = try MeshSupport.part(kind: "bottle", width: 40, height: 80, depth: 40, lathe: [1, 1, 1, 1], finish: "clear", color: "#f4f0e8")
        let cap = try MeshSupport.part(kind: "cap", width: 22, height: 18, depth: 22, lathe: [0.9, 0.95, 1, 0.7], finish: "gold", color: "#D6B26A")
        let box = try MeshSupport.part(kind: "box", width: 60, height: 30, depth: 40, finish: "matteBlack", color: "#141414")
        let directory: URL
        if let override = ProcessInfo.processInfo.environment["PACKKIT_SAMPLE_DIR"] {
            directory = URL(fileURLWithPath: override, isDirectory: true)
        } else {
            directory = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
                .appendingPathComponent("packkit-glb-\(UUID().uuidString)", isDirectory: true)
        }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let samples: [(String, SupplierPart)] = [("cylinder", cylinder), ("cap", cap), ("box", box)]
        for (name, part) in samples {
            let data = try PackKit.exportGLB(part)
            let url = directory.appendingPathComponent("\(name).glb")
            try data.write(to: url)
            XCTAssertLessThan(data.count, 200_000, name)
            _ = try validateGLB(data)
        }
    }

    private func triangle() -> GLBMesh {
        GLBMesh(
            positions: [SIMD3(0, 0, 0), SIMD3(1, 0, 0), SIMD3(0, 1, 0)],
            normals: [SIMD3(0, 0, 1), SIMD3(0, 0, 1), SIMD3(0, 0, 1)],
            uvs: [SIMD2(0, 0), SIMD2(1, 0), SIMD2(0, 1)],
            indices: [0, 1, 2],
            material: GLBMaterial(baseColor: SIMD4(1, 0, 0, 1), metallic: 0, roughness: 0.5, alphaBlend: false)
        )
    }

    /// 1×1 PNG.
    private var tinyPNG: Data {
        Data([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
            0x00, 0x00, 0x03, 0x00, 0x01, 0x01, 0xA5, 0xFE, 0x9A, 0x18, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
            0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ])
    }
}

/// Tiny in-test glTF binary check: header, chunk alignment, JSON, accessor ranges, POSITION min/max.
func validateGLB(_ data: Data) throws -> [String: Any] {
    XCTAssertGreaterThanOrEqual(data.count, 20)
    XCTAssertEqual(readUInt32(data, 0), 0x46546C67)
    XCTAssertEqual(readUInt32(data, 4), 2)
    XCTAssertEqual(Int(readUInt32(data, 8)), data.count)
    var offset = 12
    var json: [String: Any]?
    var bin = Data()
    while offset + 8 <= data.count {
        let length = Int(readUInt32(data, offset))
        let type = readUInt32(data, offset + 4)
        XCTAssertEqual(length % 4, 0)
        let start = offset + 8
        XCTAssertLessThanOrEqual(start + length, data.count)
        let chunk = data.subdata(in: start..<(start + length))
        if type == 0x4E4F534A {
            let trimmed = chunk.drop { $0 == 0x20 || $0 == 0x0A }
            let end = chunk.reversed().drop { $0 == 0x20 || $0 == 0 }.count
            let body = chunk.prefix(end)
            _ = trimmed
            json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        } else if type == 0x004E4942 {
            bin = chunk
        } else {
            XCTFail("unknown chunk \(type)")
        }
        offset = start + length
    }
    XCTAssertEqual(offset, data.count)
    let root = try XCTUnwrap(json)
    let buffers = try XCTUnwrap(root["buffers"] as? [[String: Any]])
    XCTAssertEqual(jsonInt(buffers[0]["byteLength"]), bin.count)
    let views = try XCTUnwrap(root["bufferViews"] as? [[String: Any]])
    let accessors = try XCTUnwrap(root["accessors"] as? [[String: Any]])
    for accessor in accessors {
        let viewIndex = try XCTUnwrap(jsonInt(accessor["bufferView"]))
        let view = views[viewIndex]
        let byteOffset = (jsonInt(view["byteOffset"]) ?? 0) + (jsonInt(accessor["byteOffset"]) ?? 0)
        let count = try XCTUnwrap(jsonInt(accessor["count"]))
        let componentType = try XCTUnwrap(jsonInt(accessor["componentType"]))
        let type = try XCTUnwrap(accessor["type"] as? String)
        let components = type == "VEC3" ? 3 : type == "VEC2" ? 2 : 1
        let componentBytes = componentType == 5126 || componentType == 5125 ? 4 : 0
        XCTAssertGreaterThan(componentBytes, 0)
        let byteLength = count * components * componentBytes
        let viewLength = try XCTUnwrap(jsonInt(view["byteLength"]))
        XCTAssertGreaterThanOrEqual(viewLength, byteLength)
        XCTAssertLessThanOrEqual(byteOffset + byteLength, bin.count)
        if type == "VEC3", accessor["min"] != nil {
            let minJSON = try XCTUnwrap(jsonDoubles(accessor["min"]))
            let maxJSON = try XCTUnwrap(jsonDoubles(accessor["max"]))
            var minV = [Double](repeating: .greatestFiniteMagnitude, count: 3)
            var maxV = [Double](repeating: -.greatestFiniteMagnitude, count: 3)
            for index in 0..<count {
                let base = byteOffset + index * 12
                for component in 0..<3 {
                    let bits = readUInt32(bin, base + component * 4)
                    let value = Double(Float(bitPattern: bits))
                    minV[component] = min(minV[component], value)
                    maxV[component] = max(maxV[component], value)
                }
            }
            for component in 0..<3 {
                XCTAssertEqual(minJSON[component], minV[component], accuracy: 1e-5)
                XCTAssertEqual(maxJSON[component], maxV[component], accuracy: 1e-5)
            }
        }
    }
    return root
}

func binaryChunk(_ data: Data) -> Data {
    var offset = 12
    while offset + 8 <= data.count {
        let length = Int(readUInt32(data, offset))
        let type = readUInt32(data, offset + 4)
        let start = offset + 8
        if type == 0x004E4942 {
            return data.subdata(in: start..<(start + length))
        }
        offset = start + length
    }
    return Data()
}

func jsonInt(_ value: Any?) -> Int? {
    (value as? NSNumber)?.intValue
}

func jsonDouble(_ value: Any?) -> Double? {
    (value as? NSNumber)?.doubleValue
}

func jsonDoubles(_ value: Any?) -> [Double]? {
    guard let array = value as? [Any] else { return nil }
    let numbers = array.compactMap { ($0 as? NSNumber)?.doubleValue }
    return numbers.count == array.count ? numbers : nil
}

func readUInt32(_ data: Data, _ offset: Int) -> UInt32 {
    data.withUnsafeBytes { raw in
        raw.loadUnaligned(fromByteOffset: offset, as: UInt32.self).littleEndian
    }
}
