import Foundation
import XCTest
@testable import PackKit

final class CardPoseTests: XCTestCase {
    private let intrinsics = CameraIntrinsics(fx: 1500, fy: 1520, cx: 960, cy: 720)

    func testZeroNoiseRecoversDepthAndTilt() {
        let distances = [150.0, 200, 250, 300]
        let tilts = [0.0, 15, -15]
        for distance in distances {
            for tilt in tilts {
                for axis in ["x", "y"] {
                    let corners = project(distanceMm: distance, tiltDegrees: tilt, axis: axis, noise: 0, seed: 1)
                    let estimate = CardPose.estimate(imageCorners: corners, intrinsics: intrinsics, reference: .id1)
                    let got = estimate?.depthMm ?? .nan
                    XCTAssertEqual(got, distance, accuracy: 0.05, "Z \(distance) tilt \(tilt) \(axis) got \(got)")
                    XCTAssertEqual(estimate?.tiltDegrees ?? .nan, abs(tilt), accuracy: 0.05, "tilt \(tilt) \(axis)")
                    if tilt == 0 {
                        XCTAssertEqual(estimate?.widthOnlyDepthMm ?? .nan, distance, accuracy: 0.05)
                    }
                }
            }
        }
    }

    func testCustomCardSize() {
        let reference = CardReference(widthMm: 100, heightMm: 60)
        let corners = project(distanceMm: 200, tiltDegrees: 0, axis: "x", noise: 0, seed: 1, reference: reference)
        let estimate = CardPose.estimate(imageCorners: corners, intrinsics: intrinsics, reference: reference)
        XCTAssertEqual(estimate?.depthMm ?? .nan, 200, accuracy: 0.05)
    }

    func testDepthErrorAt200mmWithPixelNoise() {
        assertNoise(sigma: 0.5, distance: 200, meanLimit: 0.6, trials: 24)
        assertNoise(sigma: 1, distance: 200, meanLimit: 1, trials: 40)
        assertNoise(sigma: 3, distance: 200, meanLimit: 4, trials: 24)
    }

    func testDegenerateCornersReturnNil() {
        let corners = Array(repeating: SIMD2<Double>(repeating: 10), count: 4)
        XCTAssertNil(CardPose.estimate(imageCorners: corners, intrinsics: intrinsics))
        XCTAssertNil(CardPose.estimate(imageCorners: [SIMD2(0, 0)], intrinsics: intrinsics))
    }

    func testIntrinsicsScale() {
        let scaled = intrinsics.scaled(from: PixelSize(width: 1000, height: 500), to: PixelSize(width: 2000, height: 1500))
        XCTAssertEqual(scaled.fx, intrinsics.fx * 2, accuracy: 1e-9)
        XCTAssertEqual(scaled.fy, intrinsics.fy * 3, accuracy: 1e-9)
        XCTAssertEqual(scaled.cx, intrinsics.cx * 2, accuracy: 1e-9)
        XCTAssertEqual(scaled.cy, intrinsics.cy * 3, accuracy: 1e-9)
    }

    private func assertNoise(sigma: Double, distance: Double, meanLimit: Double, trials: Int) {
        var total = 0.0
        for trial in 0..<trials {
            let corners = project(distanceMm: distance, tiltDegrees: trial.isMultiple(of: 2) ? 15 : -15, axis: trial.isMultiple(of: 3) ? "y" : "x", noise: sigma, seed: UInt64(trial + 11))
            let estimate = CardPose.estimate(imageCorners: corners, intrinsics: intrinsics)
            let error = abs((estimate?.depthMm ?? 1e9) - distance)
            total += error
        }
        let mean = total / Double(trials)
        XCTAssertLessThanOrEqual(mean, meanLimit, "σ=\(sigma) mean |ΔZ|=\(mean) mm")
    }

