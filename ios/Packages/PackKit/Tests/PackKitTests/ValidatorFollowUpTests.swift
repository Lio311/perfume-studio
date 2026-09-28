import XCTest
@testable import PackKit

final class ValidatorFollowUpTests: XCTestCase {
    func testMissingSchemaFailsInsteadOfSkippingRangeChecks() {
        let missing = DimensionCatalog.parse(Data(#"{"$defs":{}}"#.utf8))
        let garbage = DimensionCatalog.parse(Data("not-json".utf8))
        let empty = DimensionCatalog.parse(Data())
        XCTAssertTrue(missing.failed)
        XCTAssertTrue(garbage.failed)
        XCTAssertTrue(empty.failed)
        XCTAssertFalse(DimensionCatalog.snapshot.failed)

        let part = validCapJSON()
        XCTAssertEqual(PackValidator.issues(inPackJSON: part), [])
        let issues = PackValidator.issues(inPackJSON: part, catalog: missing)
        XCTAssertEqual(issues.map(\.code), ["dimension_ranges_unavailable"])
        XCTAssertEqual(issues.first?.severity, .error)
        XCTAssertFalse(issues.first?.messageHe.isEmpty ?? true)
        XCTAssertFalse(issues.first?.messageEn.isEmpty ?? true)
    }

    func testKindMissingFromDimensionRangesFails() {
        let partial = DimensionCatalog.parse(Data("""
        {"$defs":{"DimensionRanges":{"properties":{"bottle":{"properties":{"widthMm":{"minimum":10,"maximum":200},"heightMm":{"minimum":10,"maximum":300},"depthMm":{"minimum":10,"maximum":200}}}}}}}
        """.utf8))
        XCTAssertFalse(partial.failed)
        XCTAssertNotNil(partial.byKind["bottle"])
        XCTAssertNil(partial.byKind["cap"])
        let issues = PackValidator.issues(inPackJSON: validCapJSON(), catalog: partial)
        XCTAssertEqual(issues.map(\.code), ["dimension_ranges_unavailable"])
        XCTAssertEqual(issues.first?.severity, .error)
    }

    func testQuotedAtRejectsImpossibleCalendarDates() {
        XCTAssertNil(PackValidator.dateOnlyQuotedAt("2026-13-45"))
        XCTAssertNil(PackValidator.dateOnlyQuotedAt("2026-02-30"))
        XCTAssertNil(PackValidator.dateOnlyQuotedAt("2026-02-29"))
        XCTAssertEqual(PackValidator.dateOnlyQuotedAt("2026-02-28"), "2026-02-28")
        XCTAssertEqual(PackValidator.dateOnlyQuotedAt("2024-02-29"), "2024-02-29")
        for raw in ["2026-13-45", "2026-02-30"] {
            let issues = PackValidator.priceIssues(object(#"{"value":1,"currency":"USD","quotedAt":"\#(raw)"}"#))
            XCTAssertEqual(issues.map(\.code), ["price_quoted_at"], raw)
            XCTAssertEqual(issues.first?.severity, .error)
            XCTAssertEqual(issues.first?.path, "quotedAt")
        }
    }

    func testCurrencyNormalisationUppercasesAndExporterWritesUpperCase() throws {
        XCTAssertEqual(PackValidator.normalizeCurrency("usd"), "USD")
        XCTAssertEqual(PackValidator.normalizeCurrency(" USD "), "USD")
        XCTAssertEqual(PackValidator.normalizeCurrency("Usd"), "USD")

        let pack = try JSONDecoder().decode(SupplierPack.self, from: Data("""
        {"id":"p","name":"n","createdAt":1,"parts":[{"id":"p1","kind":"cap","code":"c","name":"n","neck":null,"widthMm":40,"heightMm":20,"depthMm":40,"capacityMl":null,"profile":"cylinder","color":"#112233","thumb":"","page":1,"price":{"value":1.5,"currency":"usd","quotedAt":"2026-10-06"}}]}
        """.utf8))
        XCTAssertEqual(pack.parts[0].price?.currency, "usd")
        let encoded = try JSONEncoder().encode(pack)
        let root = try JSONSerialization.jsonObject(with: encoded) as! [String: Any]
        let part = (root["parts"] as! [Any])[0] as! [String: Any]
        let price = part["price"] as! [String: Any]
        XCTAssertEqual(price["currency"] as? String, "USD")

        let shekel = Price(value: 2, currency: "₪")
        let shekelJSON = try JSONSerialization.jsonObject(with: JSONEncoder().encode(shekel)) as! [String: Any]
        XCTAssertEqual(shekelJSON["currency"] as? String, "ILS")

        let unknown = Price(value: 2, currency: "foo")
        let unknownJSON = try JSONSerialization.jsonObject(with: JSONEncoder().encode(unknown)) as! [String: Any]
        XCTAssertEqual(unknownJSON["currency"] as? String, "FOO")
    }

    private func validCapJSON() -> Data {
        let limits = PackValidator.limits(for: .cap)!
        let width = (limits.widthMm.minimum + limits.widthMm.maximum) / 2
        let height = (limits.heightMm.minimum + limits.heightMm.maximum) / 2
        let depth = (limits.depthMm.minimum + limits.depthMm.maximum) / 2
        let json = """
        {"id":"p","name":"n","createdAt":1,"parts":[{"id":"p1","kind":"cap","code":"c","name":"n","neck":null,"widthMm":\(width),"heightMm":\(height),"depthMm":\(depth),"capacityMl":null,"profile":"cylinder","color":"#112233","thumb":"","page":1}]}
        """
        return Data(json.utf8)
    }

    private func object(_ json: String) -> [String: Any] {
        (try! JSONSerialization.jsonObject(with: Data(json.utf8))) as! [String: Any]
    }
}
