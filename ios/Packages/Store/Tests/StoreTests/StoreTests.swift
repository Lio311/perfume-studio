import Foundation
import PackKit
import XCTest
@testable import Store

final class StoreTests: XCTestCase {
    func testSaveListLoadAndDeleteRoundTrip() throws {
        let store = try makeStore()
        let partId = UUID()
        var sequence = CaptureSequence(partId: partId, kind: .cap)
        let side = samplePhoto(angle: .side, fileName: "side.jpg")
        let top = samplePhoto(angle: .top, fileName: "top.jpg")
        XCTAssertTrue(sequence.capture(side))
        XCTAssertTrue(sequence.capture(top))
        let sideJPEG = Data([0xFF, 0xD8, 0x11])
        let topJPEG = Data([0xFF, 0xD8, 0x22])
        try store.save(
            sequence: sequence,
            images: [side.fileName: sideJPEG, top.fileName: topJPEG],
            now: Date(timeIntervalSince1970: 10)
        )

        let listed = try store.list()
        XCTAssertEqual(listed.count, 1)
        XCTAssertEqual(listed[0].sequence, sequence)
        XCTAssertEqual(listed[0].updatedAt, Date(timeIntervalSince1970: 10))
        XCTAssertEqual(store.load(partId: partId)?.sequence, sequence)
        XCTAssertEqual(try store.imageData(partId: partId, fileName: side.fileName), sideJPEG)
        XCTAssertEqual(try store.imageData(partId: partId, fileName: top.fileName), topJPEG)

        try store.delete(partId: partId)
        XCTAssertTrue(try store.list().isEmpty)
        XCTAssertNil(store.load(partId: partId))
        XCTAssertThrowsError(try store.imageData(partId: partId, fileName: side.fileName))
    }

    func testRetakeRemovesTheOldJPEGAndKeepsTheDraft() throws {
        let store = try makeStore()
        let partId = UUID()
        var sequence = CaptureSequence(partId: partId, kind: .pump)
        let photo = samplePhoto(angle: .side, fileName: "side-old.jpg")
        XCTAssertTrue(sequence.capture(photo))
        try store.save(sequence: sequence, images: [photo.fileName: Data([1, 2, 3])], now: Date(timeIntervalSince1970: 1))

        XCTAssertTrue(sequence.retake(angle: .side))
        let replacement = samplePhoto(angle: .side, fileName: "side-new.jpg")
        XCTAssertTrue(sequence.capture(replacement))
        try store.save(sequence: sequence, images: [replacement.fileName: Data([4, 5])], now: Date(timeIntervalSince1970: 2))

        XCTAssertEqual(try store.imageData(partId: partId, fileName: "side-new.jpg"), Data([4, 5]))
        XCTAssertThrowsError(try store.imageData(partId: partId, fileName: "side-old.jpg"))
        XCTAssertEqual(store.load(partId: partId)?.sequence.steps.first?.photo?.fileName, "side-new.jpg")
    }

    func testListIsNewestFirstAndSkipsGarbage() throws {
        let root = try makeRoot()
        let store = ScanFileStore(root: root)
        var older = CaptureSequence(partId: UUID(), kind: .label)
        XCTAssertTrue(older.capture(samplePhoto(angle: .front, fileName: "front.jpg")))
        var newer = CaptureSequence(partId: UUID(), kind: .box)
        XCTAssertTrue(newer.capture(samplePhoto(angle: .front, fileName: "front.jpg")))
        try store.save(sequence: older, images: ["front.jpg": Data([1])], now: Date(timeIntervalSince1970: 5))
        try store.save(sequence: newer, images: ["front.jpg": Data([2])], now: Date(timeIntervalSince1970: 9))

        let junk = root.appendingPathComponent("not-a-draft", isDirectory: true)
        try FileManager.default.createDirectory(at: junk, withIntermediateDirectories: true)
        try Data("nope".utf8).write(to: junk.appendingPathComponent("part.json"))

        let listed = try store.list()
        XCTAssertEqual(listed.map(\.sequence.partId), [newer.partId, older.partId])
    }

