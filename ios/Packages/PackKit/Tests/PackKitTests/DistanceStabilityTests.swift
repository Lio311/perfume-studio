import Foundation
import XCTest
@testable import PackKit

final class DistanceStabilityTests: XCTestCase {
    private let intrinsics = CameraIntrinsics(fx: 1500, fy: 1500, cx: 960, cy: 720)
    private let image = PixelSize(width: 1920, height: 1440)

    func testSamePoseInFourOrientationsHasTheSameDepth() {
        let corners = project(distanceMm: 200, tiltDegrees: 0)
        let expected = CardPose.estimate(imageCorners: corners, intrinsics: intrinsics)
        XCTAssertEqual(expected?.depthMm ?? .nan, 200, accuracy: 0.05)
        for orientation in [VisionImageOrientation.up, .down, .left, .right] {
            let normalized = corners.map {
                CapturedImageSpace.visionNormalized(fromPixel: $0, orientation: orientation, width: image.width, height: image.height)
            }
            let restored = normalized.map {
                CapturedImageSpace.pixel(fromVisionNormalized: $0, orientation: orientation, width: image.width, height: image.height)
            }
            for (got, want) in zip(restored, corners) {
                XCTAssertEqual(got.x, want.x, accuracy: 1e-6, "\(orientation)")
                XCTAssertEqual(got.y, want.y, accuracy: 1e-6, "\(orientation)")
            }
            let estimate = CardPose.estimate(imageCorners: restored, intrinsics: intrinsics)
            XCTAssertEqual(estimate?.depthMm ?? .nan, expected?.depthMm ?? -1, accuracy: 0.05, "\(orientation)")
        }
    }

    func testPortraitRightMappingIsNotTheSensorUpFlip() {
        let pixel = SIMD2(50.0, 20.0)
        let width = 200.0
        let height = 100.0
        let vision = CapturedImageSpace.visionNormalized(fromPixel: pixel, orientation: .right, width: width, height: height)
        let oldUpFlip = SIMD2(vision.x * width, (1 - vision.y) * height)
        XCTAssertGreaterThan(abs(oldUpFlip.x - pixel.x) + abs(oldUpFlip.y - pixel.y), 1)
        let fixed = CapturedImageSpace.pixel(fromVisionNormalized: vision, orientation: .right, width: width, height: height)
        XCTAssertEqual(fixed.x, pixel.x, accuracy: 1e-9)
        XCTAssertEqual(fixed.y, pixel.y, accuracy: 1e-9)
    }

    func testDownscaledBufferKeepsTheSameDepth() {
        let corners = project(distanceMm: 200, tiltDegrees: 10, axis: "y")
        let full = CardPose.estimate(imageCorners: corners, intrinsics: intrinsics)
        let halfCorners = corners.map { $0 * 0.5 }
        let half = intrinsics.scaled(from: image, to: PixelSize(width: image.width / 2, height: image.height / 2))
        let scaled = CardPose.estimate(imageCorners: halfCorners, intrinsics: half)
        XCTAssertEqual(scaled?.depthMm ?? .nan, full?.depthMm ?? -1, accuracy: 0.05)
        XCTAssertEqual(scaled?.depthMm ?? .nan, 200, accuracy: 0.05)
    }

    func testLongEdgeAssignmentStopsTheWidthHeightJump() {
        let corners = project(distanceMm: 200, tiltDegrees: 0)
        let rotated = [corners[1], corners[2], corners[3], corners[0]]
        let naive = PoseMath.widthOnlyDepth(imagePoints: rotated, widthMm: CardReference.id1.widthMm, fx: intrinsics.fx)
        XCTAssertEqual((naive ?? 0) / 200, CardReference.id1.widthMm / CardReference.id1.heightMm, accuracy: 0.02)
        let estimate = CardPose.estimate(imageCorners: rotated, intrinsics: intrinsics)
        XCTAssertEqual(estimate?.depthMm ?? .nan, 200, accuracy: 0.5)
    }

