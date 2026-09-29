import Foundation
import XCTest
@testable import PackKit

final class ParallaxCorrectionTests: XCTestCase {
    func testIteratedFactorMatchesTwoSteps() {
        let apparent = 22.36
        let distance = 200.0
        let once = apparent * (distance - apparent) / distance
        let twice = apparent * (distance - once) / distance
        let radius = ParallaxCorrection.correctedRadius(apparentRadiusMm: apparent, distanceMm: distance, iterations: 2)
        XCTAssertEqual(radius, twice, accuracy: 1e-9)
        XCTAssertEqual(ParallaxCorrection.roundFactor(radiusMm: radius, distanceMm: distance), (distance - twice) / distance, accuracy: 1e-9)
        XCTAssertEqual(ParallaxCorrection.correctRound(apparentMm: 100, distanceMm: 200, radiusMm: 20), 90, accuracy: 1e-9)
        XCTAssertEqual(ParallaxCorrection.correctBoxFront(apparentMm: 42), 42, accuracy: 1e-12)
        XCTAssertEqual(ParallaxCorrection.flatEndDepthMm(distanceMm: 200, radiusMm: 20), 160, accuracy: 1e-12)
    }

    func testTangentRadiusAgreesWithTheAxisFormula() {
        let intrinsics = Synthetic.intrinsics
        let distance = 200.0
        let radius = 20.0
        let axisZ = distance - radius
        let axisX = 30.0
        let centre = atan(axisX / axisZ)
        let distanceToAxis = hypot(axisX, axisZ)
        let half = asin(radius / distanceToAxis)
        let left = intrinsics.cx + intrinsics.fx * tan(centre - half)
        let right = intrinsics.cx + intrinsics.fx * tan(centre + half)
        let solved = ParallaxCorrection.radiusFromTangents(leftPixel: left, rightPixel: right, intrinsics: intrinsics, distanceMm: distance)
        XCTAssertEqual(solved ?? .nan, radius, accuracy: 1e-6)
        let about = ParallaxCorrection.radiusAboutAxis(leftPixel: left, rightPixel: right, intrinsics: intrinsics, axisXMm: axisX, axisZMm: axisZ)
        XCTAssertEqual(about ?? .nan, radius, accuracy: 1e-6)
    }
}

final class ScaleRuleTests: XCTestCase {
    func testCapPumpCollarAndSmallPartsNeedAReference() {
        for kind in [PartKind.cap, .pump, .collar] {
            let blocked = ScaleRule.evaluate(kind: kind, measuredSizeMm: 30, hasReferenceObject: false, hasTypedDimension: false, hasAuto: false, manualMillimetres: nil, autoMillimetres: nil)
            XCTAssertTrue(blocked.saveBlocked, kind.rawValue)
            XCTAssertEqual(blocked.issues.map(\.code), ["scale_reference_required"])
            XCTAssertFalse(blocked.issues[0].messageHe.isEmpty)
            XCTAssertFalse(blocked.issues[0].messageEn.isEmpty)
        }
        let smallBottle = ScaleRule.evaluate(kind: .bottle, measuredSizeMm: 79.9, hasReferenceObject: false, hasTypedDimension: false, hasAuto: false, manualMillimetres: nil, autoMillimetres: nil)
        XCTAssertTrue(smallBottle.saveBlocked)
        let typedCap = ScaleRule.evaluate(kind: .cap, measuredSizeMm: 30, hasReferenceObject: false, hasTypedDimension: true, hasAuto: false, manualMillimetres: 30, autoMillimetres: nil)
        XCTAssertFalse(typedCap.saveBlocked)
        let cardCap = ScaleRule.evaluate(kind: .cap, measuredSizeMm: 30, hasReferenceObject: true, hasTypedDimension: false, hasAuto: false, manualMillimetres: 30, autoMillimetres: nil)
        XCTAssertFalse(cardCap.saveBlocked)
    }

    func testAutoScaleIsRejectedForACapAndAllowedForALargeBottle() {
        let cap = ScaleRule.evaluate(kind: .cap, measuredSizeMm: 30, hasReferenceObject: false, hasTypedDimension: false, hasAuto: true, manualMillimetres: nil, autoMillimetres: 30)
        XCTAssertTrue(cap.autoRejected)
        XCTAssertTrue(cap.saveBlocked)
        XCTAssertTrue(cap.issues.contains { $0.code == "scale_auto_not_allowed" })
        let pump = ScaleRule.evaluate(kind: .pump, measuredSizeMm: 90, hasReferenceObject: false, hasTypedDimension: false, hasAuto: true, manualMillimetres: nil, autoMillimetres: 90)
        XCTAssertTrue(pump.autoRejected)
        let small = ScaleRule.evaluate(kind: .bottle, measuredSizeMm: 70, hasReferenceObject: false, hasTypedDimension: false, hasAuto: true, manualMillimetres: nil, autoMillimetres: 70)
        XCTAssertTrue(small.autoRejected)
        XCTAssertTrue(small.saveBlocked)
        let bottle = ScaleRule.evaluate(kind: .bottle, measuredSizeMm: 100, hasReferenceObject: false, hasTypedDimension: false, hasAuto: true, manualMillimetres: nil, autoMillimetres: 100)
        XCTAssertFalse(bottle.autoRejected)
        XCTAssertFalse(bottle.saveBlocked)
        let box = ScaleRule.evaluate(kind: .box, measuredSizeMm: 80, hasReferenceObject: false, hasTypedDimension: false, hasAuto: true, manualMillimetres: nil, autoMillimetres: 80)
        XCTAssertFalse(box.saveBlocked)
    }