    private func project(
        distanceMm: Double,
        tiltDegrees: Double,
        axis: String,
        noise: Double,
        seed: UInt64,
        reference: CardReference = .id1
    ) -> [SIMD2<Double>] {
        let w = reference.widthMm / 2
        let h = reference.heightMm / 2
        let model = [
            SIMD3(-w, -h, 0.0),
            SIMD3(w, -h, 0.0),
            SIMD3(w, h, 0.0),
            SIMD3(-w, h, 0.0),
        ]
        var rng = SplitMix(state: seed)
        return model.map { point in
            let rotated = axis == "y" ? rotateY(point, degrees: tiltDegrees) : rotateX(point, degrees: tiltDegrees)
            let camera = rotated + SIMD3(0, 0, distanceMm)
            var pixel = SIMD2(
                intrinsics.fx * camera.x / camera.z + intrinsics.cx,
                intrinsics.fy * camera.y / camera.z + intrinsics.cy
            )
            if noise > 0 {
                pixel += SIMD2(rng.gaussian() * noise, rng.gaussian() * noise)
            }
            return pixel
        }
    }

    private func rotateX(_ p: SIMD3<Double>, degrees: Double) -> SIMD3<Double> {
        let r = degrees * .pi / 180
        let c = cos(r), s = sin(r)
        return SIMD3(p.x, c * p.y - s * p.z, s * p.y + c * p.z)
    }

    private func rotateY(_ p: SIMD3<Double>, degrees: Double) -> SIMD3<Double> {
        let r = degrees * .pi / 180
        let c = cos(r), s = sin(r)
        return SIMD3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z)
    }
}

final class DistanceFilterTests: XCTestCase {
    func testMedianThenEMA() {
        var filter = DistanceFilter()
        let samples = [10.0, 30, 20, 100, 40, 20]
        let expected = [10.0, 12.5, 14.375, 17.03125, 20.2734375, 22.705078125]
        for (index, sample) in samples.enumerated() {
            let result = filter.push(zMm: sample, time: Double(index) * 0.05, source: CameraDistance.card)
            XCTAssertEqual(result?.millimetres ?? .nan, expected[index], accuracy: 1e-9, "sample \(index)")
            XCTAssertFalse(result?.didReset ?? true)
        }
    }

    func testGapAt300msDoesNotResetButLongerDoes() {
        var held = DistanceFilter()
        _ = held.push(zMm: 10, time: 0, source: CameraDistance.card)
        let kept = held.push(zMm: 50, time: 0.3, source: CameraDistance.card)
        XCTAssertEqual(kept?.didReset, false)
        XCTAssertEqual(kept?.millimetres ?? .nan, 15, accuracy: 1e-9)

        var reset = DistanceFilter()
        _ = reset.push(zMm: 10, time: 0, source: CameraDistance.card)
        let fresh = reset.push(zMm: 50, time: 0.301, source: CameraDistance.card)
        XCTAssertEqual(fresh?.didReset, true)
        XCTAssertEqual(fresh?.millimetres ?? .nan, 50, accuracy: 1e-9)
    }

    func testSourceChangeResets() {
        var filter = DistanceFilter()
        _ = filter.push(zMm: 10, time: 0, source: CameraDistance.card)
        let next = filter.push(zMm: 80, time: 0.05, source: CameraDistance.vio)
        XCTAssertEqual(next?.didReset, true)
        XCTAssertEqual(next?.millimetres ?? .nan, 80, accuracy: 1e-9)
    }

    func testLiDARBelow300IsIgnored() {
        var filter = DistanceFilter()
        XCTAssertNil(filter.push(zMm: 299, time: 0, source: CameraDistance.lidar))
        XCTAssertNil(filter.value)
        let accepted = filter.push(zMm: 300, time: 0, source: CameraDistance.lidar)
        XCTAssertEqual(accepted?.millimetres ?? .nan, 300, accuracy: 1e-9)
        XCTAssertNil(filter.push(zMm: 100, time: 0.05, source: CameraDistance.lidar))
        XCTAssertEqual(filter.value ?? .nan, 300, accuracy: 1e-9)
        let card = filter.push(zMm: 180, time: 0.1, source: CameraDistance.card)
        XCTAssertEqual(card?.didReset, true)
        XCTAssertEqual(card?.millimetres ?? .nan, 180, accuracy: 1e-9)
    }
}

