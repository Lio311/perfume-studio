import Foundation
import XCTest
@testable import PackKit

final class CapturePlanTests: XCTestCase {
    func testPlansMatchTheDesignTable() {
        XCTAssertEqual(required(of: .bottle), [.side])
        XCTAssertEqual(optional(of: .bottle), [.top, .bottom])
        XCTAssertEqual(required(of: .cap), [.side, .top])
        XCTAssertEqual(optional(of: .cap), [.bottom])
        XCTAssertEqual(required(of: .pump), [.side])
        XCTAssertEqual(optional(of: .pump), [])
        XCTAssertEqual(required(of: .collar), [.side, .top])
        XCTAssertEqual(optional(of: .collar), [])
        XCTAssertEqual(required(of: .box), [.front, .side])
        XCTAssertEqual(optional(of: .box), [.top])
        XCTAssertEqual(required(of: .label), [.front])
        XCTAssertEqual(optional(of: .label), [])

        for kind in PartKind.allCases {
            for step in CapturePlan.forKind(kind).steps where step.angle == .bottom {
                XCTAssertFalse(step.required, "\(kind) bottom must stay optional")
            }
        }
        let bottleTop = CapturePlan.forKind(.bottle).steps.first { $0.angle == .top }
        XCTAssertEqual(bottleTop?.recommended, true)
        XCTAssertEqual(bottleTop?.required, false)
    }

    func testGuidanceCoversEveryPlannedStep() {
        for kind in PartKind.allCases {
            for step in CapturePlan.forKind(kind).steps {
                let text = CaptureGuidance.text(kind: kind, angle: step.angle)
                XCTAssertFalse(text.isEmpty, "\(kind) \(step.angle)")
            }
        }
        XCTAssertEqual(
            CaptureGuidance.text(kind: .bottle, angle: .side),
            "צלם מהצד, המצלמה בגובה אמצע הרכיב, הכרטיס עומד ליד הרכיב"
        )
        XCTAssertEqual(PartKind.cap.hebrewName, "פקק")
        XCTAssertEqual(CaptureAngle.side.hebrew, "צד")
    }

    private func required(of kind: PartKind) -> [CaptureAngle] {
        CapturePlan.forKind(kind).steps.filter(\.required).map(\.angle)
    }

    private func optional(of kind: PartKind) -> [CaptureAngle] {
        CapturePlan.forKind(kind).steps.filter { !$0.required }.map(\.angle)
    }
}

final class CaptureSequenceTests: XCTestCase {
    func testEveryKindCanCompleteRetakeSkipAndRestore() throws {
        for kind in PartKind.allCases {
            var sequence = CaptureSequence(partId: UUID(), kind: kind)
            XCTAssertFalse(sequence.isComplete)
            XCTAssertEqual(sequence.stepLabel, "\(sequence.steps[0].angle.hebrew) 1/\(sequence.steps.count)")

            if sequence.current?.required == true {
                XCTAssertFalse(sequence.skip())
            }
            XCTAssertFalse(sequence.capture(samplePhoto(angle: .bottom)))

            let requiredAngles = sequence.steps.filter(\.required).map(\.angle)
            for angle in requiredAngles {
                XCTAssertEqual(sequence.current?.angle, angle)
                XCTAssertTrue(sequence.capture(samplePhoto(angle: angle)))
            }
            while sequence.current?.required == false {
                XCTAssertTrue(sequence.skip())
            }
            XCTAssertTrue(sequence.isComplete)
            XCTAssertTrue(sequence.isAtEnd)

            let first = sequence.steps[0].angle
            XCTAssertTrue(sequence.retake(angle: first))
            XCTAssertFalse(sequence.isComplete)
            XCTAssertEqual(sequence.current?.angle, first)
            XCTAssertNil(sequence.current?.photo)
            XCTAssertTrue(sequence.capture(samplePhoto(angle: first)))
            XCTAssertTrue(sequence.isComplete)

            let data = try JSONEncoder().encode(sequence)
            let restored = try JSONDecoder().decode(CaptureSequence.self, from: data)
            XCTAssertEqual(restored, sequence)

            restoredReset: do {
                var again = sequence
                again.reset()
                XCTAssertEqual(again.index, 0)
                XCTAssertEqual(again.partId, sequence.partId)
                XCTAssertTrue(again.steps.allSatisfy { $0.photo == nil && $0.skipped == false })
                XCTAssertFalse(again.isComplete)
            }
        }
    }