    func testSuspectWhenAutoAndManualDifferByMoreThan5mm() {
        let flag = ScaleRule.evaluate(kind: .bottle, measuredSizeMm: 100, hasReferenceObject: true, hasTypedDimension: false, hasAuto: true, manualMillimetres: 100, autoMillimetres: 105.1)
        XCTAssertTrue(flag.suspect)
        XCTAssertFalse(flag.saveBlocked)
        XCTAssertEqual(flag.issues.map(\.code), ["scale_suspect"])
        let exact = ScaleRule.evaluate(kind: .bottle, measuredSizeMm: 100, hasReferenceObject: true, hasTypedDimension: false, hasAuto: true, manualMillimetres: 100, autoMillimetres: 105)
        XCTAssertFalse(exact.suspect, "a difference of 5 mm is not over the limit")
        let close = ScaleRule.evaluate(kind: .box, measuredSizeMm: 120, hasReferenceObject: true, hasTypedDimension: false, hasAuto: true, manualMillimetres: 120, autoMillimetres: 124)
        XCTAssertFalse(close.suspect)
    }
}

final class ScaleSolverTests: XCTestCase {
    func testCardPlaneMapsCornersAndRejectsASmallOrSteepCard() {
        let corners = Synthetic.cardCorners(tilt: 0, axis: "y", centerX: 0)
        let solved = ScaleSolver.solve(reference: .card(corners), intrinsics: Synthetic.intrinsics, frame: Synthetic.frame)
        XCTAssertTrue(solved.isUsable)
        XCTAssertEqual(solved.depthMm ?? .nan, 200, accuracy: 0.05)
        XCTAssertEqual(solved.tiltDegrees ?? .nan, 0, accuracy: 0.05)
        XCTAssertGreaterThanOrEqual(solved.cardAreaFraction ?? 0, ScaleLimits.minimumCardAreaFraction)
        let plane = PoseMathVisible.halfSize
        let back = solved.plane?.planeMm(fromPixel: corners[0])
        XCTAssertEqual(back?.x ?? .nan, -plane.width, accuracy: 0.05)
        XCTAssertEqual(back?.y ?? .nan, -plane.height, accuracy: 0.05)
        XCTAssertEqual(solved.referenceObject, "ISO/IEC 7810 ID-1 card 85.60x53.98mm")
        XCTAssertEqual(solved.scanScale, "reference-card")

        let custom = CardReference(widthMm: 100, heightMm: 60)
        let customCorners = Synthetic.cardCorners(tilt: 0, axis: "y", centerX: 0, size: custom)
        let customSolve = ScaleSolver.solve(reference: .card(customCorners, size: custom), intrinsics: Synthetic.intrinsics, frame: Synthetic.frame)
        XCTAssertEqual(customSolve.depthMm ?? .nan, 200, accuracy: 0.05)
        XCTAssertEqual(customSolve.referenceObject, "printed card 100x60mm")

        let tiny = ScaleSolver.solve(reference: .card(corners), intrinsics: Synthetic.intrinsics, frame: PixelSize(width: 5000, height: 4000))
        XCTAssertEqual(tiny.issue?.code, "card_too_small")
        XCTAssertTrue(tiny.issue?.blocksSave == true)
        XCTAssertFalse(tiny.isUsable)

        let tiltedTen = Synthetic.cardCorners(tilt: 10, axis: "y", centerX: 0)
        let ten = ScaleSolver.solve(reference: .card(tiltedTen), intrinsics: Synthetic.intrinsics, frame: Synthetic.frame)
        let halfW = CardReference.id1.widthMm / 2
        let halfH = CardReference.id1.heightMm / 2
        let expected = [SIMD2(-halfW, -halfH), SIMD2(halfW, -halfH), SIMD2(halfW, halfH), SIMD2(-halfW, halfH)]
        for (pixel, want) in zip(tiltedTen, expected) {
            let got = ten.plane?.planeMm(fromPixel: pixel)
            XCTAssertEqual(got?.x ?? .nan, want.x, accuracy: 0.2, "tilt 10 x \(pixel)")
            XCTAssertEqual(got?.y ?? .nan, want.y, accuracy: 0.2, "tilt 10 y \(pixel)")
        }

        let steep = Synthetic.cardCorners(tilt: 30, axis: "x", centerX: 0)
        let tilted = ScaleSolver.solve(reference: .card(steep), intrinsics: Synthetic.intrinsics, frame: Synthetic.frame)
        XCTAssertEqual(tilted.issue?.code, "card_tilt")
        XCTAssertGreaterThan(tilted.tiltDegrees ?? 0, 25)
    }

