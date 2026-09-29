import XCTest
import PackKit

final class DisplayImageSpaceTests: XCTestCase {
    func testRightOrientationRoundTrips() {
        let width = 1920.0
        let height = 1080.0
        let samples = [
            SIMD2(0.0, 0.0),
            SIMD2(1919, 0),
            SIMD2(0, 1079),
            SIMD2(960, 540),
            SIMD2(100, 200),
        ]
        for pixel in samples {
            let upright = DisplayImageSpace.uprightPoint(
                fromBuffer: pixel,
                bufferWidth: width,
                bufferHeight: height,
                orientation: .right
            )
            let back = DisplayImageSpace.bufferPoint(
                fromUpright: upright,
                bufferWidth: width,
                bufferHeight: height,
                orientation: .right
            )
            XCTAssertEqual(back.x, pixel.x, accuracy: 1e-6)
            XCTAssertEqual(back.y, pixel.y, accuracy: 1e-6)
        }
        let oriented = DisplayImageSpace.orientedSize(bufferWidth: width, bufferHeight: height, orientation: .right)
        XCTAssertEqual(oriented.width, height)
        XCTAssertEqual(oriented.height, width)
    }
}

final class EdgeSnapTests: XCTestCase {
    func testSnapsToAVerticalEdge() {
        let width = 40
        let height = 20
        var luma = [UInt8](repeating: 20, count: width * height)
        for y in 0..<height {
            for x in 18..<width {
                luma[y * width + x] = 200
            }
        }
        let snapped = EdgeSnap.snap(point: SIMD2(23, 10), luminance: luma, width: width, height: height, radius: 8)
        XCTAssertEqual(snapped.x, 18, accuracy: 1)
        XCTAssertEqual(snapped.y, 10, accuracy: 1)
    }

    func testFlatRegionStaysPut() {
        let luma = [UInt8](repeating: 40, count: 16)
        let point = SIMD2(4.2, 1.4)
        let snapped = EdgeSnap.snap(point: point, luminance: luma, width: 4, height: 4, radius: 2)
        XCTAssertEqual(snapped.x, point.x, accuracy: 1e-9)
        XCTAssertEqual(snapped.y, point.y, accuracy: 1e-9)
    }
}

final class OutlineHandleTests: XCTestCase {
    func testBandsRebuildTheSilhouetteAndAtLeastEightHandles() {
        var pixels = [UInt8](repeating: 0, count: 80 * 60)
        for y in 10..<50 {
            for x in 20..<55 {
                pixels[y * 80 + x] = 255
            }
        }
        let source = Silhouette(width: 80, height: 60, pixels: pixels)
        let bands = OutlineHandles.bands(from: source)
        XCTAssertGreaterThanOrEqual(bands.count * 2, 8)
        XCTAssertEqual(bands.count, OutlineHandles.minimumBands)
        let rebuilt = OutlineHandles.silhouette(from: bands, width: 80, height: 60)
        let sourceRows = source.rows()
        let rebuiltRows = rebuilt.rows()
        XCTAssertEqual(rebuiltRows.count, sourceRows.count)
        XCTAssertEqual(rebuiltRows.first?.left ?? -1, sourceRows.first?.left ?? -2)
        XCTAssertEqual(rebuiltRows.first?.right ?? -1, sourceRows.first?.right ?? -2)
        XCTAssertEqual(rebuiltRows.last?.y ?? -1, sourceRows.last?.y ?? -2)
    }

    func testMovingAHandleWidensThatBand() {
        var pixels = [UInt8](repeating: 0, count: 80 * 40)
        for y in 4..<36 {
            for x in 20..<40 {
                pixels[y * 80 + x] = 255
            }
        }
        let source = Silhouette(width: 80, height: 40, pixels: pixels)
        var bands = OutlineHandles.bands(from: source)
        let middle = bands.count / 2
        bands[middle].right += 12
        let rebuilt = OutlineHandles.silhouette(from: bands, width: 80, height: 40)
        let y = Int(bands[middle].y.rounded())
        let row = rebuilt.rows().first { $0.y == y }
        XCTAssertGreaterThanOrEqual(row?.right ?? 0, 50)
    }
}

