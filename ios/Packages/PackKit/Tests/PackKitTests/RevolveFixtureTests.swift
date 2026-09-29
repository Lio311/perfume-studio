import XCTest
@testable import PackKit

final class RevolveFixtureTests: XCTestCase {
    func testSharedRevolveFixtures() throws {
        for name in ["cylinder-bottle", "shouldered-bottle", "cap"] {
            let url = try XCTUnwrap(
                Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures/revolve"),
                "missing revolve fixture \(name)"
            )
            let fixture = try JSONDecoder().decode(RevolveFixture.self, from: Data(contentsOf: url))
            XCTAssertEqual(fixture.segments, 128, name)
            XCTAssertGreaterThanOrEqual(fixture.profile.count, 4, name)
            let part = try MeshSupport.part(
                kind: fixture.kind,
                width: fixture.widthMm,
                height: fixture.heightMm,
                depth: fixture.depthMm,
                lathe: fixture.profile,
                finish: fixture.finish,
                color: fixture.color
            )
            let mesh = try XCTUnwrap(MeshBuilder.build(part).first).mesh
            XCTAssertEqual(mesh.positions.count, fixture.expected.vertexCount, name)
            XCTAssertEqual(mesh.indices.count, fixture.expected.indexCount, name)
            let box = MeshSupport.bounds(mesh)
            XCTAssertEqual(Double(box.min.x), fixture.expected.bboxMinM[0], accuracy: 1e-5, name)
            XCTAssertEqual(Double(box.min.y), fixture.expected.bboxMinM[1], accuracy: 1e-5, name)
            XCTAssertEqual(Double(box.min.z), fixture.expected.bboxMinM[2], accuracy: 1e-5, name)
            XCTAssertEqual(Double(box.max.x), fixture.expected.bboxMaxM[0], accuracy: 1e-5, name)
            XCTAssertEqual(Double(box.max.y), fixture.expected.bboxMaxM[1], accuracy: 1e-5, name)
            XCTAssertEqual(Double(box.max.z), fixture.expected.bboxMaxM[2], accuracy: 1e-5, name)
            for (index, expected) in fixture.expected.firstRingMeters.enumerated() {
                let position = mesh.positions[index * fixture.profile.count]
                XCTAssertEqual(Double(position.x), expected[0], accuracy: 1e-5, "\(name) ring \(index) x")
                XCTAssertEqual(Double(position.y), expected[1], accuracy: 1e-5, "\(name) ring \(index) y")
                XCTAssertEqual(Double(position.z), expected[2], accuracy: 1e-5, "\(name) ring \(index) z")
            }
            XCTAssertEqual(fixture.web.vertexCount, (fixture.segments + 1) * (fixture.profile.count + 2), name)
            XCTAssertEqual(fixture.web.indexCount, fixture.segments * (fixture.profile.count + 1) * 6, name)
        }
    }
}

struct RevolveFixture: Decodable {
    struct Web: Decodable {
        var vertexCount: Int
        var indexCount: Int
    }

    struct Expected: Decodable {
        var vertexCount: Int
        var indexCount: Int
        var bboxMinM: [Double]
        var bboxMaxM: [Double]
        var firstRingMeters: [[Double]]
    }

    var name: String
    var kind: String
    var widthMm: Double
    var heightMm: Double
    var depthMm: Double
    var color: String
    var finish: String
    var profile: [Double]
    var segments: Int
    var web: Web
    var expected: Expected
}