final class DistanceGuideTests: XCTestCase {
    func testGreenNeedsThreeFramesAndEnteredGreenIsAnEdge() {
        var guide = DistanceGuide()
        let first = guide.update(zMm: 200)
        let second = guide.update(zMm: 200)
        let third = guide.update(zMm: 200)
        XCTAssertEqual(first.state, .yellow)
        XCTAssertEqual(second.state, .yellow)
        XCTAssertFalse(first.enteredGreen)
        XCTAssertFalse(second.enteredGreen)
        XCTAssertEqual(third.state, .green)
        XCTAssertTrue(third.enteredGreen)
        XCTAssertFalse(guide.update(zMm: 200).enteredGreen)
        XCTAssertEqual(third.distanceCm, 20)
        XCTAssertEqual(third.direction, .none)
    }

    func testDirectionAndOneDecimalCentimetre() {
        var guide = DistanceGuide()
        let far = guide.update(zMm: 217)
        XCTAssertEqual(far.direction, .closer)
        XCTAssertEqual(far.direction.hebrew, "קרב")
        XCTAssertEqual(far.distanceCm, 21.7, accuracy: 1e-9)
        let near = guide.update(zMm: 183)
        XCTAssertEqual(near.direction, .farther)
        XCTAssertEqual(near.direction.hebrew, "הרחק")
        XCTAssertEqual(near.distanceCm, 18.3, accuracy: 1e-9)
    }

    func testLeavingGreenAndYellowHysteresis() {
        var guide = DistanceGuide()
        _ = guide.update(zMm: 200)
        _ = guide.update(zMm: 200)
        XCTAssertEqual(guide.update(zMm: 200).state, .green)
        XCTAssertEqual(guide.update(zMm: 206).state, .green)
        XCTAssertEqual(guide.update(zMm: 210).state, .yellow)
        XCTAssertEqual(guide.update(zMm: 222).state, .yellow)
        XCTAssertEqual(guide.update(zMm: 223).state, .red)
        XCTAssertEqual(guide.update(zMm: 220).state, .red)
        XCTAssertEqual(guide.update(zMm: 218).state, .yellow)
    }

    func testWideHalfBandDoesNotJumpFromGreenToRed() {
        XCTAssertEqual(DistanceGuide.yellowEnterMillimetres(halfBandMm: 5), 18, accuracy: 1e-9)
        XCTAssertEqual(DistanceGuide.yellowLeaveMillimetres(halfBandMm: 5), 22, accuracy: 1e-9)
        XCTAssertEqual(DistanceGuide.yellowEnterMillimetres(halfBandMm: 20), 72, accuracy: 1e-9)
        XCTAssertEqual(DistanceGuide.yellowLeaveMillimetres(halfBandMm: 20), 88, accuracy: 1e-9)

        var guide = DistanceGuide(targetMm: 200, halfBandMm: 20)
        _ = guide.update(zMm: 200)
        _ = guide.update(zMm: 200)
        XCTAssertEqual(guide.update(zMm: 200).state, .green)
        XCTAssertEqual(guide.update(zMm: 225).state, .yellow)
        XCTAssertEqual(guide.update(zMm: 287).state, .yellow)
        XCTAssertEqual(guide.update(zMm: 289).state, .red)

        var reenter = DistanceGuide(targetMm: 200, halfBandMm: 20)
        XCTAssertEqual(reenter.update(zMm: 300).state, .red)
        XCTAssertEqual(reenter.update(zMm: 272).state, .yellow)
    }