final class EdgeContourTests: XCTestCase {
    func testPicksTheObjectNearestTheCardAndNotTheCard() {
        let width = 80
        let height = 60
        var luma = [UInt8](repeating: 10, count: width * height)
        fill(&luma, width: width, x: 4..<28, y: 10..<40, value: 240)
        fill(&luma, width: width, x: 40..<70, y: 12..<48, value: 180)
        let card = [SIMD2(4.0, 10), SIMD2(28, 10), SIMD2(28, 40), SIMD2(4, 40)]
        let outline = EdgeContour.extract(luminance: luma, width: width, height: height, card: card)
        let rows = outline?.silhouette.rows() ?? []
        XCTAssertFalse(rows.isEmpty)
        XCTAssertGreaterThanOrEqual(rows.map(\.left).min() ?? 0, 38)
        XCTAssertEqual(outline?.needsOutlineReview, false)
    }

    func testAThinRimNeedsOutlineReview() {
        let width = 80
        let height = 70
        var luma = [UInt8](repeating: 8, count: width * height)
        for y in 10..<60 {
            luma[y * width + 20] = 200
            luma[y * width + 21] = 200
            luma[y * width + 50] = 200
            luma[y * width + 51] = 200
        }
        for x in 20..<52 {
            luma[10 * width + x] = 200
            luma[11 * width + x] = 200
            luma[58 * width + x] = 200
            luma[59 * width + x] = 200
        }
        let outline = EdgeContour.extract(luminance: luma, width: width, height: height)
        XCTAssertEqual(outline?.needsOutlineReview, true)
        XCTAssertGreaterThan(outline?.silhouette.rows().count ?? 0, 8)
    }

    private func fill(_ luma: inout [UInt8], width: Int, x: Range<Int>, y: Range<Int>, value: UInt8) {
        for row in y {
            for column in x {
                luma[row * width + column] = value
            }
        }
    }
}

final class MeasureSampleTests: XCTestCase {
    func testBottleCapAndBoxLandWithinFiveMillimetres() {
        assertSample(MeasureSampleLibrary.bottle, width: 40, height: 100, depth: 40)
        assertSample(MeasureSampleLibrary.cap, width: 25, height: 30, depth: 25)
        assertSample(MeasureSampleLibrary.box, width: 76, height: 120, depth: 46)
    }

    func testContourOnTheRenderedBottleAgreesWithTheKnownSilhouette() {
        let sample = MeasureSampleLibrary.bottle
        let photo = sample.photos[0]
        var luma = [UInt8](repeating: 0, count: photo.width * photo.height)
        for index in luma.indices {
            let offset = index * 3
            let red = Double(photo.rgb[offset])
            let green = Double(photo.rgb[offset + 1])
            let blue = Double(photo.rgb[offset + 2])
            luma[index] = UInt8(min(255, 0.3 * red + 0.59 * green + 0.11 * blue))
        }
        let outline = EdgeContour.extract(
            luminance: luma,
            width: photo.width,
            height: photo.height,
            card: photo.corners
        )
        XCTAssertNotNil(outline)
        XCTAssertEqual(outline?.needsOutlineReview, false)
        let measured = measure(sample, silhouette: outline?.silhouette)
        XCTAssertEqual(measured.dimensions.heightMm, sample.heightMm, accuracy: 5)
        XCTAssertEqual(measured.dimensions.widthMm, sample.widthMm, accuracy: 5)
    }

    func testCapWithoutAReferenceCannotBeSaved() {
        let sample = MeasureSampleLibrary.cap
        let photos = sample.photos.map { photo in
            MeasureAssemblyPhoto(
                angle: photo.angle,
                intrinsics: photo.intrinsics,
                pixelWidth: photo.width,
                pixelHeight: photo.height,
                silhouette: photo.silhouette,
                cardCorners: photo.corners
            )
        }
        let blocked = MeasureAssembly.estimate(MeasureAssemblyRequest(kind: .cap, photos: photos))
        XCTAssertTrue(blocked.saveBlocked)
        XCTAssertTrue(blocked.issues.contains { $0.code == "scale_reference_required" })
    }