    func testEdgeAssignmentStaysUntilTheOtherSideIsClearlyLonger() {
        let wide = rectangle(width: 100, height: 90)
        let first = CornerOrdering.alignments(wide, reference: .id1, previous: nil)
        XCTAssertEqual(CornerOrdering.widthLength(first[0]), 100, accuracy: 1e-6)

        let slight = rectangle(width: 100, height: 103)
        let kept = CornerOrdering.alignments(slight, reference: .id1, previous: wide)
        XCTAssertEqual(CornerOrdering.widthLength(kept[0]), 100, accuracy: 1e-6)

        let clear = rectangle(width: 100, height: 130)
        let switched = CornerOrdering.alignments(clear, reference: .id1, previous: wide)
        XCTAssertEqual(CornerOrdering.widthLength(switched[0]), 130, accuracy: 1e-6)
    }

    func testPoseAgreesWithWidthOnlyAndPreviousPoseBreaksTies() {
        for tilt in [0.0, 15] {
            let corners = project(distanceMm: 200, tiltDegrees: tilt, axis: "y")
            let solved = CardPose.solve(imageCorners: corners, intrinsics: intrinsics, reference: .id1, memory: nil)
            XCTAssertEqual(solved.estimate?.depthMm ?? .nan, 200, accuracy: 0.5, "tilt \(tilt)")
            let widthOnly = solved.estimate?.widthOnlyDepthMm ?? 0
            let depth = solved.estimate?.depthMm ?? 0
            XCTAssertLessThanOrEqual(abs(depth - widthOnly) / widthOnly, DistanceTiming.depthAgreement)
        }

        let farther = PoseDisambiguation.Candidate(depthMm: 200, rmse: 0.2, inFront: true, facingCamera: true, previousDistance: 0.4, widthOnlyMm: 200)
        let wrong = PoseDisambiguation.Candidate(depthMm: 320, rmse: 0.1, inFront: true, facingCamera: true, previousDistance: 0.01, widthOnlyMm: 200)
        let behind = PoseDisambiguation.Candidate(depthMm: 180, rmse: 0.05, inFront: false, facingCamera: true, previousDistance: 0, widthOnlyMm: 180)
        let closer = PoseDisambiguation.Candidate(depthMm: 205, rmse: 0.3, inFront: true, facingCamera: true, previousDistance: 0.1, widthOnlyMm: 200)
        let index = PoseDisambiguation.choose([farther, wrong, behind, closer])
        XCTAssertEqual(index, 3)

        let onlyWrong = PoseDisambiguation.choose([wrong])
        XCTAssertNil(onlyWrong)
    }

    func testBadDetectionsAreCounted() {
        var pipeline = DistancePipeline()
        let good = frame(time: 0, distanceMm: 200)
        let accepted = pipeline.push(good)
        XCTAssertNil(accepted.rejectedReason)
        XCTAssertEqual(accepted.rejectedFrames, 0)
        XCTAssertEqual(accepted.filteredMillimetres ?? .nan, 200, accuracy: 1)

        var low = good
        low.time = 1.0 / 30
        low.confidence = 0.2
        let confidence = pipeline.push(low)
        XCTAssertEqual(confidence.rejectedReason, .confidence)
        XCTAssertEqual(confidence.rejectedFrames, 1)
        XCTAssertTrue(confidence.dimmed)

        var square = good
        square.time = 2.0 / 30
        square.confidence = 1
        square.corners = rectangle(width: 400, height: 400, origin: SIMD2(760, 520))
        let aspect = pipeline.push(square)
        XCTAssertEqual(aspect.rejectedReason, .aspect)
        XCTAssertEqual(aspect.rejectedFrames, 2)

        let jumped = frame(time: 3.0 / 30, distanceMm: 120)
        let area = pipeline.push(jumped)
        XCTAssertEqual(area.rejectedReason, .area)
        XCTAssertEqual(area.rejectedFrames, 3)
        XCTAssertEqual(area.filteredMillimetres ?? 0, 200, accuracy: 1)
        XCTAssertEqual(area.guide?.state, .yellow)
    }