    func testNoGreenYellowFlickerAround204to206() {
        var stayingGreen = DistanceGuide()
        _ = stayingGreen.update(zMm: 200)
        _ = stayingGreen.update(zMm: 200)
        _ = stayingGreen.update(zMm: 200)
        let noisy = stride(from: 0, to: 30, by: 1).map { index -> DistanceGuide.State in
            let z = index.isMultiple(of: 2) ? 204.0 : 206.0
            return stayingGreen.update(zMm: z).state
        }
        XCTAssertTrue(noisy.allSatisfy { $0 == .green })

        var stayingYellow = DistanceGuide()
        XCTAssertEqual(stayingYellow.update(zMm: 210).state, .yellow)
        let held = stride(from: 0, to: 30, by: 1).map { index -> DistanceGuide.State in
            let z = index.isMultiple(of: 2) ? 204.0 : 206.0
            return stayingYellow.update(zMm: z).state
        }
        XCTAssertTrue(held.allSatisfy { $0 == .yellow })
    }
}

final class AutoCaptureTests: XCTestCase {
    func testFiresOnceAfterHalfASecondOfCardGreen() {
        var gate = AutoCaptureGate()
        XCTAssertFalse(gate.update(isGreen: true, source: CameraDistance.card, tiltDegrees: 0, zMm: 200, time: 0))
        XCTAssertFalse(gate.update(isGreen: true, source: CameraDistance.card, tiltDegrees: 0, zMm: 200, time: 0.49))
        XCTAssertTrue(gate.update(isGreen: true, source: CameraDistance.card, tiltDegrees: 10, zMm: 200, time: 0.5))
        XCTAssertFalse(gate.update(isGreen: true, source: CameraDistance.card, tiltDegrees: 0, zMm: 200, time: 0.8))
        XCTAssertFalse(gate.update(isGreen: false, source: CameraDistance.card, tiltDegrees: 0, zMm: 200, time: 0.9))
        XCTAssertFalse(gate.update(isGreen: true, source: CameraDistance.card, tiltDegrees: 0, zMm: 200, time: 1.0))
        XCTAssertTrue(gate.update(isGreen: true, source: CameraDistance.card, tiltDegrees: 0, zMm: 200, time: 1.5))
    }

    func testTiltAboveTenDegreesDoesNotFire() {
        var gate = AutoCaptureGate()
        XCTAssertFalse(gate.update(isGreen: true, source: CameraDistance.card, tiltDegrees: 10.1, zMm: 200, time: 0))
        XCTAssertFalse(gate.update(isGreen: true, source: CameraDistance.card, tiltDegrees: 10.1, zMm: 200, time: 1))
    }

    func testVIONeverAutoCaptures() {
        var gate = AutoCaptureGate()
        for time in stride(from: 0.0, through: 2, by: 0.1) {
            XCTAssertFalse(gate.update(isGreen: true, source: CameraDistance.vio, tiltDegrees: 0, zMm: 200, time: time))
        }
    }

    func testDisabledGateDoesNotAccumulateHold() {
        var gate = AutoCaptureGate()
        for time in stride(from: 0.0, through: 2, by: 0.1) {
            XCTAssertFalse(gate.update(
                isGreen: true,
                source: CameraDistance.card,
                tiltDegrees: 0,
                zMm: 200,
                time: time,
                enabled: false
            ))
        }
        XCTAssertFalse(gate.update(isGreen: true, source: CameraDistance.card, tiltDegrees: 0, zMm: 200, time: 3, enabled: true))
        XCTAssertTrue(gate.update(isGreen: true, source: CameraDistance.card, tiltDegrees: 0, zMm: 200, time: 3.5, enabled: true))
    }

    func testLiDARDoesNotAutoCapture() {
        var below = AutoCaptureGate()
        var above = AutoCaptureGate()
        for time in stride(from: 0.0, through: 2, by: 0.1) {
            XCTAssertFalse(below.update(isGreen: true, source: CameraDistance.lidar, tiltDegrees: 0, zMm: 250, time: time))
            XCTAssertFalse(above.update(isGreen: true, source: CameraDistance.lidar, tiltDegrees: 0, zMm: 400, time: time))
        }
    }
}

final class DistanceSessionTests: XCTestCase {
    func testCalibrationIsAppliedBeforeTheFilter() {
        var session = DistanceSession(calibration: DistanceCalibration(biasMm: -2, scale: 1.01, sigmaMm: 0.4))
        let reading = session.update(rawZMm: 200, source: CameraDistance.card, tiltDegrees: 0, time: 0)
        XCTAssertTrue(reading.accepted)
        XCTAssertEqual(reading.filteredMm ?? .nan, 200 * 1.01 - 2, accuracy: 1e-9)
        XCTAssertFalse(reading.showsApproximateBadge)
    }

