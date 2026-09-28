import CoreFoundation
import XCTest
@testable import PackKit

final class PackModelTests: XCTestCase {
    func testRoundTripFixtureA() throws {
        try assertRoundTrip("a-minimal-v1-pack")
    }

    func testRoundTripFixtureB() throws {
        try assertRoundTrip("b-v2-bottle-photo-cap-scan-price")
    }

    func testValidFixturesHaveNoExportIssues() throws {
        for name in ["a-minimal-v1-pack", "b-v2-bottle-photo-cap-scan-price"] {
            let issues = PackValidator.issues(inPackJSON: try fixture(name))
            XCTAssertEqual(issues, [], name)
        }
    }

    func testFixtureCFails() throws {
        let data = try fixture("c-invalid-pack")
        XCTAssertThrowsError(try JSONDecoder().decode(SupplierPack.self, from: data))
        let issues = PackValidator.issues(inPackJSON: data)
        XCTAssertTrue(issues.contains { $0.severity == .error })
        XCTAssertEqual(issues.map(\.code), [
            "kind_invalid",
            "neck_invalid",
            "dimension_invalid",
            "color_invalid",
            "price_value",
            "tier_below_min",
        ])
        XCTAssertTrue(issues.allSatisfy { $0.severity == .error && !$0.messageHe.isEmpty && !$0.messageEn.isEmpty })
    }

    func testExplicitNullsForNeckAndCapacity() throws {
        let pack = try JSONDecoder().decode(SupplierPack.self, from: fixture("a-minimal-v1-pack"))
        XCTAssertEqual(pack.parts[0].capacityMl, nil)
        var cleared = pack
        cleared.parts[0].neck = nil
        let encoded = try encoder().encode(cleared)
        let json = try JSONSerialization.jsonObject(with: encoded) as! [String: Any]
        let part = (json["parts"] as! [Any])[0] as! [String: Any]
        XCTAssertTrue(part["neck"] is NSNull)
        XCTAssertTrue(part["capacityMl"] is NSNull)
    }

    func testDimensionRangesAreReadFromTheSchema() {
        for kind in PartKind.allCases {
            XCTAssertNotNil(PackValidator.limits(for: kind), kind.rawValue)
        }
        let limits = try! XCTUnwrap(PackValidator.limits(for: .cap))
        let insideHeight = (limits.heightMm.minimum + limits.heightMm.maximum) / 2
        let insideDepth = (limits.depthMm.minimum + limits.depthMm.maximum) / 2
        let below = limits.widthMm.minimum - 1
        XCTAssertGreaterThan(limits.widthMm.minimum, 0)
        let low = PackValidator.issues(inPackJSON: partJSON(width: below, height: insideHeight, depth: insideDepth))
        XCTAssertEqual(low.map(\.code), ["dimension_range"])
        XCTAssertEqual(low.first?.path, "parts[0].widthMm")
        let inside = (limits.widthMm.minimum + limits.widthMm.maximum) / 2
        let ok = PackValidator.issues(inPackJSON: partJSON(width: inside, height: insideHeight, depth: insideDepth))
        XCTAssertEqual(ok, [])
    }

    private func assertRoundTrip(_ name: String) throws {
        let original = try fixture(name)
        let decoded = try JSONDecoder().decode(SupplierPack.self, from: original)
        let encoded = try encoder().encode(decoded)
        let again = try JSONDecoder().decode(SupplierPack.self, from: encoded)
        XCTAssertEqual(decoded, again)
        let left = try JSONSerialization.jsonObject(with: original)
        let right = try JSONSerialization.jsonObject(with: encoded)
        XCTAssertNil(jsonDiff(left, right), name)
    }

    private func fixture(_ name: String) throws -> Data {
        let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
        return try Data(contentsOf: url)
    }

    private func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }

    private func partJSON(width: Double, height: Double, depth: Double) -> Data {
        let json = """
        {"id":"p","name":"n","createdAt":1,"parts":[{"id":"p1","kind":"cap","code":"c","name":"n","neck":null,"widthMm":\(width),"heightMm":\(height),"depthMm":\(depth),"capacityMl":null,"profile":"cylinder","color":"#112233","thumb":"","page":1}]}
        """
        return Data(json.utf8)
    }
}