    func testHoldKeepsTheCardAndDoesNotResetTheFilter() {
        var pipeline = DistancePipeline()
        var lastCard = 0.0
        for step in 0..<10 {
            let time = Double(step) / 30
            lastCard = time
            let result = pipeline.push(frame(time: time, distanceMm: 200, vio: 50))
            XCTAssertEqual(result.source?.id, CameraDistance.card.id)
            XCTAssertFalse(result.dimmed)
        }
        let during = pipeline.push(frame(time: lastCard + 0.4, distanceMm: nil, vio: 50))
        XCTAssertTrue(during.dimmed)
        XCTAssertEqual(during.source?.id, CameraDistance.card.id)
        XCTAssertEqual(during.filteredMillimetres ?? 0, 200, accuracy: 1)
        XCTAssertNotEqual(during.guide?.direction, .farther)

        let returned = pipeline.push(frame(time: lastCard + 0.5, distanceMm: 210, vio: 50))
        XCTAssertFalse(returned.dimmed)
        XCTAssertEqual(returned.source?.id, CameraDistance.card.id)
        XCTAssertEqual(returned.filteredMillimetres ?? 999, 200, accuracy: 1, "returning inside the window continues the filter")

        let lost = pipeline.push(frame(time: lastCard + 0.5 + 0.701, distanceMm: nil, vio: 50))
        XCTAssertEqual(lost.source?.id, CameraDistance.vio.id)
        XCTAssertFalse(lost.dimmed)
    }

    func testStillHandSigmaStaysUnderOneAndAHalfMillimetres() {
        for frequency in [2.0, 5, 8] {
            var filter = DistanceFilter()
            var spread = DistanceSpread()
            var worst = 0.0
            for step in 0..<90 {
                let time = Double(step) / 30
                let sample = 200 + 3 * sin(2 * Double.pi * frequency * time)
                let filtered = filter.push(zMm: sample, time: time, source: CameraDistance.card)?.millimetres ?? 0
                let sigma = spread.push(filtered, time: time)
                if time >= 1 { worst = max(worst, sigma) }
            }
            XCTAssertLessThanOrEqual(worst, DistanceTiming.stillSigmaMm, "\(frequency) Hz σ \(worst)")
        }
    }

    func testSlowMoveIsStillTracked() {
        var filter = DistanceFilter()
        var last = 0.0
        for step in 0..<60 {
            let time = Double(step) / 30
            let sample = 200 + 10 * time
            last = filter.push(zMm: sample, time: time, source: CameraDistance.card)?.millimetres ?? 0
        }
        XCTAssertEqual(last, 200 + 10 * (59.0 / 30), accuracy: 4)
    }

    func testReplayTracesStaySteady() {
        assertSteady(trace: tremor(frequency: 2), label: "2 Hz")
        assertSteady(trace: tremor(frequency: 8), label: "8 Hz")
        assertSteady(trace: tremor(frequency: 4, dropouts: [1]), label: "1-frame dropouts")
        assertSteady(trace: tremor(frequency: 3, dropouts: [5]), label: "5-frame dropouts")
        assertSteady(trace: tremor(frequency: 2, outlierEvery: 20), label: "outlier")
        assertSteady(trace: orientationChanges(), label: "orientation")
    }

    private func assertSteady(trace: [DistanceTraceRow], label: String) {
        let csv = DistanceTrace.format(trace)
        let parsed = DistanceTrace.parse(csv)
        XCTAssertEqual(parsed.count, trace.count, label)
        let results = DistanceTrace.replay(csv)
        XCTAssertEqual(results.count, trace.count, label)
        var greenSeen = false
        var previousDirection = DistanceGuide.Direction.none
        var displayChanges: [TimeInterval] = []
        var shown: Double?
        for (index, result) in results.enumerated() {
            let truth = trace[index].rawZ ?? 200
            if result.guide?.state == .green { greenSeen = true }
            if greenSeen {
                XCTAssertEqual(result.guide?.state, .green, "\(label) frame \(index)")
                XCTAssertNotEqual(result.guide?.state, .yellow, "\(label) flicker")
            }
            let direction = result.guide?.direction ?? .none
            let inside = abs(truth - 200) <= 0.5 * 5
            if inside && previousDirection != .none && direction != .none && direction != previousDirection {
                XCTFail("\(label) flipped direction while the truth was inside ±0.5·h")
            }
            if direction != .none { previousDirection = direction }
            if let centimetres = result.guide?.distanceCm, centimetres != shown {
                displayChanges.append(trace[index].time)
                shown = centimetres
            }
            if trace[index].time >= 1 {
                XCTAssertLessThanOrEqual(result.sigmaMillimetres, DistanceTiming.stillSigmaMm, "\(label) σ")
            }
            if trace[index].rejectedReason == "dropout" || trace[index].corners.isEmpty {
                XCTAssertTrue(result.dimmed, "\(label) dropout")
            }
        }
        XCTAssertTrue(greenSeen, label)
        for time in displayChanges {
            let count = displayChanges.filter { $0 >= time && $0 < time + 1 }.count
            XCTAssertLessThanOrEqual(count, 5, "\(label) display rate")
        }
    }

