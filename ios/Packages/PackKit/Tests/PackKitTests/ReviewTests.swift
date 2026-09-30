import XCTest
@testable import PackKit

final class ReviewModelTests: XCTestCase {
    func testRescaleUsesRescaleAndKeepsTheNeckUnverified() {
        let scaled = ReviewModel.rescale(bottle(), axis: .height, to: 100)
        XCTAssertEqual(scaled.dimensions.heightMm, 100, accuracy: 1e-9)
        XCTAssertEqual(scaled.dimensions.widthMm, 50, accuracy: 1e-9)
        XCTAssertEqual(scaled.dimensions.depthMm, 50, accuracy: 1e-9)
        XCTAssertEqual(scaled.neckOuterDiameterMm ?? .nan, 25, accuracy: 1e-9)
        XCTAssertEqual(scaled.measurements.first { $0.key == "widthMm" }?.value ?? .nan, 50, accuracy: 1e-9)
        XCTAssertEqual(scaled.scan.dimsVerifiedBySupplier, false)
        XCTAssertEqual(scaled.scan.neckSuggestion?.verifiedBySupplier, false)
        XCTAssertEqual(scaled.band(for: "heightMm"), .ok)
    }

    func testDimensionErrorBlocksOutbox() {
        let scaled = ReviewModel.rescale(cap(), axis: .height, to: 80)
        XCTAssertGreaterThan(scaled.dimensions.widthMm, 48)
        XCTAssertTrue(ReviewModel.issues(scaled).contains { $0.code == "dimension_range" && $0.severity == .error && !$0.messageHe.isEmpty })
        XCTAssertTrue(ReviewModel.outboxBlocked(scaled))
    }

    func testCleanPartAndRisingTierWarningAllowOutbox() {
        let clean = cap()
        XCTAssertEqual(ReviewModel.issues(clean).filter { $0.severity == .error }, [])
        XCTAssertFalse(ReviewModel.outboxBlocked(clean))

        var warned = clean
        warned.price = ReviewPriceInput(
            value: 1,
            currency: "USD",
            moq: nil,
            tiers: [ReviewTierInput(minQty: 5, value: 1.2)]
        )
        let issues = ReviewModel.issues(warned)
        XCTAssertTrue(issues.contains { $0.code == "tier_value_rose" && $0.severity == .warning && !$0.messageHe.isEmpty })
        XCTAssertFalse(issues.contains { $0.severity == .error })
        XCTAssertFalse(ReviewModel.outboxBlocked(warned))
    }

    func testTierEqualToMoqBlocksWithHebrew() {
        var draft = cap()
        draft.price = ReviewPriceInput(
            value: 1,
            currency: "USD",
            moq: 5000,
            tiers: [ReviewTierInput(minQty: 5000, value: 0.9)]
        )
        let issues = ReviewModel.issues(draft)
        XCTAssertTrue(issues.contains { $0.code == "tier_not_above_moq" && $0.path.contains("minQty") && !$0.messageHe.isEmpty })
        XCTAssertTrue(ReviewModel.outboxBlocked(draft))
    }

    func testNeckEditStaysAdvisory() {
        let edited = ReviewModel.setNeck(bottle(), millimetres: 18.5)
        XCTAssertEqual(edited.neckOuterDiameterMm ?? .nan, 18.5, accuracy: 1e-9)
        XCTAssertEqual(edited.scan.neckSuggestion?.verifiedBySupplier, false)
        XCTAssertEqual(edited.scan.neckSuggestion?.confirmedByUser, false)
        XCTAssertEqual(edited.measurements.first { $0.key == "neckOuterDiameterMm" }?.value ?? .nan, 18.5, accuracy: 1e-9)
    }

    func testInvalidPriceInputKeepsTheSavedPrice() {
        let saved = Price(
            value: 1.25,
            currency: "USD",
            moq: 100,
            tiers: [PriceTier(minQty: 200, value: 1.1)],
            quotedAt: "2026-09-01"
        )
        let invalid = [
            ReviewPriceInput(value: nil, currency: "USD", moq: nil, tiers: []),
            ReviewPriceInput(value: 2, currency: "FOO", moq: nil, tiers: []),
            ReviewPriceInput(value: 2, currency: "USD", moq: nil, tiers: [ReviewTierInput(minQty: nil, value: nil)]),
        ]
        for input in invalid {
            let persisted = persistPrice(input, saved: saved)
            XCTAssertEqual(persisted, saved)
        }
    }

    func testClearedPriceInputClearsTheSavedPrice() {
        let saved = Price(value: 1.25, currency: "USD", moq: 100, quotedAt: "2026-09-01")
        XCTAssertNil(persistPrice(nil, saved: saved))
    }