    func testCoinRulerAndTypedScales() {
        let coin = CoinTable.coin(id: "ils-10-agorot")!
        XCTAssertEqual(coin.diameterMm, 22, accuracy: 1e-9)
        let solved = ScaleSolver.solve(
            reference: .coin(coin, p1: SIMD2(10, 40), p2: SIMD2(110, 40)),
            intrinsics: Synthetic.intrinsics,
            frame: Synthetic.frame
        )
        XCTAssertEqual(solved.mmPerPx, 0.22, accuracy: 1e-9)
        XCTAssertEqual(solved.source, .coin)
        XCTAssertGreaterThanOrEqual(solved.sigmaScaleMm, 3)

        let ruler = ScaleSolver.solve(
            reference: .ruler(p1: SIMD2(0, 0), p2: SIMD2(0, 250), mm: 50),
            intrinsics: Synthetic.intrinsics,
            frame: Synthetic.frame
        )
        XCTAssertEqual(ruler.mmPerPx, 0.2, accuracy: 1e-9)
        XCTAssertEqual(ruler.scanScale, "ruler")
        XCTAssertEqual(ruler.measurementSource, "ruler")

        let custom = ScaleSolver.solve(
            reference: .custom(p1: SIMD2(0, 0), p2: SIMD2(80, 0), mm: 40),
            intrinsics: Synthetic.intrinsics,
            frame: Synthetic.frame
        )
        XCTAssertEqual(custom.mmPerPx, 0.5, accuracy: 1e-9)

        let typed = ScaleSolver.solve(
            reference: .typedDimension(axis: .height, mm: 100),
            intrinsics: Synthetic.intrinsics,
            frame: Synthetic.frame,
            extent: PixelExtent(widthPx: 80, heightPx: 400)
        )
        XCTAssertEqual(typed.mmPerPx, 0.25, accuracy: 1e-9)
        XCTAssertEqual(typed.scanScale, "manual")
    }
}

final class ShapeClassifierTests: XCTestCase {
    func testNamedProfiles() {
        let flat = Array(repeating: 20.0, count: 42)
        XCTAssertEqual(ShapeClassifier.classify(radiiMm: flat, rectangleFit: 0.99, kind: .bottle), .cylinder)
        XCTAssertEqual(ShapeClassifier.classify(radiiMm: flat, rectangleFit: 0.99, kind: .box), .cube)
        XCTAssertEqual(ShapeClassifier.classify(radiiMm: flat, rectangleFit: 0.99, kind: .label), .other)
        let taper = (0..<42).map { 20 - 10 * Double($0) / 41 }
        XCTAssertEqual(ShapeClassifier.classify(radiiMm: taper, rectangleFit: 0.2, kind: .bottle), .taper)
        var dome = Array(repeating: 18.0, count: 42)
        for index in 30..<42 {
            let t = Double(index - 30) / 11
            dome[index] = 18 * max(0, 1 - t * t).squareRoot()
        }
        XCTAssertEqual(ShapeClassifier.classify(radiiMm: dome, rectangleFit: 0.7, kind: .cap), .dome)
        let sphere = (0..<42).map { index -> Double in
            let t = Double(index) / 41
            return 26 * max(0, 1 - pow(2 * t - 1, 2)).squareRoot()
        }
        XCTAssertEqual(ShapeClassifier.classify(radiiMm: sphere, rectangleFit: 0.1, kind: .bottle), .sphere)
    }
}

final class RescaleTests: XCTestCase {
    func testEditingHeightScalesTheOthersUniformly() {
        let dimensions = Dimensions(widthMm: 40, heightMm: 100, depthMm: 40)
        let scaled = Rescale.dimensions(dimensions, axis: .height, to: 80)
        XCTAssertEqual(scaled.heightMm, 80, accuracy: 1e-9)
        XCTAssertEqual(scaled.widthMm, 32, accuracy: 1e-9)
        XCTAssertEqual(scaled.depthMm, 32, accuracy: 1e-9)
        let wider = Rescale.dimensions(dimensions, axis: .width, to: 50)
        XCTAssertEqual(wider.widthMm, 50, accuracy: 1e-9)
        XCTAssertEqual(wider.heightMm, 125, accuracy: 1e-9)
        XCTAssertEqual(wider.depthMm, 50, accuracy: 1e-9)
    }
}