    private func tremor(frequency: Double, dropouts: [Int] = [], outlierEvery: Int? = nil) -> [DistanceTraceRow] {
        var rows: [DistanceTraceRow] = []
        let frames = 90
        var skip = 0
        for step in 0..<frames {
            let time = Double(step) / 30
            if skip > 0 {
                skip -= 1
                rows.append(row(time: time, corners: nil, truth: 200, reason: "dropout"))
                continue
            }
            if dropouts.contains(1), step > 20, step.isMultiple(of: 15) {
                rows.append(row(time: time, corners: nil, truth: 200, reason: "dropout"))
                continue
            }
            if dropouts.contains(5), step == 40 {
                skip = 4
                rows.append(row(time: time, corners: nil, truth: 200, reason: "dropout"))
                continue
            }
            let truth = 200 + 3 * sin(2 * Double.pi * frequency * time)
            if let outlierEvery, step > 0, step.isMultiple(of: outlierEvery) {
                rows.append(row(time: time, corners: rectangle(width: 420, height: 420, origin: SIMD2(750, 510)), truth: truth, reason: "outlier"))
                continue
            }
            rows.append(row(time: time, corners: project(distanceMm: truth, tiltDegrees: 0), truth: truth, reason: ""))
        }
        return rows
    }

    private func orientationChanges() -> [DistanceTraceRow] {
        let orientations: [VisionImageOrientation] = [.up, .right, .down, .left]
        var rows: [DistanceTraceRow] = []
        for step in 0..<80 {
            let time = Double(step) / 30
            let orientation = orientations[(step / 20) % orientations.count]
            let truth = 200 + 1.5 * sin(2 * Double.pi * 3 * time)
            let pixels = project(distanceMm: truth, tiltDegrees: 0)
            let normalized = pixels.map {
                CapturedImageSpace.visionNormalized(fromPixel: $0, orientation: orientation, width: image.width, height: image.height)
            }
            let restored = normalized.map {
                CapturedImageSpace.pixel(fromVisionNormalized: $0, orientation: orientation, width: image.width, height: image.height)
            }
            rows.append(row(time: time, corners: restored, truth: truth, reason: ""))
        }
        return rows
    }

    private func row(time: TimeInterval, corners: [SIMD2<Double>]?, truth: Double, reason: String) -> DistanceTraceRow {
        DistanceTraceRow(
            time: time,
            corners: corners ?? [],
            imageWidth: image.width,
            imageHeight: image.height,
            fx: intrinsics.fx,
            fy: intrinsics.fy,
            cx: intrinsics.cx,
            cy: intrinsics.cy,
            rawZ: truth,
            widthOnlyZ: nil,
            filteredZ: nil,
            state: "",
            source: "",
            rejectedReason: reason
        )
    }

    private func frame(time: TimeInterval, distanceMm: Double?, vio: Double? = nil) -> DistanceFrame {
        DistanceFrame(
            time: time,
            corners: distanceMm.map { project(distanceMm: $0, tiltDegrees: 0) },
            confidence: 1,
            intrinsics: intrinsics,
            imageSize: image,
            vioMillimetres: vio
        )
    }

    private func project(distanceMm: Double, tiltDegrees: Double, axis: String = "x") -> [SIMD2<Double>] {
        let reference = CardReference.id1
        let w = reference.widthMm / 2
        let h = reference.heightMm / 2
        let model = [
            SIMD3(-w, -h, 0.0),
            SIMD3(w, -h, 0.0),
            SIMD3(w, h, 0.0),
            SIMD3(-w, h, 0.0),
        ]
        return model.map { point in
            let rotated = axis == "y" ? rotateY(point, degrees: tiltDegrees) : rotateX(point, degrees: tiltDegrees)
            let camera = rotated + SIMD3(0, 0, distanceMm)
            return SIMD2(
                intrinsics.fx * camera.x / camera.z + intrinsics.cx,
                intrinsics.fy * camera.y / camera.z + intrinsics.cy
            )
        }
    }

    private func rectangle(width: Double, height: Double, origin: SIMD2<Double> = .zero) -> [SIMD2<Double>] {
        [
            origin,
            origin + SIMD2(width, 0),
            origin + SIMD2(width, height),
            origin + SIMD2(0, height),
        ]
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
