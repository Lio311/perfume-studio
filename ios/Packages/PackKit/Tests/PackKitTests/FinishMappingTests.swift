import XCTest
@testable import PackKit

final class FinishMappingTests: XCTestCase {
    func testSchemaFinishesMatchTheWebRenderer() {
        let expected: [(String, Float, Float, Bool)] = [
            ("clear", 0, 0.015, true),
            ("frosted", 0, 0.34, true),
            ("tinted", 0, 0.05, true),
            ("gold", 1, 0.22, false),
            ("silver", 1, 0.22, false),
            ("rose", 1, 0.22, false),
            ("matteBlack", 0, 0.68, false),
            ("wood", 0, 0.7, false),
            ("leather", 0, 0.84, false),
        ]
        for (finish, metallic, roughness, blend) in expected {
            let factors = FinishMapping.factors(finish: finish, gloss: nil)
            XCTAssertEqual(factors.metallic, metallic, accuracy: 1e-5, finish)
            XCTAssertEqual(factors.roughness, roughness, accuracy: 1e-5, finish)
            XCTAssertEqual(factors.alphaMode == .blend, blend, finish)
        }
        XCTAssertEqual(FinishMapping.clearAlpha, 0.2088, accuracy: 1e-5)
        XCTAssertEqual(FinishMapping.frostedAlpha, 0.402, accuracy: 1e-5)
        XCTAssertEqual(FinishMapping.tintedAlpha, 0.264, accuracy: 1e-5)
        XCTAssertEqual(FinishMapping.factors(finish: "clear", gloss: nil).alpha, FinishMapping.clearAlpha, accuracy: 1e-6)
        XCTAssertEqual(FinishMapping.factors(finish: "frosted", gloss: nil).alpha, FinishMapping.frostedAlpha, accuracy: 1e-6)
        XCTAssertEqual(FinishMapping.factors(finish: "tinted", gloss: nil).alpha, FinishMapping.tintedAlpha, accuracy: 1e-6)
    }

    func testSchemaGloss() {
        let matte = FinishMapping.factors(finish: nil, gloss: "matte")
        XCTAssertEqual(matte.roughness, 0.68, accuracy: 1e-5)
        XCTAssertEqual(matte.metallic, 0, accuracy: 1e-5)
        XCTAssertEqual(matte.alphaMode, .opaque)

        let satin = FinishMapping.factors(finish: nil, gloss: "satin")
        XCTAssertEqual(satin.roughness, 0.45, accuracy: 1e-5)

        let gloss = FinishMapping.factors(finish: nil, gloss: "gloss")
        XCTAssertEqual(gloss.roughness, 0.16, accuracy: 1e-5)
        XCTAssertEqual(gloss.alphaMode, .opaque)

        let metallic = FinishMapping.factors(finish: nil, gloss: "metallic")
        XCTAssertEqual(metallic.metallic, 1, accuracy: 1e-5)
        XCTAssertEqual(metallic.roughness, 0.22, accuracy: 1e-5)

        XCTAssertEqual(FinishMapping.factors(finish: nil, gloss: "frosted").alphaMode, .blend)
        XCTAssertEqual(FinishMapping.factors(finish: nil, gloss: "transparent").alphaMode, .blend)
        XCTAssertEqual(FinishMapping.factors(finish: nil, gloss: "transparent").roughness, 0.015, accuracy: 1e-5)
    }

    func testFinishWinsOverGlossAndHexBecomesBaseColor() throws {
        let appearance = Appearance(finish: "gold", gloss: "matte", finishSource: nil, finishConfidence: nil, colorSource: nil, colors: nil)
        let material = FinishMapping.material(colorHex: "#D6B26A", appearance: appearance, name: "cap")
        XCTAssertEqual(material.metallic, 1, accuracy: 1e-5)
        XCTAssertEqual(material.roughness, 0.22, accuracy: 1e-5)
        XCTAssertEqual(material.alphaMode, .opaque)
        XCTAssertEqual(material.baseColor.w, 1, accuracy: 1e-5)
        XCTAssertEqual(material.name, "cap")
        let gold = try XCTUnwrap(FinishMapping.parseHex("#D6B26A"))
        XCTAssertEqual(material.baseColor.x, gold.x, accuracy: 1e-6)
        XCTAssertEqual(material.baseColor.y, gold.y, accuracy: 1e-6)
        XCTAssertEqual(material.baseColor.z, gold.z, accuracy: 1e-6)
    }

    func testUnknownFinishFallsBackToOpaqueDielectric() {
        let factors = FinishMapping.factors(finish: "pearl", gloss: nil)
        XCTAssertEqual(factors.roughness, 0.84, accuracy: 1e-5)
        XCTAssertEqual(factors.metallic, 0, accuracy: 1e-5)
        XCTAssertEqual(factors.alphaMode, .opaque)
    }
}