final class MeasureAccuracyTests: XCTestCase {
    func testSyntheticBottleAndCap() {
        var table: [String] = ["case | true H,W,D mm | measured H,W,D mm | error H,W,D mm"]
        func record(_ name: String, _ result: MeasureResult, _ trueHeight: Double, _ trueWidth: Double, _ trueDepth: Double, limit: Double) {
            let dims = result.dimensions
            let errH = dims.heightMm - trueHeight
            let errW = dims.widthMm - trueWidth
            let errD = dims.depthMm - trueDepth
            table.append(String(format: "%@ | %.2f, %.2f, %.2f | %.2f, %.2f, %.2f | %+.2f, %+.2f, %+.2f",
                                name, trueHeight, trueWidth, trueDepth, dims.heightMm, dims.widthMm, dims.depthMm, errH, errW, errD))
            XCTAssertEqual(dims.heightMm, trueHeight, accuracy: limit, name)
            XCTAssertEqual(dims.widthMm, trueWidth, accuracy: limit, name)
            XCTAssertEqual(dims.depthMm, trueDepth, accuracy: limit, name)
            XCTAssertLessThanOrEqual(max(abs(errH), abs(errW), abs(errD)), 5, name)
        }

        let bottle = Synthetic.cylinder(radius: 20, heightMm: 100)
        let cap = Synthetic.cylinder(radius: 15, heightMm: 25)
        for tilt in [0.0, 10, -10] {
            for axis in ["y", "x"] {
                let measured = Synthetic.measure(kind: .bottle, mask: bottle, tilt: tilt, axis: axis)
                record("bottle tilt \(tilt) \(axis)", measured, 100, 40, 40, limit: 2)
                if tilt == 0, axis == "y" {
                    XCTAssertFalse(measured.saveBlocked)
                    XCTAssertFalse(measured.suspect)
                    XCTAssertEqual(measured.dimsVerifiedBySupplier, false)
                    XCTAssertEqual(measured.toleranceMm, 5, accuracy: 1e-9)
                    XCTAssertEqual(measured.scan?.dimsVerifiedBySupplier, false)
                    XCTAssertEqual(measured.scan?.toleranceMm, 5)
                    XCTAssertEqual(measured.scan?.scale, "reference-card")
                    XCTAssertEqual(measured.confidence.first?.model.band, .ok)
                    XCTAssertLessThanOrEqual(measured.confidence[0].model.totalMm, 3)
                    XCTAssertGreaterThan(measured.confidence[0].model.sigmaScaleMm, 0)
                    XCTAssertGreaterThan(measured.confidence[0].model.sigmaQuantisationMm, 0)
                    XCTAssertEqual(measured.lathe?.count, LatheProfile.sampleCount)
                    XCTAssertTrue(measured.lathe?.allSatisfy { $0 >= 0.04 && $0 <= 1.2 } == true)
                    XCTAssertEqual(measured.shape, .cylinder)
                    XCTAssertEqual(measured.neckOuterDiameterMm ?? .nan, measured.dimensions.widthMm, accuracy: 2)
                    let issues = measured.validationIssues().filter { $0.code == "dimension_range" || $0.code == "dimension_invalid" }
                    XCTAssertEqual(issues, [])
                    let pack = try! JSONDecoder().decode(SupplierPack.self, from: measured.packJSON()!)
                    XCTAssertEqual(pack.parts[0].scan?.dimsVerifiedBySupplier, false)
                    XCTAssertEqual(pack.parts[0].lathe?.count, 42)
                }
            }
        }
        for tilt in [0.0, 10, -10] {
            let measured = Synthetic.measure(kind: .cap, mask: cap, tilt: tilt, axis: "y")
            record("cap tilt \(tilt)", measured, 25, 30, 30, limit: 2)
        }
        for noise in [0.5, 1.0] {
            for tilt in [10.0, -10] {
                let measured = Synthetic.measure(kind: .bottle, mask: bottle, tilt: tilt, axis: tilt > 0 ? "y" : "x", noise: noise, seed: 11)
                record("bottle noise \(noise) tilt \(tilt)", measured, 100, 40, 40, limit: 2)
            }
        }
        var worst = 0.0
        var worstName = ""
        for seed in 1...4 {
            for noise in [0.5, 1.0] {
                for tilt in [10.0, -10.0] {
                    let measured = Synthetic.measure(kind: .bottle, mask: bottle, tilt: tilt, axis: "y", noise: noise, seed: UInt64(seed))
                    let err = max(
                        abs(measured.dimensions.heightMm - 100),
                        abs(measured.dimensions.widthMm - 40),
                        abs(measured.dimensions.depthMm - 40)
                    )
                    if err > worst {
                        worst = err
                        worstName = "seed \(seed) noise \(noise) tilt \(tilt)"
                    }
                    XCTAssertLessThanOrEqual(err, 5, "worst-case \(worstName)")
                }
            }
        }
        table.append(String(format: "worst noise (%@) | 100, 40, 40 | — | %.2f", worstName, worst))
        print(table.joined(separator: "\n"))
    }

