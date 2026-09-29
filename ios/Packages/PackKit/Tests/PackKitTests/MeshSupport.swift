import Foundation
import XCTest
@testable import PackKit

func meshDot(_ a: SIMD3<Float>, _ b: SIMD3<Float>) -> Float {
    (a * b).sum()
}

func meshLength(_ v: SIMD3<Float>) -> Float {
    meshDot(v, v).squareRoot()
}

func meshLength(_ v: SIMD2<Float>) -> Float {
    (v * v).sum().squareRoot()
}

func meshCross(_ a: SIMD3<Float>, _ b: SIMD3<Float>) -> SIMD3<Float> {
    SIMD3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
}

func meshNormalize(_ v: SIMD3<Float>) -> SIMD3<Float> {
    v / meshLength(v)
}

enum MeshSupport {
    static func part(
        kind: String,
        width: Double,
        height: Double,
        depth: Double,
        lathe: [Double]? = nil,
        finish: String? = nil,
        color: String = "#ffffff",
        gloss: String? = nil,
        name: String = "Part"
    ) throws -> SupplierPart {
        var json: [String: Any] = [
            "id": "part-\(kind)",
            "kind": kind,
            "code": "CODE",
            "name": name,
            "widthMm": width,
            "heightMm": height,
            "depthMm": depth,
            "profile": "profile",
            "color": color,
            "thumb": "",
            "page": 1,
        ]
        if let lathe { json["lathe"] = lathe }
        if finish != nil || gloss != nil {
            var appearance: [String: Any] = [:]
            if let finish { appearance["finish"] = finish }
            if let gloss { appearance["gloss"] = gloss }
            json["appearance"] = appearance
        }
        let data = try JSONSerialization.data(withJSONObject: json)
        return try JSONDecoder().decode(SupplierPart.self, from: data)
    }

    static func pack(_ parts: [SupplierPart]) throws -> SupplierPack {
        let encoder = JSONEncoder()
        let partsData = try encoder.encode(parts)
        let partsJSON = try JSONSerialization.jsonObject(with: partsData)
        let json: [String: Any] = [
            "id": "pack",
            "name": "Pack",
            "createdAt": 0,
            "parts": partsJSON,
        ]
        let data = try JSONSerialization.data(withJSONObject: json)
        return try JSONDecoder().decode(SupplierPack.self, from: data)
    }

    static func bounds(_ mesh: Mesh) -> (min: SIMD3<Float>, max: SIMD3<Float>) {
        var minV = SIMD3<Float>(repeating: .greatestFiniteMagnitude)
        var maxV = SIMD3<Float>(repeating: -.greatestFiniteMagnitude)
        for position in mesh.positions {
            minV = SIMD3(min(minV.x, position.x), min(minV.y, position.y), min(minV.z, position.z))
            maxV = SIMD3(max(maxV.x, position.x), max(maxV.y, position.y), max(maxV.z, position.z))
        }
        return (minV, maxV)
    }

    static func assertClosedAndOutward(_ mesh: Mesh, interior: SIMD3<Float>, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(mesh.positions.count, mesh.normals.count, file: file, line: line)
        XCTAssertEqual(mesh.positions.count, mesh.uvs.count, file: file, line: line)
        XCTAssertTrue(mesh.indices.count.isMultiple(of: 3), file: file, line: line)
        let limit = UInt32(mesh.positions.count)
        for normal in mesh.normals {
            let length = meshLength(normal)
            XCTAssertEqual(length, 1, accuracy: 1e-4, file: file, line: line)
        }
        var offset = 0
        while offset < mesh.indices.count {
            let i0 = mesh.indices[offset]
            let i1 = mesh.indices[offset + 1]
            let i2 = mesh.indices[offset + 2]
            offset += 3
            XCTAssertLessThan(i0, limit, file: file, line: line)
            XCTAssertLessThan(i1, limit, file: file, line: line)
            XCTAssertLessThan(i2, limit, file: file, line: line)
            let a = mesh.positions[Int(i0)]
            let b = mesh.positions[Int(i1)]
            let c = mesh.positions[Int(i2)]
            let cross = meshCross(b - a, c - a)
            let area = meshLength(cross) * 0.5
            XCTAssertGreaterThan(area, 1e-12, "degenerate triangle", file: file, line: line)
            let face = meshNormalize(cross)
            let centroid = (a + b + c) / 3
            XCTAssertGreaterThan(meshDot(face, centroid - interior), 0, "inward winding", file: file, line: line)
            let stored = mesh.normals[Int(i0)]
            XCTAssertGreaterThan(meshDot(face, stored), 0, "stored normal disagrees with winding", file: file, line: line)
        }
    }

    /// 0.1 mm, expressed in metres.
    static let toleranceM: Float = 0.0001

    static func assertExtent(
        _ mesh: Mesh,
        widthMm: Double,
        heightMm: Double,
        depthMm: Double,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let box = bounds(mesh)
        XCTAssertEqual(Double(box.max.x - box.min.x), widthMm / 1000, accuracy: 0.0001, file: file, line: line)
        XCTAssertEqual(Double(box.max.y - box.min.y), heightMm / 1000, accuracy: 0.0001, file: file, line: line)
        XCTAssertEqual(Double(box.max.z - box.min.z), depthMm / 1000, accuracy: 0.0001, file: file, line: line)
        XCTAssertEqual(Double(box.min.y), 0, accuracy: 0.0001, file: file, line: line)
    }
}