    func testEditedOutlineRescalesFromTheHandles() {
        let sample = MeasureSampleLibrary.bottle
        let photo = sample.photos[0]
        let bands = OutlineHandles.bands(from: photo.silhouette)
        XCTAssertGreaterThanOrEqual(bands.count * 2, 8)
        let rebuilt = OutlineHandles.silhouette(from: bands, width: photo.width, height: photo.height)
        let edited = measure(sample, silhouette: rebuilt, outlineEdited: true)
        XCTAssertFalse(edited.saveBlocked)
        XCTAssertEqual(edited.confidence.first?.model.band, .check)
        let rescaled = Rescale.apply(edited, axis: .height, to: 80)
        XCTAssertEqual(rescaled.dimensions.heightMm, 80, accuracy: 1e-6)
        XCTAssertEqual(rescaled.dimensions.widthMm, edited.dimensions.widthMm * (80 / edited.dimensions.heightMm), accuracy: 1e-4)
        XCTAssertEqual(rescaled.lathe, edited.lathe)
        XCTAssertEqual(rescaled.dimsVerifiedBySupplier, false)
        XCTAssertEqual(rescaled.toleranceMm, 5, accuracy: 1e-9)
    }

    func testCardOrderKeepsTheLongSideOnTheLongImageEdge() throws {
        let corners = MeasureSampleLibrary.bottle.photos[0].corners
        let ordered = CardCornerOrder.order(corners)
        let top = hypot(ordered[1].x - ordered[0].x, ordered[1].y - ordered[0].y)
        let side = hypot(ordered[2].x - ordered[1].x, ordered[2].y - ordered[1].y)
        XCTAssertGreaterThan(top, side)
        let result = measure(MeasureSampleLibrary.bottle, silhouette: nil)
        XCTAssertFalse(result.issues.contains { $0.code == "card_too_small" || $0.code == "card_tilt" })
    }

    private func assertSample(_ sample: MeasureSample, width: Double, height: Double, depth: Double) {
        let result = measure(sample, silhouette: nil)
        XCTAssertEqual(result.dimensions.widthMm, width, accuracy: 5, sample.id)
        XCTAssertEqual(result.dimensions.heightMm, height, accuracy: 5, sample.id)
        XCTAssertEqual(result.dimensions.depthMm, depth, accuracy: 5, sample.id)
        XCTAssertFalse(result.saveBlocked, sample.id)
        XCTAssertEqual(result.dimsVerifiedBySupplier, false)
        XCTAssertEqual(result.toleranceMm, 5, accuracy: 1e-9)
        XCTAssertEqual(result.validationIssues().filter { $0.severity == .error }, [], sample.id)
        if sample.kind != .box {
            XCTAssertNotNil(result.lathe)
        }
    }

    private func measure(_ sample: MeasureSample, silhouette: Silhouette?, outlineEdited: Bool = false) -> MeasureResult {
        let photos = sample.photos.map { photo -> MeasureAssemblyPhoto in
            let mask = photo.angle == sample.photos[0].angle ? (silhouette ?? photo.silhouette) : photo.silhouette
            return MeasureAssemblyPhoto(
                angle: photo.angle,
                intrinsics: photo.intrinsics,
                pixelWidth: photo.width,
                pixelHeight: photo.height,
                silhouette: mask,
                cardCorners: photo.corners,
                device: "iPhone15,4"
            )
        }
        let corners = sample.photos[0].corners
        return MeasureAssembly.estimate(MeasureAssemblyRequest(
            kind: sample.kind,
            photos: photos,
            reference: .card(corners),
            outlineEdited: outlineEdited
        ))
    }

    private func hypot(_ x: Double, _ y: Double) -> Double {
        (x * x + y * y).squareRoot()
    }
}

final class MeasureOverlayGeometryTests: XCTestCase {
    func testAxisAndExtent() {
        var pixels = [UInt8](repeating: 0, count: 30 * 20)
        for y in 4..<16 {
            for x in 8..<20 {
                pixels[y * 30 + x] = 255
            }
        }
        let model = MeasureOverlayGeometry.model(silhouette: Silhouette(width: 30, height: 20, pixels: pixels))
        XCTAssertEqual(model?.height.start.y ?? -1, 4, accuracy: 1e-6)
        XCTAssertEqual(model?.height.end.y ?? -1, 15, accuracy: 1e-6)
        XCTAssertEqual(model?.width.start.x ?? -1, 8, accuracy: 1e-6)
        XCTAssertEqual(model?.width.end.x ?? -1, 19, accuracy: 1e-6)
        XCTAssertGreaterThan(model?.outline.count ?? 0, 4)
    }
}