    func testTaperDomeSphereAndBox() {
        let taper = Synthetic.revolve(radius: 20, topRadius: 10, heightMm: 90, slices: 80)
        let taperResult = Synthetic.measure(kind: .bottle, mask: taper, tilt: 0, axis: "y")
        XCTAssertEqual(taperResult.shape, .taper, "radii \(taperResult.profile?.radiiMm ?? [])")

        let dome = Synthetic.dome(bodyRadius: 18, bodyHeight: 60)
        let domeResult = Synthetic.measure(kind: .cap, mask: dome, tilt: 0, axis: "y")
        XCTAssertEqual(domeResult.shape, .dome, "radii \(domeResult.profile?.radiiMm ?? [])")

        let sphere = Synthetic.sphere(radius: 26)
        let sphereResult = Synthetic.measure(kind: .bottle, mask: sphere, tilt: 0, axis: "y")
        XCTAssertEqual(sphereResult.shape, .sphere, "radii \(sphereResult.profile?.radiiMm ?? [])")

        for tilt in [0.0, 10] {
            let front = Synthetic.quad(planeCenter: SIMD2(75, 0), widthMm: 60, heightMm: 100, tilt: tilt, axis: "y", cardCenterX: 0)
            let side = Synthetic.quad(planeCenter: SIMD2(-95, 0), widthMm: 40, heightMm: 100, tilt: tilt, axis: "y", cardCenterX: 0)
            let corners = Synthetic.cardCorners(tilt: tilt, axis: "y", centerX: 0)
            let result = MeasureEstimator.estimate(MeasureRequest(
                kind: .box,
                intrinsics: Synthetic.intrinsics,
                frame: Synthetic.frame,
                reference: .card(corners),
                front: front,
                side: side
            ))
            let dims = result.dimensions
            print(String(format: "box tilt %.1f | 100.00, 60.00, 40.00 | %.2f, %.2f, %.2f | %+.2f, %+.2f, %+.2f",
                         tilt, dims.heightMm, dims.widthMm, dims.depthMm, dims.heightMm - 100, dims.widthMm - 60, dims.depthMm - 40))
            XCTAssertEqual(result.dimensions.widthMm, 60, accuracy: 2, "box width tilt \(tilt)")
            XCTAssertEqual(result.dimensions.heightMm, 100, accuracy: 2, "box height tilt \(tilt)")
            XCTAssertEqual(result.dimensions.depthMm, 40, accuracy: 2, "box depth tilt \(tilt)")
            XCTAssertEqual(result.shape, .cube)
            XCTAssertLessThanOrEqual(abs(result.dimensions.heightMm - 100), 5)
        }

        let label = Synthetic.quad(planeCenter: SIMD2(70, 0), widthMm: 80, heightMm: 36, tilt: 0, axis: "y", cardCenterX: 0)
        let labelResult = MeasureEstimator.estimate(MeasureRequest(
            kind: .label,
            intrinsics: Synthetic.intrinsics,
            frame: Synthetic.frame,
            reference: .card(Synthetic.cardCorners(tilt: 0, axis: "y", centerX: 0)),
            front: label
        ))
        let labelDims = labelResult.dimensions
        print(String(format: "label tilt 0.0 | 36.00, 80.00, 0.00 | %.2f, %.2f, %.2f | %+.2f, %+.2f, %+.2f",
                     labelDims.heightMm, labelDims.widthMm, labelDims.depthMm, labelDims.heightMm - 36, labelDims.widthMm - 80, labelDims.depthMm))
        XCTAssertEqual(labelResult.dimensions.widthMm, 80, accuracy: 2)
        XCTAssertEqual(labelResult.dimensions.heightMm, 36, accuracy: 2)
        XCTAssertEqual(labelResult.dimensions.depthMm, 0, accuracy: 1e-6)
        XCTAssertEqual(labelResult.validationIssues().filter { $0.code.hasPrefix("dimension") }, [])
    }

    func testCoinRulerTypedPathsAndAWidenedRow() {
        let mask = Synthetic.filled(x: 100..<300, y: 200..<600)
        let coin = MeasureEstimator.estimate(MeasureRequest(
            kind: .bottle,
            intrinsics: Synthetic.intrinsics,
            frame: Synthetic.frame,
            reference: .coin(CoinTable.coin(id: "ils-10-agorot")!, p1: SIMD2(0, 0), p2: SIMD2(100, 0)),
            front: mask
        ))
        XCTAssertEqual(coin.dimensions.heightMm, 88, accuracy: 0.05)
        XCTAssertEqual(coin.dimensions.widthMm, 44, accuracy: 0.05)
        XCTAssertEqual(coin.confidence[0].model.band, .check)
        XCTAssertFalse(coin.saveBlocked)

        let ruler = MeasureEstimator.estimate(MeasureRequest(
            kind: .label,
            intrinsics: Synthetic.intrinsics,
            frame: Synthetic.frame,
            reference: .ruler(p1: SIMD2(0, 0), p2: SIMD2(250, 0), mm: 50),
            front: mask
        ))
        XCTAssertEqual(ruler.dimensions.widthMm, 40, accuracy: 0.05)
        XCTAssertEqual(ruler.dimensions.heightMm, 80, accuracy: 0.05)
        XCTAssertEqual(ruler.dimensions.depthMm, 0, accuracy: 1e-9)
        XCTAssertEqual(ruler.measurements.first { $0.key == "widthMm" }?.source, "ruler")

        let typed = MeasureEstimator.estimate(MeasureRequest(
            kind: .bottle,
            intrinsics: Synthetic.intrinsics,
            frame: Synthetic.frame,
            reference: .typedDimension(axis: .height, mm: 100),
            front: mask
        ))
        XCTAssertEqual(typed.dimensions.heightMm, 100, accuracy: 0.05)
        XCTAssertEqual(typed.dimensions.widthMm, 50, accuracy: 0.05)
        XCTAssertEqual(typed.confidence[0].model.band, .check)
        XCTAssertFalse(typed.saveBlocked)

        var spiked = Synthetic.cylinder(radius: 20, heightMm: 100)
        let mid = spiked.height / 2
        for x in 0..<40 { spiked.pixels[mid * spiked.width + x] = 255 }
        let cleaned = Synthetic.measure(kind: .bottle, mask: spiked, tilt: 0, axis: "y")
        XCTAssertEqual(cleaned.dimensions.widthMm, 40, accuracy: 2)
    }