    func testIdentityCalibrationLeavesZUnchanged() {
        XCTAssertEqual(DistanceCalibration.identity.apply(to: 200), 200, accuracy: 1e-12)
        var session = DistanceSession()
        let reading = session.update(rawZMm: 200, source: CameraDistance.card, tiltDegrees: 0, time: 0)
        XCTAssertEqual(reading.filteredMm ?? .nan, 200, accuracy: 1e-9)
    }

    func testLiDARBelow300IsNotAccepted() {
        var session = DistanceSession()
        let ignored = session.update(rawZMm: 250, source: CameraDistance.lidar, tiltDegrees: 0, time: 0)
        XCTAssertFalse(ignored.accepted)
        XCTAssertNil(session.filter.value)
        let kept = session.update(rawZMm: 320, source: CameraDistance.lidar, tiltDegrees: 0, time: 0.05)
        XCTAssertTrue(kept.accepted)
        XCTAssertEqual(kept.filteredMm ?? .nan, 320, accuracy: 1e-9)
        XCTAssertFalse(kept.shouldAutoCapture)
    }

    func testVIOShowsTheApproximateBadgeAndDoesNotAutoCapture() {
        var session = DistanceSession(autoCaptureEnabled: true)
        var fired = false
        var last: DistanceReading?
        for step in 0..<40 {
            let reading = session.update(rawZMm: 200, source: CameraDistance.vio, tiltDegrees: 0, time: Double(step) * 0.05)
            XCTAssertTrue(reading.showsApproximateBadge)
            fired = fired || reading.shouldAutoCapture
            last = reading
        }
        XCTAssertFalse(fired)
        XCTAssertEqual(last?.guide?.state, .green)
    }

    func testAutoCaptureFiresForASteadyCardWhenEnabled() {
        var session = DistanceSession(autoCaptureEnabled: true)
        var firedAt: TimeInterval?
        for step in 0..<30 {
            let time = Double(step) * 0.05
            let reading = session.update(rawZMm: 200, source: CameraDistance.card, tiltDegrees: 4, time: time)
            if reading.shouldAutoCapture { firedAt = time }
        }
        XCTAssertEqual(firedAt ?? -1, 0.6, accuracy: 1e-9)
        let again = session.update(rawZMm: 200, source: CameraDistance.card, tiltDegrees: 4, time: 2)
        XCTAssertFalse(again.shouldAutoCapture)
    }

    func testDisabledAutoCaptureDoesNotFireFromOldHold() {
        var session = DistanceSession(autoCaptureEnabled: false)
        for step in 0..<40 {
            let reading = session.update(rawZMm: 200, source: CameraDistance.card, tiltDegrees: 0, time: Double(step) * 0.05)
            XCTAssertFalse(reading.shouldAutoCapture)
        }
        session.autoCaptureEnabled = true
        var firedAt: TimeInterval?
        for step in 0..<12 {
            let time = 2.0 + Double(step) * 0.05
            let reading = session.update(rawZMm: 200, source: CameraDistance.card, tiltDegrees: 0, time: time)
            if reading.shouldAutoCapture { firedAt = time }
        }
        XCTAssertEqual(firedAt ?? -1, 2.5, accuracy: 1e-9)
    }

    func testSigmaOverOneSecond() {
        var spread = DistanceSpread()
        XCTAssertEqual(spread.push(10, time: 0), 0)
        let sigma = spread.push(12, time: 0.5)
        XCTAssertEqual(sigma, 1, accuracy: 1e-9)
        let dropped = spread.push(12, time: 1.5)
        XCTAssertEqual(dropped, 0, accuracy: 1e-9)
    }
}