    func testMeasurementRoundTripsValidatesAndSurvivesAnotherSave() throws {
        let store = try makeStore()
        let partId = UUID()
        var sequence = CaptureSequence(partId: partId, kind: .cap)
        let photo = samplePhoto(angle: .side, fileName: "side.jpg")
        XCTAssertTrue(sequence.capture(photo))
        let measurement = DraftMeasurement(
            widthMm: 25,
            heightMm: 30,
            depthMm: 25,
            lathe: [0.4, 0.8, 1, 0.9, 0.5],
            neckOuterDiameterMm: 18,
            profile: "cylinder",
            measurements: [
                Measurements(key: "widthMm", value: 25, source: "reference-card", toleranceMm: 5),
                Measurements(key: "heightMm", value: 30, source: "reference-card", toleranceMm: 5),
                Measurements(key: "depthMm", value: 25, source: "reference-card", toleranceMm: 5),
            ],
            scan: ScanInfo(
                method: "photo-lathe",
                capturedAt: "2026-09-29T00:00:00Z",
                device: "iPhone15,4",
                appVersion: "0.1.0",
                material: nil,
                scale: "reference-card",
                referenceObject: "ISO/IEC 7810 ID-1 card 85.60x53.98mm",
                confidence: 0.9,
                neckSuggestion: nil,
                dimsVerifiedBySupplier: true,
                toleranceMm: 1
            )
        )
        XCTAssertEqual(measurement.scan.dimsVerifiedBySupplier, false)
        XCTAssertEqual(measurement.scan.toleranceMm, 5)
        XCTAssertEqual(measurement.validationIssues(kind: .cap), [])

        try store.save(
            sequence: sequence,
            images: ["side.jpg": Data([0xFF, 0xD8])],
            measurement: measurement,
            now: Date(timeIntervalSince1970: 30)
        )
        let loaded = store.load(partId: partId)
        XCTAssertEqual(loaded?.measurement, measurement)
        XCTAssertEqual(loaded?.measurement?.lathe, [0.4, 0.8, 1, 0.9, 0.5])

        let url = store.root
            .appendingPathComponent(partId.uuidString.lowercased(), isDirectory: true)
            .appendingPathComponent("part.json")
        let json = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(json.contains("\"lathe\""))
        XCTAssertTrue(json.contains("\"dimsVerifiedBySupplier\":false"))
        XCTAssertTrue(json.contains("\"toleranceMm\":5"))
        XCTAssertTrue(json.contains("\"measurements\""))

        try store.save(sequence: sequence, images: [:], now: Date(timeIntervalSince1970: 40))
        XCTAssertEqual(store.load(partId: partId)?.measurement, measurement)
        XCTAssertEqual(store.load(partId: partId)?.updatedAt, Date(timeIntervalSince1970: 40))

        let tooSmall = DraftMeasurement(
            widthMm: 5,
            heightMm: 30,
            depthMm: 25,
            lathe: nil,
            neckOuterDiameterMm: nil,
            profile: "cylinder",
            measurements: [],
            scan: measurement.scan
        )
        XCTAssertTrue(tooSmall.validationIssues(kind: .cap).contains { $0.code == "dimension_range" })
    }

    func testRejectsPathTraversalAndDeleteIsIdempotent() throws {
        let store = try makeStore()
        var sequence = CaptureSequence(partId: UUID(), kind: .bottle)
        let photo = samplePhoto(angle: .side, fileName: "side.jpg")
        XCTAssertTrue(sequence.capture(photo))
        XCTAssertThrowsError(try store.save(sequence: sequence, images: ["../part.json": Data([1])])) { error in
            XCTAssertEqual(error as? ScanStoreError, .invalidFileName)
        }
        try store.delete(partId: sequence.partId)
        try store.delete(partId: sequence.partId)
        XCTAssertTrue(try store.list().isEmpty)
    }

    private func makeStore() throws -> ScanFileStore {
        ScanFileStore(root: try makeRoot())
    }

    private func makeRoot() throws -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("scan-store-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        addTeardownBlock {
            try? FileManager.default.removeItem(at: root)
        }
        return root
    }
}

private func samplePhoto(angle: CaptureAngle, fileName: String) -> CapturedPhoto {
    CapturedPhoto(
        id: UUID(),
        angle: angle,
        fileName: fileName,
        pixelWidth: 8,
        pixelHeight: 8,
        capturedAt: Date(timeIntervalSince1970: 20),
        intrinsics: CameraIntrinsics(fx: 10, fy: 10, cx: 4, cy: 4),
        distanceMm: 180,
        distanceSource: .vio,
        sigmaMm: 1,
        guideState: .yellow,
        cardCorners: nil,
        tiltDegrees: nil,
        deviceModel: "iPhone15,4",
        hasLiDAR: false
    )
}