    func testScaleRuleBlocksInsideTheEstimator() {
        let cap = MeasureEstimator.estimate(MeasureRequest(kind: .cap, intrinsics: Synthetic.intrinsics, frame: Synthetic.frame))
        XCTAssertTrue(cap.saveBlocked)
        XCTAssertEqual(cap.confidence[0].model.band, .retake)
        XCTAssertTrue(cap.issues.contains { $0.code == "scale_reference_required" })

        let autoCap = MeasureEstimator.estimate(MeasureRequest(
            kind: .cap,
            intrinsics: Synthetic.intrinsics,
            frame: Synthetic.frame,
            autoScale: .auto(source: .lidar, mmPerPx: 0.2)
        ))
        XCTAssertTrue(autoCap.saveBlocked)
        XCTAssertTrue(autoCap.issues.contains { $0.code == "scale_auto_not_allowed" })

        let mask = Synthetic.filled(x: 100..<300, y: 100..<500)
        let autoBottle = MeasureEstimator.estimate(MeasureRequest(
            kind: .bottle,
            intrinsics: Synthetic.intrinsics,
            frame: Synthetic.frame,
            autoScale: .auto(source: .lidar, mmPerPx: 0.25),
            front: mask
        ))
        XCTAssertFalse(autoBottle.saveBlocked)
        XCTAssertEqual(autoBottle.dimensions.heightMm, 100, accuracy: 0.05)
        XCTAssertGreaterThanOrEqual(max(autoBottle.dimensions.heightMm, autoBottle.dimensions.widthMm), 80)
        XCTAssertEqual(autoBottle.scan?.scale, "lidar")

        let bottle = Synthetic.cylinder(radius: 20, heightMm: 100)
        let rows = bottle.rows()
        let pixelHeight = Double(rows.last!.y - rows.first!.y + 1)
        let suspect = MeasureEstimator.estimate(MeasureRequest(
            kind: .bottle,
            intrinsics: Synthetic.intrinsics,
            frame: Synthetic.frame,
            reference: .card(Synthetic.cardCorners(tilt: 0, axis: "y")),
            autoScale: .auto(source: .lidar, mmPerPx: 112 / pixelHeight),
            front: bottle
        ))
        XCTAssertTrue(suspect.suspect)
        XCTAssertFalse(suspect.saveBlocked)
        XCTAssertTrue(suspect.issues.contains { $0.code == "scale_suspect" })

        let fine = MeasureEstimator.estimate(MeasureRequest(
            kind: .bottle,
            intrinsics: Synthetic.intrinsics,
            frame: Synthetic.frame,
            reference: .card(Synthetic.cardCorners(tilt: 0, axis: "y")),
            autoScale: .auto(source: .objectCapture, mmPerPx: 103 / pixelHeight),
            front: bottle
        ))
        XCTAssertFalse(fine.suspect)

        let edited = Synthetic.measure(kind: .bottle, mask: bottle, tilt: 0, axis: "y", outlineEdited: true)
        XCTAssertEqual(edited.confidence[0].model.band, .check)
        XCTAssertGreaterThan(edited.confidence[0].model.totalMm, 3)
        XCTAssertLessThanOrEqual(edited.confidence[0].model.totalMm, 5)

        let steepCard = Synthetic.cardCorners(tilt: 20, axis: "x", centerX: 0)
        let strong = MeasureEstimator.estimate(MeasureRequest(
            kind: .bottle,
            intrinsics: Synthetic.intrinsics,
            frame: PixelSize(width: 1500, height: 1100),
            reference: .card(steepCard),
            front: bottle
        ))
        XCTAssertEqual(strong.scale?.issue?.code, nil)
        XCTAssertGreaterThanOrEqual(strong.scale?.tiltDegrees ?? 0, 15)
        XCTAssertLessThanOrEqual(strong.scale?.tiltDegrees ?? 90, 25)
        XCTAssertEqual(strong.confidence[0].model.band, .check)
    }