final class DistanceChooserTests: XCTestCase {
    func testCardBeatsLiDARAndVIO() {
        let choice = DistanceChooser.choose(cardDepthMm: 200, cardTiltDegrees: 4, lidarMm: 400, vioMm: 210)
        XCTAssertEqual(choice?.source, .card)
        XCTAssertEqual(choice?.rawZMm ?? 0, 200, accuracy: 1e-9)
        XCTAssertEqual(choice?.tiltDegrees ?? 0, 4, accuracy: 1e-9)
    }

    func testLiDARBelow300FallsThroughToVIO() {
        let choice = DistanceChooser.choose(cardDepthMm: nil, cardTiltDegrees: nil, lidarMm: 250, vioMm: 180)
        XCTAssertEqual(choice?.source, .vio)
        XCTAssertEqual(choice?.rawZMm ?? 0, 180, accuracy: 1e-9)
    }

    func testLiDARUsedWhenTheCardIsMissingAndFarEnough() {
        let choice = DistanceChooser.choose(cardDepthMm: nil, cardTiltDegrees: nil, lidarMm: 320, vioMm: 180)
        XCTAssertEqual(choice?.source, .lidar)
        XCTAssertEqual(choice?.rawZMm ?? 0, 320, accuracy: 1e-9)
    }

    func testNothingInViewReturnsNil() {
        XCTAssertNil(DistanceChooser.choose(cardDepthMm: nil, cardTiltDegrees: nil, lidarMm: 100, vioMm: nil))
    }
}

final class DistanceSourceChooserTests: XCTestCase {
    func testSingleDroppedFrameKeepsTheCardAndTheFilter() {
        var chooser = DistanceSourceChooser()
        var filter = DistanceFilter()
        let first = chooser.update(cardDepthMm: 200, cardTiltDegrees: 3, lidarMm: 400, vioMm: 180, time: 0)
        XCTAssertEqual(first?.source, .card)
        let started = filter.push(zMm: first?.rawZMm ?? 0, time: 0, source: CameraDistance.card)
        XCTAssertEqual(started?.didReset, false)

        let dropped = chooser.update(cardDepthMm: nil, cardTiltDegrees: nil, lidarMm: 400, vioMm: 180, time: 1.0 / 60.0)
        XCTAssertEqual(dropped?.source, .card)
        XCTAssertEqual(dropped?.rawZMm ?? 0, 200, accuracy: 1e-9)
        let held = filter.push(zMm: dropped?.rawZMm ?? 0, time: 1.0 / 60.0, source: dropped?.source ?? CameraDistance.vio)
        XCTAssertEqual(held?.didReset, false)

        let back = chooser.update(cardDepthMm: 201, cardTiltDegrees: 3, lidarMm: 400, vioMm: 180, time: 2.0 / 60.0)
        XCTAssertEqual(back?.source, .card)
        XCTAssertEqual(back?.rawZMm ?? 0, 201, accuracy: 1e-9)
    }

    func testFiveDroppedFramesAt30fpsStayOnTheCard() {
        var chooser = DistanceSourceChooser()
        let first = chooser.update(cardDepthMm: 210, cardTiltDegrees: 1, lidarMm: nil, vioMm: 190, time: 0)
        XCTAssertEqual(first?.source, .card)
        for drop in 1...5 {
            let choice = chooser.update(
                cardDepthMm: nil,
                cardTiltDegrees: nil,
                lidarMm: 350,
                vioMm: 190,
                time: Double(drop) / 30.0
            )
            XCTAssertEqual(choice?.source, .card, "drop \(drop)")
            XCTAssertEqual(choice?.rawZMm ?? 0, 210, accuracy: 1e-9)
        }
    }