final class PriceRuleTests: XCTestCase {
    func testCurrencyMissing() throws {
        let issues = try price(#"{"value":1}"#)
        XCTAssertEqual(issues.map(\.code), ["price_currency"])
        XCTAssertEqual(issues[0].severity, .error)
    }

    func testUnknownCurrency() throws {
        let issues = try price(#"{"value":1,"currency":"FOO"}"#)
        XCTAssertEqual(issues.map(\.code), ["price_currency"])
        XCTAssertEqual(issues[0].severity, .error)
        XCTAssertNil(PackValidator.normalizeCurrency("FOO"))
    }

    func testShekelNormalisation() {
        XCTAssertEqual(PackValidator.normalizeCurrency("₪"), "ILS")
        XCTAssertEqual(PackValidator.normalizeCurrency(" NIS "), "ILS")
        XCTAssertEqual(PackValidator.normalizeCurrency("ש״ח"), "ILS")
        XCTAssertEqual(PackValidator.normalizeCurrency("ils"), "ILS")
        let issues = PackValidator.priceIssues(object(#"{"value":2,"currency":"₪"}"#))
        XCTAssertEqual(issues, [])
    }

    func testQuotedAtWithTimeIsTruncated() throws {
        XCTAssertEqual(PackValidator.dateOnlyQuotedAt("2026-10-06T11:42:00+04:00"), "2026-10-06")
        XCTAssertEqual(PackValidator.dateOnlyQuotedAt("2026-10-06T11:42:00.000Z"), "2026-10-06")
        let issues = try price(#"{"value":1,"currency":"USD","quotedAt":"2026-10-06T11:42:00Z"}"#)
        XCTAssertEqual(issues, [])
        XCTAssertNil(PackValidator.dateOnlyQuotedAt("2026-02-31"))
    }

    func testTierMinQtyEqualsMoq() throws {
        let issues = try price(#"{"value":1,"currency":"USD","moq":5000,"tiers":[{"minQty":5000,"value":0.9}]}"#)
        XCTAssertEqual(issues.map(\.code), ["tier_not_above_moq"])
        XCTAssertEqual(issues[0].severity, .error)
        XCTAssertEqual(issues[0].path, "tiers[0].minQty")
    }

    func testTierZero() throws {
        let issues = try price(#"{"value":1,"currency":"USD","tiers":[{"minQty":0,"value":0.9}]}"#)
        XCTAssertEqual(issues.map(\.code), ["tier_below_min"])
        XCTAssertEqual(issues[0].severity, .error)
    }

    func testNonIntegerMinQty() throws {
        let issues = try price(#"{"value":1,"currency":"USD","tiers":[{"minQty":1.5,"value":0.9}]}"#)
        XCTAssertEqual(issues.map(\.code), ["tier_min_qty"])
        XCTAssertEqual(issues[0].severity, .error)
    }

    func testDescendingTiers() throws {
        let issues = try price(#"{"value":1,"currency":"USD","tiers":[{"minQty":30,"value":0.4},{"minQty":10,"value":0.8}]}"#)
        XCTAssertEqual(issues.map(\.code), ["tier_not_ascending"])
        XCTAssertEqual(issues[0].severity, .error)
        XCTAssertEqual(issues[0].path, "tiers[1].minQty")
    }

    func testFirstTierAboveBaseIsWarning() throws {
        let issues = try price(#"{"value":1,"currency":"USD","tiers":[{"minQty":5,"value":1.2}]}"#)
        XCTAssertEqual(issues.map(\.code), ["tier_value_rose"])
        XCTAssertEqual(issues[0].severity, .warning)
        XCTAssertEqual(issues[0].path, "tiers[0].value")
    }

    func testUnknownPriceKey() throws {
        let issues = try price(#"{"value":1,"currency":"USD","note":"cash"}"#)
        XCTAssertEqual(issues.map(\.code), ["price_unknown_field"])
        XCTAssertEqual(issues[0].path, "note")
        XCTAssertEqual(issues[0].severity, .error)
    }

    private func price(_ json: String) throws -> [Issue] {
        PackValidator.priceIssues(object(json))
    }

    private func object(_ json: String) -> [String: Any] {
        (try! JSONSerialization.jsonObject(with: Data(json.utf8))) as! [String: Any]
    }
}

private func jsonDiff(_ left: Any, _ right: Any, path: String = "$") -> String? {
    if left is NSNull, right is NSNull { return nil }
    if let l = left as? [String: Any], let r = right as? [String: Any] {
        if Set(l.keys) != Set(r.keys) {
            let missing = Set(l.keys).subtracting(r.keys).sorted()
            let extra = Set(r.keys).subtracting(l.keys).sorted()
            return "\(path) keys missing=\(missing) extra=\(extra)"
        }
        for key in l.keys.sorted() {
            if let diff = jsonDiff(l[key]!, r[key]!, path: "\(path).\(key)") { return diff }
        }
        return nil
    }
    if let l = left as? [Any], let r = right as? [Any] {
        if l.count != r.count { return "\(path) count \(l.count) != \(r.count)" }
        for (index, item) in l.enumerated() {
            if let diff = jsonDiff(item, r[index], path: "\(path)[\(index)]") { return diff }
        }
        return nil
    }
    if let l = left as? NSNumber, let r = right as? NSNumber {
        let lBool = CFGetTypeID(l) == CFBooleanGetTypeID()
        let rBool = CFGetTypeID(r) == CFBooleanGetTypeID()
        if lBool || rBool { return lBool && rBool && l.boolValue == r.boolValue ? nil : "\(path) bool" }
        return l.doubleValue == r.doubleValue ? nil : "\(path) number \(l) != \(r)"
    }
    if let l = left as? String, let r = right as? String {
        return l == r ? nil : "\(path) \(l) != \(r)"
    }
    return "\(path) type mismatch"
}