    func testRescaleKeepsTheLatheNormalisedAndTheSupplierFlagFalse() {
        let bottle = Synthetic.cylinder(radius: 20, heightMm: 100)
        let measured = Synthetic.measure(kind: .bottle, mask: bottle, tilt: 0, axis: "y")
        let edited = Rescale.apply(measured, axis: .height, to: 80)
        let factor = 80 / measured.dimensions.heightMm
        XCTAssertEqual(edited.dimensions.heightMm, 80, accuracy: 1e-6)
        XCTAssertEqual(edited.dimensions.widthMm, measured.dimensions.widthMm * factor, accuracy: 1e-6)
        XCTAssertEqual(edited.dimensions.depthMm, measured.dimensions.depthMm * factor, accuracy: 1e-6)
        XCTAssertEqual(edited.lathe, measured.lathe)
        XCTAssertEqual(edited.profile?.radiiMm[0] ?? .nan, (measured.profile?.radiiMm[0] ?? .nan) * factor, accuracy: 1e-6)
        XCTAssertEqual(edited.dimsVerifiedBySupplier, false)
        XCTAssertEqual(edited.toleranceMm, 5, accuracy: 1e-9)
        XCTAssertEqual(edited.scan?.dimsVerifiedBySupplier, false)
        let height = edited.measurements.first { $0.key == "heightMm" }
        XCTAssertEqual(height?.value ?? .nan, 80, accuracy: 1e-6)
    }
}

private enum PoseMathVisible {
    static let halfSize = (width: CardReference.id1.widthMm / 2, height: CardReference.id1.heightMm / 2)
}

private enum Synthetic {
    static let intrinsics = CameraIntrinsics(fx: 1500, fy: 1500, cx: 960, cy: 720)
    static let width = 1920
    static let height = 1440
    static let frame = PixelSize(width: 1920, height: 1440)
    static let distance = 200.0

    static func measure(
        kind: PartKind,
        mask: Silhouette,
        tilt: Double,
        axis: String,
        noise: Double = 0,
        seed: UInt64 = 1,
        outlineEdited: Bool = false,
        centerX: Double = -80
    ) -> MeasureResult {
        MeasureEstimator.estimate(MeasureRequest(
            kind: kind,
            intrinsics: intrinsics,
            frame: frame,
            reference: .card(cardCorners(tilt: tilt, axis: axis, noise: noise, seed: seed, centerX: centerX)),
            front: mask,
            outlineEdited: outlineEdited,
            device: "iPhone15,4"
        ))
    }

    static func cardCorners(
        tilt: Double,
        axis: String,
        noise: Double = 0,
        seed: UInt64 = 1,
        centerX: Double = -80,
        size: CardReference = .id1
    ) -> [SIMD2<Double>] {
        let w = size.widthMm / 2
        let h = size.heightMm / 2
        let model = [SIMD3(-w, -h, 0), SIMD3(w, -h, 0), SIMD3(w, h, 0), SIMD3(-w, h, 0)]
        var rng = SplitMix(state: seed)
        return model.map { point in
            let camera = rotate(point, degrees: tilt, axis: axis) + SIMD3(centerX, 0, distance)
            var pixel = project(camera)
            if noise > 0 {
                pixel += SIMD2(rng.gaussian() * noise, rng.gaussian() * noise)
            }
            return pixel
        }
    }

    static func cylinder(radius: Double, heightMm: Double, axisX: Double = 0) -> Silhouette {
        revolve(yTop: -heightMm / 2, yBottom: heightMm / 2, axisX: axisX, axisZ: distance - radius, slices: 2) { _ in radius }
    }

    static func revolve(radius: Double, topRadius: Double, heightMm: Double, slices: Int) -> Silhouette {
        let yTop = -heightMm / 2
        let yBottom = heightMm / 2
        return revolve(yTop: yTop, yBottom: yBottom, axisX: 0, axisZ: distance - radius, slices: slices) { y in
            let t = (y - yTop) / heightMm
            return radius + (topRadius - radius) * t
        }
    }

    static func dome(bodyRadius: Double, bodyHeight: Double) -> Silhouette {
        let yTop = -(bodyHeight + bodyRadius) / 2
        let yBottom = (bodyHeight + bodyRadius) / 2
        let shoulder = yTop + bodyRadius
        return revolve(yTop: yTop, yBottom: yBottom, axisX: 0, axisZ: distance - bodyRadius, slices: 100) { y in
            if y >= shoulder { return bodyRadius }
            let dy = shoulder - y
            let inside = bodyRadius * bodyRadius - dy * dy
            return inside > 0 ? inside.squareRoot() : 0
        }
    }

    static func sphere(radius: Double) -> Silhouette {
        revolve(yTop: -radius, yBottom: radius, axisX: 0, axisZ: distance - radius, slices: 120) { y in
            let inside = radius * radius - y * y
            return inside > 0 ? inside.squareRoot() : 0
        }
    }