    func testRebuiltPriceKeepsQuotedAt() {
        let saved = Price(value: 1.25, currency: "USD", quotedAt: "2026-09-01")
        let input = ReviewPriceInput(value: 2.5, currency: "₪", moq: 10, tiers: [ReviewTierInput(minQty: 20, value: 2)])
        let rebuilt = persistPrice(input, saved: saved)
        XCTAssertEqual(rebuilt?.value, 2.5)
        XCTAssertEqual(rebuilt?.currency, "ILS")
        XCTAssertEqual(rebuilt?.moq, 10)
        XCTAssertEqual(rebuilt?.tiers, [PriceTier(minQty: 20, value: 2)])
        XCTAssertEqual(rebuilt?.quotedAt, "2026-09-01")
    }

    private func persistPrice(_ input: ReviewPriceInput?, saved: Price) -> Price? {
        input == nil ? nil : (ReviewModel.storedPrice(input, quotedAt: saved.quotedAt) ?? saved)
    }

    func testDefaultFinishPerKind() {
        XCTAssertEqual(FinishCatalog.defaultFinish(for: .bottle), "clear")
        XCTAssertEqual(FinishCatalog.defaultFinish(for: .box), "matteBlack")
        XCTAssertEqual(FinishCatalog.defaultFinish(for: .cap), "gold")
        XCTAssertEqual(FinishCatalog.defaultFinish(for: .pump), "gold")
        XCTAssertEqual(FinishCatalog.defaultFinish(for: .collar), "gold")
        XCTAssertEqual(FinishCatalog.defaultFinish(for: .label), "gold")
        XCTAssertEqual(FinishCatalog.ids.count, 9)
        XCTAssertFalse(FinishCatalog.hebrewName("gold").isEmpty)
    }

    private func bottle() -> ReviewDraft {
        part(kind: .bottle, width: 40, height: 80, depth: 40, neck: 20)
    }

    private func cap() -> ReviewDraft {
        part(kind: .cap, width: 20, height: 20, depth: 20, neck: nil)
    }

    private func part(kind: PartKind, width: Double, height: Double, depth: Double, neck: Double?) -> ReviewDraft {
        let confidence = DimensionConfidence(
            key: "heightMm",
            model: DimensionErrorModel(sigmaScaleMm: 1, sigmaQuantisationMm: 0, sigmaParallaxMm: 0, totalMm: 1, band: .ok)
        )
        var measurements = [
            Measurements(key: "widthMm", value: width, source: "reference-card", toleranceMm: 5),
            Measurements(key: "heightMm", value: height, source: "reference-card", toleranceMm: 5),
            Measurements(key: "depthMm", value: depth, source: "reference-card", toleranceMm: 5),
        ]
        if let neck {
            measurements.append(Measurements(key: "neckOuterDiameterMm", value: neck, source: "reference-card", toleranceMm: 5))
        }
        return ReviewDraft(
            kind: kind,
            dimensions: Dimensions(widthMm: width, heightMm: height, depthMm: depth),
            confidence: [confidence],
            finish: FinishCatalog.defaultFinish(for: kind),
            colorHex: "#888888",
            colorSource: nil,
            neckOuterDiameterMm: neck,
            price: nil,
            profile: "cylinder",
            lathe: [0.5, 1, 0.5],
            measurements: measurements,
            scan: ScanInfo(
                method: "photo-lathe",
                capturedAt: "2026-09-29T00:00:00Z",
                neckSuggestion: ScanInfo.NeckSuggestion(
                    suggested: nil,
                    confidence: 0.4,
                    measuredMm: neck,
                    basis: "neckOuterDiameterMm",
                    confirmedByUser: false,
                    verifiedBySupplier: false
                ),
                dimsVerifiedBySupplier: false,
                toleranceMm: 5
            )
        )
    }
}