    func testARealLossPastTheGraceUsesTheFallback() {
        var chooser = DistanceSourceChooser()
        _ = chooser.update(cardDepthMm: 200, cardTiltDegrees: 0, lidarMm: 320, vioMm: 180, time: 0)
        let edge = chooser.update(cardDepthMm: nil, cardTiltDegrees: nil, lidarMm: 320, vioMm: 180, time: 0.300)
        XCTAssertEqual(edge?.source, .card)
        let lost = chooser.update(cardDepthMm: nil, cardTiltDegrees: nil, lidarMm: 320, vioMm: 180, time: 0.301)
        XCTAssertEqual(lost?.source, .lidar)
        let stillGone = chooser.update(cardDepthMm: nil, cardTiltDegrees: nil, lidarMm: nil, vioMm: 180, time: 0.40)
        XCTAssertEqual(stillGone?.source, .vio)
        let nothing = chooser.update(cardDepthMm: nil, cardTiltDegrees: nil, lidarMm: nil, vioMm: nil, time: 0.50)
        XCTAssertNil(nothing)
        let found = chooser.update(cardDepthMm: 190, cardTiltDegrees: 2, lidarMm: nil, vioMm: 180, time: 0.55)
        XCTAssertEqual(found?.source, .card)
        XCTAssertEqual(found?.rawZMm ?? 0, 190, accuracy: 1e-9)
    }
}

final class DistanceSampleHoldTests: XCTestCase {
    func testClearsAfter500msWithoutASample() {
        var hold = DistanceSampleHold()
        XCTAssertFalse(hold.update(hasSample: false, time: 0))
        XCTAssertTrue(hold.update(hasSample: true, time: 1))
        XCTAssertTrue(hold.update(hasSample: false, time: 1.499))
        XCTAssertFalse(hold.update(hasSample: false, time: 1.5))
        XCTAssertFalse(hold.update(hasSample: false, time: 2))
        XCTAssertTrue(hold.update(hasSample: true, time: 2.1))
        XCTAssertTrue(hold.update(hasSample: false, time: 2.4))
    }
}

final class WideVideoFormatTests: XCTestCase {
    func testPrefers1920x1440Over4K() {
        let picked = WideVideoFormatPicker.pick([
            CameraVideoFormat(width: 3840, height: 2160, framesPerSecond: 30, isWide: true),
            CameraVideoFormat(width: 1920, height: 1440, framesPerSecond: 30, isWide: true),
            CameraVideoFormat(width: 1920, height: 1080, framesPerSecond: 60, isWide: true),
            CameraVideoFormat(width: 1280, height: 960, framesPerSecond: 60, isWide: true),
        ])
        XCTAssertEqual(picked, CameraVideoFormat(width: 1920, height: 1440, framesPerSecond: 30, isWide: true))
    }

    func testNearestFourByThreeAtMost1920Wide() {
        let picked = WideVideoFormatPicker.pick([
            CameraVideoFormat(width: 1280, height: 960, framesPerSecond: 30, isWide: true),
            CameraVideoFormat(width: 1440, height: 1080, framesPerSecond: 30, isWide: true),
            CameraVideoFormat(width: 3840, height: 2880, framesPerSecond: 30, isWide: true),
        ])
        XCTAssertEqual(picked?.width, 1440)
        XCTAssertEqual(picked?.height, 1080)
    }

    func testSkipsUltraWideAndFormatsUnder30fps() {
        let picked = WideVideoFormatPicker.pick([
            CameraVideoFormat(width: 1920, height: 1440, framesPerSecond: 30, isWide: false),
            CameraVideoFormat(width: 1920, height: 1440, framesPerSecond: 15, isWide: true),
            CameraVideoFormat(width: 1280, height: 960, framesPerSecond: 60, isWide: true),
        ])
        XCTAssertEqual(picked, CameraVideoFormat(width: 1280, height: 960, framesPerSecond: 60, isWide: true))
    }
}

final class VisionFrameSchedulerTests: XCTestCase {
    func testDropsFramesWhileDetectionIsInFlight() {
        var scheduler = VisionFrameScheduler()
        XCTAssertTrue(scheduler.shouldDetect())
        XCTAssertFalse(scheduler.shouldDetect())
        XCTAssertFalse(scheduler.shouldDetect())
        scheduler.detectionFinished(elapsed: 0.01)
        XCTAssertTrue(scheduler.shouldDetect())
    }

