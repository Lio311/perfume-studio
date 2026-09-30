import XCTest
@testable import PackKit

final class MeshBuilderTests: XCTestCase {
    func testLatheSegmentCountMatchesTheWeb() {
        XCTAssertEqual(MeshBuilder.latheSegments, 128)
    }

    func testCylinderBottleBoundsAndHardCaps() throws {
        let profile = Array(repeating: 1.0, count: 42)
        let part = try MeshSupport.part(kind: "bottle", width: 50, height: 120, depth: 50, lathe: profile, finish: "clear", color: "#f4f0e8")
        let mesh = try XCTUnwrap(MeshBuilder.build(part).first).mesh
        MeshSupport.assertExtent(mesh, widthMm: 50, heightMm: 120, depthMm: 50)
        MeshSupport.assertClosedAndOutward(mesh, interior: SIMD3(0, 0.06, 0))
        assertHardCaps(mesh, rows: 42)
        let bottom = mesh.positions[0]
        XCTAssertEqual(bottom.x, 0, accuracy: 1e-5)
        XCTAssertEqual(bottom.y, 0, accuracy: 1e-6)
        XCTAssertEqual(bottom.z, 0.025, accuracy: 1e-5)
        XCTAssertEqual(mesh.material.alphaMode, .blend)
    }

    func testCapBounds() throws {
        let part = try MeshSupport.part(kind: "cap", width: 28, height: 36, depth: 28, lathe: Array(repeating: 1.0, count: 42), finish: "gold", color: "#D6B26A")
        let mesh = try XCTUnwrap(MeshBuilder.build(part).first).mesh
        MeshSupport.assertExtent(mesh, widthMm: 28, heightMm: 36, depthMm: 28)
        MeshSupport.assertClosedAndOutward(mesh, interior: SIMD3(0, 0.018, 0))
        XCTAssertEqual(mesh.material.metallic, 1, accuracy: 1e-5)
        XCTAssertEqual(mesh.material.alphaMode, .opaque)
    }

    func testBoxBoundsUVsAndDefaultRadius() throws {
        XCTAssertEqual(MeshBuilder.defaultCornerRadiusMm(widthMm: 80, depthMm: 40), 2, accuracy: 1e-9)
        XCTAssertEqual(MeshBuilder.defaultCornerRadiusMm(widthMm: 20, depthMm: 30), 1, accuracy: 1e-9)
        let part = try MeshSupport.part(kind: "box", width: 80, height: 40, depth: 50, finish: "matteBlack", color: "#141414")
        let mesh = try XCTUnwrap(MeshBuilder.build(part).first).mesh
        MeshSupport.assertExtent(mesh, widthMm: 80, heightMm: 40, depthMm: 50)
        MeshSupport.assertClosedAndOutward(mesh, interior: SIMD3(0, 0.02, 0))
        for uv in mesh.uvs {
            XCTAssertGreaterThanOrEqual(uv.x, -0.001)
            XCTAssertLessThanOrEqual(uv.x, 1.001)
            XCTAssertGreaterThanOrEqual(uv.y, -0.001)
            XCTAssertLessThanOrEqual(uv.y, 1.001)
        }
    }

    func testStackedBottleCollarCapMatchesTheEnvelope() throws {
        let bottle = try MeshSupport.part(
            kind: "bottle", width: 48.5, height: 92, depth: 48.5,
            lathe: Array(repeating: 1.0, count: 42), finish: "clear", color: "#f4f0e8"
        )
        let collar = try MeshSupport.part(
            kind: "collar", width: 18, height: 10, depth: 18,
            lathe: Array(repeating: 1.0, count: 8), finish: "silver", color: "#d5d8de"
        )
        let cap = try MeshSupport.part(
            kind: "cap", width: 28.2, height: 36, depth: 28.2,
            lathe: Array(repeating: 1.0, count: 8), finish: "gold", color: "#D6B26A"
        )
        let pack = try MeshSupport.pack([bottle, collar, cap])
        let parts = MeshBuilder.build(pack)
        let roles = parts.map { $0.role }
        XCTAssertEqual(roles, [MeshRole.bottle, MeshRole.collar, MeshRole.cap])
        var minV = SIMD3<Float>(repeating: .greatestFiniteMagnitude)
        var maxV = SIMD3<Float>(repeating: -.greatestFiniteMagnitude)
        for part in parts {
            let heights = part.mesh.positions.map { $0.y }
            let midY = heights.reduce(0, +) / Float(heights.count)
            MeshSupport.assertClosedAndOutward(part.mesh, interior: SIMD3(0, midY, 0))
            for position in part.mesh.positions {
                minV = SIMD3(min(minV.x, position.x), min(minV.y, position.y), min(minV.z, position.z))
                maxV = SIMD3(max(maxV.x, position.x), max(maxV.y, position.y), max(maxV.z, position.z))
            }
        }
        XCTAssertEqual(Double(maxV.x - minV.x), 48.5 / 1000, accuracy: 0.0001)
        XCTAssertEqual(Double(maxV.z - minV.z), 48.5 / 1000, accuracy: 0.0001)
        XCTAssertEqual(Double(maxV.y - minV.y), (92 + 36) / 1000, accuracy: 0.0001)
        XCTAssertEqual(Double(minV.y), 0, accuracy: 0.0001)

        let collarMesh = parts[1].mesh
        let collarBox = MeshSupport.bounds(collarMesh)
        XCTAssertEqual(Double(collarBox.min.y), (92 - 10) / 1000, accuracy: 0.0001)
        XCTAssertEqual(Double(collarBox.max.y), 92 / 1000, accuracy: 0.0001)
        let capBox = MeshSupport.bounds(parts[2].mesh)
        XCTAssertEqual(Double(capBox.min.y), 92 / 1000, accuracy: 0.0001)
    }