final class PriceRuleCoverageTests: XCTestCase {
    func testEachPriceRuleHasAHebrewMessage() throws {
        let cases: [(String, String, Issue.Severity)] = [
            (#"{"currency":"USD"}"#, "price_value", .error),
            (#"{"value":0,"currency":"USD"}"#, "price_value", .error),
            (#"{"value":1}"#, "price_currency", .error),
            (#"{"value":1,"currency":"FOO"}"#, "price_currency", .error),
            (#"{"value":1,"currency":"USD","note":"cash"}"#, "price_unknown_field", .error),
            (#"{"value":1,"currency":"USD","moq":0}"#, "price_moq", .error),
            (#"{"value":1,"currency":"USD","moq":1.5}"#, "price_moq", .error),
            (#"{"value":1,"currency":"USD","tiers":{}}"#, "price_tiers", .error),
            (#"{"value":1,"currency":"USD","tiers":[1]}"#, "tier_invalid", .error),
            (#"{"value":1,"currency":"USD","tiers":[{"value":1}]}"#, "tier_min_qty", .error),
            (#"{"value":1,"currency":"USD","moq":5000,"tiers":[{"minQty":5000,"value":0.9}]}"#, "tier_not_above_moq", .error),
            (#"{"value":1,"currency":"USD","tiers":[{"minQty":1,"value":1}]}"#, "tier_below_min", .error),
            (#"{"value":1,"currency":"USD","tiers":[{"minQty":30,"value":0.4},{"minQty":10,"value":0.8}]}"#, "tier_not_ascending", .error),
            (#"{"value":1,"currency":"USD","tiers":[{"minQty":5,"value":0}]}"#, "tier_value", .error),
            (#"{"value":1,"currency":"USD","tiers":[{"minQty":5,"value":1.2}]}"#, "tier_value_rose", .warning),
            (#"{"value":1,"currency":"USD","quotedAt":"yesterday"}"#, "price_quoted_at", .error),
        ]
        for (json, code, severity) in cases {
            let issues = try price(json)
            XCTAssertTrue(
                issues.contains { $0.code == code && $0.severity == severity && !$0.messageHe.isEmpty && !$0.messageEn.isEmpty },
                "\(code) from \(json) got \(issues.map(\.code))"
            )
        }
        XCTAssertEqual(PackValidator.normalizeCurrency("USD"), "USD")
        XCTAssertNil(PackValidator.normalizeCurrency("FOO"))
    }

    func testMixedPriceRulesKeepBlockingErrorsAndAWarning() throws {
        let issues = try price(#"""
        {"value":1,"currency":"USD","note":"cash","moq":100,"tiers":[{"minQty":100,"value":0.9},{"minQty":200,"value":1.5},{"minQty":150,"value":0.4}]}
        """#)
        XCTAssertTrue(issues.contains { $0.code == "price_unknown_field" && $0.severity == .error && !$0.messageHe.isEmpty })
        XCTAssertTrue(issues.contains { $0.code == "tier_not_above_moq" && $0.severity == .error && !$0.messageHe.isEmpty })
        XCTAssertTrue(issues.contains { $0.code == "tier_value_rose" && $0.severity == .warning && !$0.messageHe.isEmpty })
        XCTAssertTrue(issues.contains { $0.code == "tier_not_ascending" && $0.severity == .error && !$0.messageHe.isEmpty })
        XCTAssertTrue(issues.contains { $0.severity == .error })
    }

    private func price(_ json: String) throws -> [Issue] {
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any])
        return PackValidator.priceIssues(object)
    }
}

final class DominantColorTests: XCTestCase {
    func testIgnoresHighlightsAndShadowsInsideTheMask() {
        var pixels: [RGBPixel] = []
        var mask: [Bool] = []
        for _ in 0..<12 {
            pixels.append(RGBPixel(r: 200, g: 16, b: 16))
            mask.append(true)
        }
        pixels.append(RGBPixel(r: 255, g: 255, b: 255))
        mask.append(true)
        pixels.append(RGBPixel(r: 0, g: 0, b: 0))
        mask.append(true)
        pixels.append(RGBPixel(r: 0, g: 255, b: 0))
        mask.append(false)
        let hex = DominantColor.hex(pixels: pixels, mask: mask)
        XCTAssertEqual(hex, "#c81010")
    }

    func testLargestClusterWins() {
        var pixels = Array(repeating: RGBPixel(r: 20, g: 40, b: 220), count: 9)
        pixels.append(contentsOf: Array(repeating: RGBPixel(r: 220, g: 20, b: 20), count: 2))
        XCTAssertEqual(DominantColor.hex(pixels: pixels), "#1428dc")
    }

    func testEmptyMaskReturnsNil() {
        let pixels = [RGBPixel(r: 10, g: 10, b: 10)]
        XCTAssertNil(DominantColor.hex(pixels: pixels, mask: [false]))
        XCTAssertNil(DominantColor.hex(pixels: [RGBPixel(r: 255, g: 255, b: 255)]))
    }
}

final class PreviewFramingTests: XCTestCase {
    func testCapAndBottleFillTheSameFractionOfTheView() {
        let cap = PreviewFraming.frame(radiusMetres: 0.010)
        let bottle = PreviewFraming.frame(radiusMetres: 0.050)
        XCTAssertEqual(cap.fill, bottle.fill, accuracy: 1e-9)
        XCTAssertEqual(bottle.distance / cap.distance, 5, accuracy: 1e-6)
        XCTAssertEqual(bottle.near / cap.near, 5, accuracy: 1e-6)
        XCTAssertLessThan(cap.near, 0.01)
        XCTAssertLessThan(bottle.near, 0.05)
        XCTAssertLessThan(cap.near, cap.distance)
        XCTAssertGreaterThan(cap.far, cap.distance + 0.010)
        XCTAssertGreaterThan(bottle.far, bottle.distance + 0.050)
        XCTAssertEqual(angularFill(cap), cap.fill, accuracy: 1e-6)
        XCTAssertEqual(angularFill(bottle), bottle.fill, accuracy: 1e-6)
    }

    private func angularFill(_ frame: PreviewFraming.Frame) -> Double {
        let radius = frame.distance * tan(frame.fill * 30 * Double.pi / 180)
        let fov = 60 * Double.pi / 180
        return (2 * atan(radius / frame.distance)) / fov
    }
}