    static func revolve(
        yTop: Double,
        yBottom: Double,
        axisX: Double,
        axisZ: Double,
        slices: Int,
        radiusAtY: (Double) -> Double
    ) -> Silhouette {
        var minV = [Double](repeating: .infinity, count: width)
        var maxV = [Double](repeating: -.infinity, count: width)
        let steps = max(2, slices)
        for slice in 0..<steps {
            let y = yTop + (yBottom - yTop) * Double(slice) / Double(steps - 1)
            let radius = radiusAtY(y)
            guard radius > 0 else { continue }
            let angles = max(180, Int(radius * 12))
            for step in 0..<angles {
                let angle = 2 * Double.pi * Double(step) / Double(angles)
                let point = SIMD3(axisX + radius * cos(angle), y, axisZ + radius * sin(angle))
                guard point.z > 1 else { continue }
                let pixel = project(point)
                let column = Int(pixel.x.rounded())
                guard column >= 0, column < width else { continue }
                minV[column] = min(minV[column], pixel.y)
                maxV[column] = max(maxV[column], pixel.y)
            }
        }
        return mask(minV: minV, maxV: maxV)
    }

    static func quad(planeCenter: SIMD2<Double>, widthMm: Double, heightMm: Double, tilt: Double, axis: String, cardCenterX: Double) -> Silhouette {
        let hx = widthMm / 2
        let hy = heightMm / 2
        let local = [
            SIMD2(planeCenter.x - hx, planeCenter.y - hy),
            SIMD2(planeCenter.x + hx, planeCenter.y - hy),
            SIMD2(planeCenter.x + hx, planeCenter.y + hy),
            SIMD2(planeCenter.x - hx, planeCenter.y + hy),
        ]
        let pixels = local.map { point -> SIMD2<Double> in
            let camera = rotate(SIMD3(point.x, point.y, 0), degrees: tilt, axis: axis) + SIMD3(cardCenterX, 0, distance)
            return project(camera)
        }
        return fillQuad(pixels)
    }

    static func filled(x: Range<Int>, y: Range<Int>) -> Silhouette {
        var pixels = [UInt8](repeating: 0, count: width * height)
        for row in y {
            for column in x {
                pixels[row * width + column] = 255
            }
        }
        return Silhouette(width: width, height: height, pixels: pixels)
    }

    private static func mask(minV: [Double], maxV: [Double]) -> Silhouette {
        var pixels = [UInt8](repeating: 0, count: width * height)
        for column in 0..<width where minV[column].isFinite {
            let top = max(0, Int(floor(minV[column])))
            let bottom = min(height - 1, Int(ceil(maxV[column])))
            if bottom >= top {
                for row in top...bottom {
                    pixels[row * width + column] = 255
                }
            }
        }
        return Silhouette(width: width, height: height, pixels: pixels)
    }

    private static func fillQuad(_ corners: [SIMD2<Double>]) -> Silhouette {
        var pixels = [UInt8](repeating: 0, count: width * height)
        let minY = Int(floor(corners.map(\.y).min() ?? 0))
        let maxY = Int(ceil(corners.map(\.y).max() ?? 0))
        let loop = corners + [corners[0]]
        for row in max(0, minY)...min(height - 1, maxY) {
            let y = Double(row) + 0.5
            var hits: [Double] = []
            for index in 0..<4 {
                let a = loop[index]
                let b = loop[index + 1]
                if (a.y <= y && y <= b.y) || (b.y <= y && y <= a.y), abs(a.y - b.y) > 1e-9 {
                    let t = (y - a.y) / (b.y - a.y)
                    hits.append(a.x + t * (b.x - a.x))
                }
            }
            guard hits.count >= 2 else { continue }
            let left = Int(floor(hits.min()!))
            let right = Int(ceil(hits.max()!))
            for column in max(0, left)...min(width - 1, right) {
                pixels[row * width + column] = 255
            }
        }
        return Silhouette(width: width, height: height, pixels: pixels)
    }

    private static func project(_ point: SIMD3<Double>) -> SIMD2<Double> {
        SIMD2(
            intrinsics.fx * point.x / point.z + intrinsics.cx,
            intrinsics.fy * point.y / point.z + intrinsics.cy
        )
    }

    private static func rotate(_ point: SIMD3<Double>, degrees: Double, axis: String) -> SIMD3<Double> {
        let radians = degrees * .pi / 180
        let c = cos(radians)
        let s = sin(radians)
        if axis == "y" {
            return SIMD3(c * point.x + s * point.z, point.y, -s * point.x + c * point.z)
        }
        return SIMD3(point.x, c * point.y - s * point.z, s * point.y + c * point.z)
    }
}

private func hypot(_ x: Double, _ y: Double) -> Double {
    (x * x + y * y).squareRoot()
}

private struct SplitMix {
    var state: UInt64

    mutating func unit() -> Double {
        state &+= 0x9E3779B97F4A7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
        z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        z = z ^ (z >> 31)
        return Double(z >> 11) / Double(1 << 53)
    }

    mutating func gaussian() -> Double {
        let u1 = max(unit(), 1e-12)
        let u2 = unit()
        return (-2 * log(u1)).squareRoot() * cos(2 * .pi * u2)
    }
}