    func testLabelPlaneAndCurvedBandOffset() throws {
        let label = try MeshSupport.part(kind: "label", width: 30, height: 20, depth: 1, finish: "matteBlack", color: "#efe4cc")
        let plane = try XCTUnwrap(MeshBuilder.build(label).first).mesh
        XCTAssertEqual(plane.positions.count, 4)
        XCTAssertEqual(plane.indices.count, 6)
        let planeBox = MeshSupport.bounds(plane)
        XCTAssertEqual(Double(planeBox.max.x - planeBox.min.x), 0.030, accuracy: 0.0001)
        XCTAssertEqual(Double(planeBox.max.y - planeBox.min.y), 0.020, accuracy: 0.0001)
        XCTAssertEqual(plane.positions[0].z, 0.0002, accuracy: 1e-6)

        let bottle = try MeshSupport.part(
            kind: "bottle", width: 50, height: 100, depth: 50,
            lathe: Array(repeating: 1.0, count: 42), finish: "clear"
        )
        let pack = try MeshSupport.pack([bottle, label])
        let band = try XCTUnwrap(MeshBuilder.build(pack).first { $0.role == .label }).mesh
        XCTAssertGreaterThan(band.positions.count, 4)
        let centre = band.positions[band.positions.count / 2]
        let radius = (Double(centre.x) * Double(centre.x) + Double(centre.z) * Double(centre.z)).squareRoot()
        XCTAssertEqual(radius, 0.025 + 0.0002, accuracy: 0.0001)
        for normal in band.normals {
            XCTAssertEqual(meshLength(normal), 1, accuracy: 1e-4)
            XCTAssertGreaterThan(meshDot(normal, SIMD3(0, 0, 1)), -0.2)
        }
    }

    func testMissingLatheBecomesACylinder() throws {
        let part = try MeshSupport.part(kind: "pump", width: 16, height: 24, depth: 16, finish: "silver")
        let mesh = try XCTUnwrap(MeshBuilder.build(part).first).mesh
        MeshSupport.assertExtent(mesh, widthMm: 16, heightMm: 24, depthMm: 16)
        let columns = MeshBuilder.latheSegments + 1
        let rows = 42
        XCTAssertEqual(mesh.positions.count, columns * rows + 2 * (columns + 1))
    }

    func testBoxSitsBesideTheBottle() throws {
        let bottle = try MeshSupport.part(kind: "bottle", width: 40, height: 80, depth: 40, lathe: Array(repeating: 1, count: 4))
        let box = try MeshSupport.part(kind: "box", width: 50, height: 90, depth: 50)
        let pack = try MeshSupport.pack([bottle, box])
        let built = MeshBuilder.build(pack)
        let placed = try XCTUnwrap(built.first { $0.role == .box }).mesh
        let boxBounds = MeshSupport.bounds(placed)
        let span = boxBounds.min.x + boxBounds.max.x
        let centre = Double(span) * 0.5
        let expected = -((40.0 + 50.0) * 0.5 + 32.0) / 1000.0
        XCTAssertEqual(centre, expected, accuracy: 0.0001)
    }

    private func assertHardCaps(_ mesh: Mesh, rows: Int) {
        let columns = MeshBuilder.latheSegments + 1
        let sideCount = columns * rows
        let sideBottom = mesh.normals[0]
        XCTAssertEqual(sideBottom.y, 0, accuracy: 0.05)
        XCTAssertGreaterThan(meshLength(SIMD2(sideBottom.x, sideBottom.z)), 0.95)
        let capStart = sideCount
        for normal in mesh.normals[capStart..<(capStart + columns + 1)] {
            XCTAssertEqual(normal.y, -1, accuracy: 1e-4)
            XCTAssertEqual(normal.x, 0, accuracy: 1e-4)
        }
        let topStart = capStart + columns + 1
        for normal in mesh.normals[topStart..<(topStart + columns + 1)] {
            XCTAssertEqual(normal.y, 1, accuracy: 1e-4)
        }
    }
}