    func testSlowDetectionRunsOnAtMostEverySecondFrame() {
        var scheduler = VisionFrameScheduler()
        XCTAssertTrue(scheduler.shouldDetect())
        scheduler.detectionFinished(elapsed: 0.06)
        XCTAssertFalse(scheduler.shouldDetect())
        XCTAssertTrue(scheduler.shouldDetect())
        scheduler.detectionFinished(elapsed: 0.01)
        XCTAssertTrue(scheduler.shouldDetect())
    }
}

final class DistanceSourceProtocolTests: XCTestCase {
    func testANewSourceIdResetsTheFilter() {
        var filter = DistanceFilter()
        _ = filter.push(zMm: 10, time: 0, source: CameraDistance.card)
        let next = filter.push(zMm: 40, time: 0.05, source: FutureDepth(id: "objectCapture"))
        XCTAssertEqual(next?.didReset, true)
        XCTAssertEqual(next?.millimetres ?? .nan, 40, accuracy: 1e-9)
    }

    func testAutoCaptureFollowsTheSourceFlag() {
        var optedOut = AutoCaptureGate()
        var optedIn = AutoCaptureGate()
        let out = FutureDepth(id: "objectCapture")
        let into = FutureDepth(id: "objectCapture", allowsAutoCapture: true)
        for time in stride(from: 0.0, through: 2, by: 0.1) {
            XCTAssertFalse(optedOut.update(isGreen: true, source: out, tiltDegrees: 0, zMm: 200, time: time))
        }
        XCTAssertFalse(optedIn.update(isGreen: true, source: into, tiltDegrees: 0, zMm: 200, time: 0))
        XCTAssertTrue(optedIn.update(isGreen: true, source: into, tiltDegrees: 0, zMm: 200, time: 0.5))
    }
}

/// Stand-in for a later depth source. Not an Object Capture implementation.
private struct FutureDepth: DistanceSource {
    var id: String
    var allowsAutoCapture = false
}

final class CornerRefinerTests: XCTestCase {
    func testLineIntersectionRebuildsTheRectangle() {
        let edges: [[SIMD2<Double>]] = [
            [SIMD2(0, 0), SIMD2(40, 0.1), SIMD2(80, -0.1), SIMD2(100, 0)],
            [SIMD2(100, 0), SIMD2(100.1, 20), SIMD2(99.9, 40), SIMD2(100, 50)],
            [SIMD2(100, 50), SIMD2(60, 50.1), SIMD2(20, 49.9), SIMD2(0, 50)],
            [SIMD2(0, 50), SIMD2(-0.1, 30), SIMD2(0.1, 10), SIMD2(0, 0)],
        ]
        let corners = CornerRefiner.corners(edges: edges)
        XCTAssertEqual(corners?.count, 4)
        let expected = [SIMD2(0.0, 0.0), SIMD2(100.0, 0.0), SIMD2(100.0, 50.0), SIMD2(0.0, 50.0)]
        for (got, want) in zip(corners ?? [], expected) {
            XCTAssertEqual(got.x, want.x, accuracy: 0.5)
            XCTAssertEqual(got.y, want.y, accuracy: 0.5)
        }
    }

    func testDetectorTuningMatchesTheCardSpec() {
        let tuning = CardDetectorTuning.id1
        XCTAssertEqual(tuning.longOverShort, 1.586, accuracy: 1e-12)
        XCTAssertEqual(tuning.aspectTolerance, 0.1, accuracy: 1e-12)
        XCTAssertEqual(tuning.minimumSize, 0.15, accuracy: 1e-12)
        XCTAssertEqual(tuning.maximumObservations, 1)
        XCTAssertEqual(tuning.quadratureToleranceDegrees, 15, accuracy: 1e-12)
        let ratio = 1 / tuning.longOverShort
        XCTAssertGreaterThanOrEqual(tuning.visionMinimumAspectRatio, 0)
        XCTAssertLessThanOrEqual(tuning.visionMaximumAspectRatio, 1)
        XCTAssertLessThan(tuning.visionMinimumAspectRatio, ratio)
        XCTAssertGreaterThan(tuning.visionMaximumAspectRatio, ratio)
    }
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