    func testCapWalkRetakeAndSkipBottom() throws {
        let partId = UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!
        var sequence = CaptureSequence(partId: partId, kind: .cap)
        XCTAssertEqual(sequence.stepLabel, "צד 1/3")
        XCTAssertTrue(sequence.capture(samplePhoto(angle: .side)))
        XCTAssertEqual(sequence.stepLabel, "למעלה 2/3")
        XCTAssertFalse(sequence.isComplete)
        XCTAssertTrue(sequence.capture(samplePhoto(angle: .top)))
        XCTAssertTrue(sequence.isComplete)
        XCTAssertEqual(sequence.current?.angle, .bottom)
        XCTAssertTrue(sequence.skip())
        XCTAssertTrue(sequence.isAtEnd)
        XCTAssertTrue(sequence.steps[2].skipped)

        XCTAssertTrue(sequence.retake(angle: .side))
        XCTAssertEqual(sequence.current?.angle, .side)
        XCTAssertNil(sequence.steps[0].photo)
        XCTAssertNotNil(sequence.steps[1].photo)
        XCTAssertTrue(sequence.steps[2].skipped)
        XCTAssertTrue(sequence.capture(samplePhoto(angle: .side)))
        XCTAssertTrue(sequence.isAtEnd)
        XCTAssertTrue(sequence.isComplete)

        let data = try JSONEncoder().encode(sequence)
        let restored = try JSONDecoder().decode(CaptureSequence.self, from: data)
        XCTAssertEqual(restored.partId, partId)
        XCTAssertEqual(restored, sequence)
    }

    func testCollarStepLabelIsSideOneOfTwo() {
        let sequence = CaptureSequence(kind: .collar)
        XCTAssertEqual(sequence.stepLabel, "צד 1/2")
    }
}

final class CapturedPhotoTests: XCTestCase {
    func testEncodeAndDecodeRoundTrip() throws {
        let photo = samplePhoto(angle: .front, corners: [
            ImagePoint(x: 10, y: 20),
            ImagePoint(x: 110, y: 22),
            ImagePoint(x: 108, y: 80),
            ImagePoint(x: 12, y: 78),
        ])
        let data = try JSONEncoder().encode(photo)
        let decoded = try JSONDecoder().decode(CapturedPhoto.self, from: data)
        XCTAssertEqual(decoded, photo)
        XCTAssertEqual(decoded.cardCorners?.count, 4)
        XCTAssertEqual(decoded.distanceSource, .card)
        XCTAssertEqual(decoded.guideState, .green)
        XCTAssertEqual(decoded.hasLiDAR, false)

        var missing = photo
        missing.cardCorners = nil
        missing.distanceMm = nil
        missing.distanceSource = .none
        missing.sigmaMm = nil
        missing.guideState = nil
        missing.tiltDegrees = nil
        let again = try JSONDecoder().decode(CapturedPhoto.self, from: JSONEncoder().encode(missing))
        XCTAssertEqual(again, missing)
        XCTAssertNil(again.cardCorners)
    }
}

private func samplePhoto(angle: CaptureAngle, corners: [ImagePoint]? = nil) -> CapturedPhoto {
    CapturedPhoto(
        id: UUID(uuidString: "11111111-2222-3333-4444-555555555555")!,
        angle: angle,
        fileName: "\(angle.rawValue).jpg",
        pixelWidth: 1920,
        pixelHeight: 1440,
        capturedAt: Date(timeIntervalSince1970: 1_700_000_000),
        intrinsics: CameraIntrinsics(fx: 1500, fy: 1500, cx: 960, cy: 720),
        distanceMm: 200,
        distanceSource: .card,
        sigmaMm: 0.4,
        guideState: .green,
        cardCorners: corners,
        tiltDegrees: 2,
        deviceModel: "iPhone15,4",
        hasLiDAR: false
    )
}
