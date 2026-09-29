import XCTest
@testable import ReconstructCore

final class VersionGateTests: XCTestCase {
    func testAllowsMacOS13OnAppleSiliconWhenPhotogrammetryIsSupported() {
        let decision = VersionGate.evaluate(host(system: "macOS", major: 13, minor: 0, patch: 0, silicon: true, supported: true))
        XCTAssertTrue(decision.allowed)
        XCTAssertEqual(decision.reasons, [])
        XCTAssertEqual(decision.message, "")
    }

    func testBlocksOlderMacOSAndIncludesTheDetectedVersion() {
        let decision = VersionGate.evaluate(host(system: "macOS", major: 12, minor: 6, patch: 1, silicon: true, supported: true))
        XCTAssertFalse(decision.allowed)
        XCTAssertEqual(decision.reasons, [.operatingSystemTooOld])
        XCTAssertTrue(decision.message.contains("שגיאה"))
        XCTAssertTrue(decision.message.contains("macOS 13"))
        XCTAssertTrue(decision.message.contains("Detected: macOS 12.6.1"))
    }

    func testBlocksIntelAndUnsupportedSession() {
        let decision = VersionGate.evaluate(host(system: "macOS", major: 14, minor: 2, patch: 0, silicon: false, supported: false))
        XCTAssertFalse(decision.allowed)
        XCTAssertEqual(decision.reasons, [.notAppleSilicon, .photogrammetryUnsupported])
        XCTAssertTrue(decision.message.contains("Apple silicon"))
        XCTAssertTrue(decision.message.contains("isSupported=false"))
    }

    func testBlocksLinuxEvenWhenTheKernelVersionLooksNew() {
        let decision = VersionGate.evaluate(host(system: "Linux", major: 6, minor: 12, patch: 0, silicon: false, supported: false))
        XCTAssertFalse(decision.allowed)
        XCTAssertEqual(decision.reasons, [.notMacOS])
        XCTAssertTrue(decision.message.contains("אינה macOS"))
        XCTAssertTrue(decision.message.contains("Linux 6.12.0"))
    }

    private func host(system: String, major: Int, minor: Int, patch: Int, silicon: Bool, supported: Bool) -> HostFacts {
        HostFacts(
            systemName: system,
            major: major,
            minor: minor,
            patch: patch,
            isAppleSilicon: silicon,
            photogrammetrySupported: supported
        )
    }
}

final class ArgumentParserTests: XCTestCase {
    func testParsesTheFullCommandAndDefaults() {
        let options = tryParse([
            "/tmp/shots",
            "-o", "/tmp/out",
            "--detail", "full",
            "--height-mm", "120.5",
            "--masking", "off",
            "--ordering", "unordered",
            "--feature-sensitivity", "high",
            "--name", "Bottle 01",
        ])
        XCTAssertEqual(options.imagesFolder.path, "/tmp/shots")
        XCTAssertEqual(options.outputDirectory.path, "/tmp/out")
        XCTAssertEqual(options.detail, .full)
        XCTAssertEqual(options.heightMm, 120.5)
        XCTAssertNil(options.widthMm)
        XCTAssertFalse(options.useCard)
        XCTAssertFalse(options.masking)
        XCTAssertEqual(options.ordering, .unordered)
        XCTAssertEqual(options.featureSensitivity, .high)
        XCTAssertEqual(options.name, "Bottle 01")
    }

    func testDefaultsToMediumSequentialMaskingOn() {
        let options = tryParse(["shots", "--output", "out"])
        XCTAssertEqual(options.detail, .medium)
        XCTAssertTrue(options.masking)
        XCTAssertEqual(options.ordering, .sequential)
        XCTAssertEqual(options.featureSensitivity, .normal)
        XCTAssertFalse(options.useCard)
        XCTAssertNil(options.heightMm)
    }

    func testCardCanCarryATypedFallback() {
        let options = tryParse(["shots", "-o", "out", "--card", "--width-mm=40"])
        XCTAssertTrue(options.useCard)
        XCTAssertEqual(options.widthMm, 40)
        XCTAssertNil(options.heightMm)
    }

    func testRejectsBothAxes() {
        let message = tryInvalid(["shots", "-o", "out", "--height-mm", "10", "--width-mm", "20"])
        XCTAssertTrue(message.contains("--height-mm"))
        XCTAssertTrue(message.contains("Error:"))
    }

    func testRejectsABadDetailAndAMissingOutput() {
        XCTAssertTrue(tryInvalid(["shots", "-o", "out", "--detail", "ultra"]).contains("preview"))
        XCTAssertTrue(tryInvalid(["shots"]).contains("-o"))
        XCTAssertTrue(tryInvalid(["-o", "out"]).contains("images folder") || tryInvalid(["-o", "out"]).contains("תיקיית"))
    }

    func testHelpIsDistinctFromAnUnknownFlag() {
        switch ArgumentParser.parse(["--help"]) {
        case .failure(.help): break
        default: XCTFail("expected help")
        }
        XCTAssertTrue(tryInvalid(["shots", "-o", "out", "--nope"]).contains("Unknown flag"))
        XCTAssertTrue(tryInvalid(["shots", "-o", "out", "--height-mm", "-4"]).contains("positive"))
    }

    func testHelpTextCarriesTheQualityNotesInBothLanguages() {
        XCTAssertTrue(HelpText.text.contains("זכוכית שקופה ומתכת מבריקה"))
        XCTAssertTrue(HelpText.text.contains("Clear glass and shiny metal"))
        XCTAssertTrue(HelpText.text.contains("30–50"))
        XCTAssertTrue(HelpText.text.contains("5 mm"))
        XCTAssertTrue(HelpText.text.contains(HelpText.usage))
    }

    private func tryParse(_ args: [String]) -> ReconstructOptions {
        guard case .success(let options) = ArgumentParser.parse(args) else {
            XCTFail("parse failed for \(args)")
            return ReconstructOptions(imagesFolder: URL(fileURLWithPath: "/"), outputDirectory: URL(fileURLWithPath: "/"))
        }
        return options
    }

    private func tryInvalid(_ args: [String]) -> String {
        guard case .failure(.invalid(let message)) = ArgumentParser.parse(args) else {
            XCTFail("expected invalid for \(args)")
            return ""
        }
        return message
    }
}

final class CaptureManifestTests: XCTestCase {
    func testDecodesTheDocumentTheIPhoneSideShouldWrite() throws {
        let json = """
        {
          "partId": "bottle-01",
          "kind": "bottle",
          "extra": true,
          "dimensionsMm": {"widthMm": 48, "heightMm": 120, "depthMm": 48},
          "photos": [
            {
              "filename": "IMG_0001.HEIC",
              "imageWidth": 4032,
              "imageHeight": 3024,
              "cardCorners": [
                {"x": 100, "y": 200},
                [500, 210],
                {"u": 510, "v": 480},
                {"x": 110, "y": 470}
              ],
              "intrinsics": {"fx": 3200, "fy": 3200, "cx": 2016, "cy": 1512}
            }
          ]
        }
        """.data(using: .utf8)!
        let decoded = try XCTUnwrap(tryCapture(json))
        XCTAssertEqual(decoded.manifest.partId, "bottle-01")
        XCTAssertEqual(decoded.manifest.kind, "bottle")
        XCTAssertEqual(decoded.manifest.heightMm, 120)
        XCTAssertEqual(decoded.manifest.widthMm, 48)
        XCTAssertEqual(decoded.manifest.depthMm, 48)
        XCTAssertEqual(decoded.manifest.photos.count, 1)
        XCTAssertEqual(decoded.manifest.photos[0].file, "IMG_0001.HEIC")
        XCTAssertEqual(decoded.manifest.photos[0].cardCorners.count, 4)
        XCTAssertEqual(decoded.manifest.photos[0].cardCorners[1].x, 500)
        XCTAssertEqual(decoded.manifest.photos[0].intrinsics?.fx, 3200)
        XCTAssertTrue(decoded.warnings.isEmpty)
    }

    func testTopLevelDimensionsOverrideTheNestedObjectAndUnknownShapeIsSkipped() throws {
        let json = """
        {"dimensions": {"height": 10}, "heightMm": 88, "widthMm": "40.5", "photos": ["nope"], "kind": 3}
        """.data(using: .utf8)!
        let decoded = try XCTUnwrap(tryCapture(json))
        XCTAssertEqual(decoded.manifest.heightMm, 88)
        XCTAssertEqual(decoded.manifest.widthMm, 40.5)
        XCTAssertTrue(decoded.manifest.photos.isEmpty)
        XCTAssertFalse(decoded.warnings.isEmpty)
    }

    func testRowMajorIntrinsicsAndNormalizedCornersStayOnThePhoto() throws {
        let json = """
        {"photos":[{"file":"a.jpg","cardCorners":[[0.1,0.2],[0.8,0.2],[0.8,0.7],[0.1,0.7]],"intrinsics":[[1000,0,500],[0,1000,400],[0,0,1]]}]}
        """.data(using: .utf8)!
        let decoded = try XCTUnwrap(tryCapture(json))
        let photo = try XCTUnwrap(decoded.manifest.photos.first)
        XCTAssertEqual(photo.intrinsics?.cx, 500)
        XCTAssertEqual(photo.intrinsics?.fy, 1000)
        let pixels = CardCornerResolver.pixelCorners(photo.cardCorners, imageWidth: 1000, imageHeight: 800)
        XCTAssertEqual(pixels?.first?.x ?? -1, 100, accuracy: 0.001)
        XCTAssertEqual(pixels?.first?.y ?? -1, 160, accuracy: 0.001)
    }

    func testInvalidJSONFailsClearly() {
        switch CaptureManifestDecoder.decode(Data("not-json".utf8)) {
        case .failure(let error):
            XCTAssertTrue(error.message.contains("capture.json"))
            XCTAssertTrue(error.message.contains("שגיאה"))
        case .success:
            XCTFail("expected failure")
        }
    }

    private func tryCapture(_ data: Data) -> CaptureDecodeResult? {
        guard case .success(let result) = CaptureManifestDecoder.decode(data) else { return nil }
        return result
    }
}

final class ImageRuleTests: XCTestCase {
    func testFewerThanTenFailsAndFewerThanTwentyWarns() {
        let failure = ImageRules.failure(readableCount: 9, unreadableNames: [])
        XCTAssertTrue(failure?.contains("9") == true)
        XCTAssertTrue(failure?.contains("10") == true)
        XCTAssertNil(ImageRules.failure(readableCount: 15, unreadableNames: []))
        XCTAssertTrue(ImageRules.warnings(readableCount: 15).first?.contains("20") == true)
        XCTAssertTrue(ImageRules.warnings(readableCount: 30).isEmpty)
    }

    func testUnreadableFilesAreAnError() {
        let failure = ImageRules.failure(readableCount: 40, unreadableNames: ["bad.jpg"])
        XCTAssertTrue(failure?.contains("bad.jpg") == true)
        XCTAssertTrue(failure?.contains("לא קריאים") == true)
    }

    func testFolderScanSkipsOtherFilesAndReportsEmptyImages() throws {
        let root = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("reconstruct-scan-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try Data("jpeg".utf8).write(to: root.appendingPathComponent("b.JPG"))
        try Data("heic".utf8).write(to: root.appendingPathComponent("a.heic"))
        try Data("{}".utf8).write(to: root.appendingPathComponent("capture.json"))
        try Data("nope".utf8).write(to: root.appendingPathComponent("notes.txt"))
        try Data().write(to: root.appendingPathComponent("empty.jpeg"))

        let scan = ImageFolderScan.scan(directory: root) { url in
            url.lastPathComponent != "empty.jpeg"
        }
        XCTAssertFalse(scan.directoryUnreadable)
        XCTAssertEqual(scan.readable.map(\.lastPathComponent), ["a.heic", "b.JPG"])
        XCTAssertEqual(scan.unreadable.map(\.lastPathComponent), ["empty.jpeg"])
    }
}

final class ScaleTests: XCTestCase {
    func testHeightScaleGroundsAndCentres() {
        let before = BoundingBox(min: Vec3(1, 2, 3), max: Vec3(3, 6, 7))
        let factor = tryUnwrap(ModelScaler.axisFactor(bounds: before, axis: .height, millimetres: 40))
        XCTAssertEqual(factor, 10, accuracy: 1e-9)
        let similarity = tryUnwrap(ModelScaler.similarity(bounds: before, factor: factor))
        let scaledMin = similarity.apply(before.min)
        let scaledMax = similarity.apply(before.max)
        XCTAssertEqual(scaledMin.y, 0, accuracy: 1e-9)
        XCTAssertEqual(scaledMax.y, 40, accuracy: 1e-9)
        XCTAssertEqual((scaledMin.x + scaledMax.x) / 2, 0, accuracy: 1e-9)
        XCTAssertEqual((scaledMin.z + scaledMax.z) / 2, 0, accuracy: 1e-9)
        XCTAssertEqual(scaledMax.x - scaledMin.x, 20, accuracy: 1e-9)
    }

    func testWidthUsesTheLargerHorizontalExtent() {
        let before = BoundingBox(min: Vec3(1, 2, 3), max: Vec3(3, 6, 7))
        let factor = tryUnwrap(ModelScaler.axisFactor(bounds: before, axis: .width, millimetres: 20))
        XCTAssertEqual(factor, 5, accuracy: 1e-9)
        XCTAssertNil(ModelScaler.axisFactor(bounds: BoundingBox(min: .zero, max: Vec3(1, 0, 1)), axis: .height, millimetres: 10))
    }

    func testCaptureJsonPrefersHeightUnlessTheCLIOverridesIt() {
        let capture = CaptureManifest(heightMm: 120, widthMm: 48)
        guard case .axis(.height, 120, "capture.json") = ReferenceResolver.resolve(cliHeight: nil, cliWidth: nil, useCard: false, capture: capture) else {
            return XCTFail("expected capture height")
        }
        guard case .axis(.width, 40, "cli") = ReferenceResolver.resolve(cliHeight: nil, cliWidth: 40, useCard: false, capture: capture) else {
            return XCTFail("expected cli width")
        }
        guard case .card(let fallback) = ReferenceResolver.resolve(cliHeight: 90, cliWidth: nil, useCard: true, capture: capture) else {
            return XCTFail("expected card")
        }
        XCTAssertEqual(fallback, AxisFallback(axis: .height, millimetres: 90, source: "cli"))
        guard case .missing = ReferenceResolver.resolve(cliHeight: nil, cliWidth: nil, useCard: false, capture: CaptureManifest()) else {
            return XCTFail("expected missing")
        }
        XCTAssertTrue(ReferenceResolver.missingMessage.contains("אריזה"))
        XCTAssertTrue(ReferenceResolver.missingMessage.contains("useless for packaging"))
    }

    func testCardFallbackAndCrossAxisWarning() {
        let before = BoundingBox(min: Vec3(0, 0, 0), max: Vec3(2, 4, 2))
        let plan = ScalePlan.card(fallback: AxisFallback(axis: .height, millimetres: 40, source: "capture.json"))
        let failed = tryUnwrap(ScaleSolve.solve(bounds: before, plan: plan, cardMillimetresPerUnit: nil))
        XCTAssertEqual(failed.factor, 10, accuracy: 1e-9)
        XCTAssertEqual(failed.reference.kind, "height")
        XCTAssertTrue(failed.warnings.first?.contains("Card scale failed") == true)

        let card = tryUnwrap(ScaleSolve.solve(bounds: before, plan: plan, cardMillimetresPerUnit: 10))
        XCTAssertEqual(card.reference.kind, "card")
        XCTAssertNil(card.scaledAxis)
        XCTAssertEqual(card.reference.cardWidthMm, 85.60)

        let after = BoundingBox(min: similarityMin(card.similarity, before), max: card.similarity.apply(before.max))
        let warnings = DimensionCheck.warnings(after: after, captureHeight: 40, captureWidth: 48, captureDepth: 20, scaledAxis: nil)
        XCTAssertTrue(warnings.contains { $0.contains("width") && $0.contains("5") })
        XCTAssertFalse(warnings.contains { $0.contains("height is") })
    }

    func testCloseCrossAxisIsSilent() {
        let after = BoundingBox(min: Vec3(-10, 0, -10), max: Vec3(10, 40, 10))
        let warnings = DimensionCheck.warnings(after: after, captureHeight: 40, captureWidth: 22, captureDepth: nil, scaledAxis: .height)
        XCTAssertTrue(warnings.isEmpty)
    }

    private func similarityMin(_ similarity: Similarity, _ bounds: BoundingBox) -> Vec3 {
        similarity.apply(bounds.min)
    }

    private func tryUnwrap<T>(_ value: T?) -> T {
        guard let value else {
            XCTFail("unexpected nil")
            fatalError("unexpected nil")
        }
        return value
    }
}

final class CardScaleTests: XCTestCase {
    func testIntersectingRaysMeetAtThePoint() {
        let point = RayMath.closestPoint([
            Ray(origin: Vec3(0, 0, 5), direction: Vec3(0, 0, -1)),
            Ray(origin: Vec3(5, 0, 0), direction: Vec3(-1, 0, 0)),
        ])
        XCTAssertEqual(point?.x ?? 9, 0, accuracy: 1e-6)
        XCTAssertEqual(point?.y ?? 9, 0, accuracy: 1e-6)
        XCTAssertEqual(point?.z ?? 9, 0, accuracy: 1e-6)
    }

    func testParallelRaysFail() {
        XCTAssertNil(RayMath.closestPoint([
            Ray(origin: Vec3(0, 0, 0), direction: Vec3(0, 0, -1)),
            Ray(origin: Vec3(1, 0, 0), direction: Vec3(0, 0, -1)),
        ]))
    }

    func testPrincipalPointLooksDownNegativeZ() throws {
        let ray = try XCTUnwrap(CameraRay.ray(
            pixel: Vec2(50, 50),
            intrinsics: PinholeIntrinsics(fx: 100, fy: 100, cx: 50, cy: 50),
            cameraToWorld: .identity
        ))
        XCTAssertEqual(ray.origin.x, 0, accuracy: 1e-9)
        XCTAssertEqual(ray.direction.x, 0, accuracy: 1e-9)
        XCTAssertEqual(ray.direction.y, 0, accuracy: 1e-9)
        XCTAssertEqual(ray.direction.z, -1, accuracy: 1e-9)
    }

    func testKnownCardReturnsAboutOneMillimetrePerUnit() {
        let corners = [
            Vec3(0, 0, 0),
            Vec3(85.60, 0, 0),
            Vec3(85.60, 0, 53.98),
            Vec3(0, 0, 53.98),
        ]
        let scale = CardScale.millimetresPerUnit(corners: corners)
        XCTAssertEqual(scale ?? 0, 1, accuracy: 1e-9)
    }

    func testShrunkCardReturnsTenMillimetresPerUnit() {
        let corners = [
            Vec3(0, 0, 0),
            Vec3(8.560, 0, 0),
            Vec3(8.560, 0, 5.398),
            Vec3(0, 0, 5.398),
        ]
        XCTAssertEqual(CardScale.millimetresPerUnit(corners: corners) ?? 0, 10, accuracy: 1e-6)
    }

    func testSquareCardIsRejected() {
        let corners = [Vec3(0, 0, 0), Vec3(10, 0, 0), Vec3(10, 0, 10), Vec3(0, 0, 10)]
        XCTAssertNil(CardScale.millimetresPerUnit(corners: corners))
    }

    func testTwoCamerasRecoverTheCardScale() {
        let intrinsics = PinholeIntrinsics(fx: 500, fy: 500, cx: 320, cy: 240)
        let corners = [
            Vec3(0, 0, -10),
            Vec3(8.56, 0, -10),
            Vec3(8.56, 5.398, -10),
            Vec3(0, 5.398, -10),
        ]
        let cameras = [
            Mat4.identity,
            Mat4(rotationColumns: (Vec3(1, 0, 0), Vec3(0, 1, 0), Vec3(0, 0, 1)), translation: Vec3(3, 1, 0)),
        ]
        let views = cameras.enumerated().map { index, camera in
            CardView(
                fileName: "cam-\(index).jpg",
                corners: corners.map { project($0, camera: camera, intrinsics: intrinsics) },
                intrinsics: intrinsics,
                cameraToWorld: camera
            )
        }
        let scale = CardObservationBuilder.scale(views: views)
        XCTAssertEqual(scale ?? 0, 10, accuracy: 1e-4)
    }

    private func project(_ point: Vec3, camera: Mat4, intrinsics: PinholeIntrinsics) -> Vec2 {
        let cameraPoint = inverseRigid(camera, point)
        let x = cameraPoint.x / -cameraPoint.z
        let y = cameraPoint.y / -cameraPoint.z
        return Vec2(x * intrinsics.fx + intrinsics.cx, intrinsics.cy - y * intrinsics.fy)
    }

    private func inverseRigid(_ cameraToWorld: Mat4, _ point: Vec3) -> Vec3 {
        let translated = Vec3(point.x - cameraToWorld.m[12], point.y - cameraToWorld.m[13], point.z - cameraToWorld.m[14])
        return Vec3(
            cameraToWorld.m[0] * translated.x + cameraToWorld.m[1] * translated.y + cameraToWorld.m[2] * translated.z,
            cameraToWorld.m[4] * translated.x + cameraToWorld.m[5] * translated.y + cameraToWorld.m[6] * translated.z,
            cameraToWorld.m[8] * translated.x + cameraToWorld.m[9] * translated.y + cameraToWorld.m[10] * translated.z
        )
    }
}

final class ReportAndMeshTests: XCTestCase {
    func testReportRoundTrip() throws {
        let report = ReconstructionReport(
            name: "bottle-01",
            detail: "medium",
            imageCount: 36,
            durationSeconds: 12.5,
            scaleFactor: 10,
            reference: ReportReference(kind: "height", millimetres: 120, source: "capture.json", cardWidthMm: nil, cardHeightMm: nil),
            boundingBoxMmBefore: ReportBox(min: Vec3(0, 0, 0), max: Vec3(1, 2, 1), size: Vec3(1, 2, 1)),
            boundingBoxMmAfter: ReportBox(min: Vec3(-5, 0, -5), max: Vec3(5, 20, 5), size: Vec3(10, 20, 10)),
            warnings: ["אזהרה: בדיקה\nWarning: check"],
            outputs: ReportOutputs(usdz: "bottle-01.usdz", scaledUsdz: "bottle-01-scaled.usdz", obj: "bottle-01.obj", glb: nil)
        )
        let data = try ReportCodec.encode(report)
        let json = String(decoding: data, as: UTF8.self)
        XCTAssertTrue(json.contains("\"boundingBoxMmBefore\""))
        XCTAssertTrue(json.contains("\"scaleFactor\""))
        XCTAssertTrue(json.contains("\"imageCount\""))
        let decoded = try ReportCodec.decode(data)
        XCTAssertEqual(decoded, report)
    }

    func testNamesAndGLBDraft() {
        XCTAssertEqual(ModelName.resolve(flag: nil, partId: "bottle-01", folderName: "Shots"), "bottle-01")
        XCTAssertEqual(ModelName.resolve(flag: "My Bottle", partId: "ignored", folderName: "Shots"), "My-Bottle")
        XCTAssertEqual(ModelName.sanitize("***"), "model")
        let files = OutputFiles.files(name: "cap")
        XCTAssertEqual(files.usdz, "cap.usdz")
        XCTAssertEqual(files.scaledUsdz, "cap-scaled.usdz")
        XCTAssertEqual(files.glb, "cap.glb")
        XCTAssertEqual(files.obj, "cap.obj")
        XCTAssertEqual(files.report, "report.json")

        let png = Data([1, 2, 3])
        let mesh = ExtractedMesh(
            positions: [SIMD3(0, 0, 0), SIMD3(1, 0, 0), SIMD3(0, 1, 0)],
            normals: [SIMD3(0, 0, 1), SIMD3(0, 0, 1), SIMD3(0, 0, 1)],
            uvs: [SIMD2(0, 0), SIMD2(1, 0), SIMD2(0, 1)],
            indices: [0, 1, 2],
            material: ExtractedMaterial(baseColor: SIMD4(1, 0, 0, 1), metallic: 0.2, roughness: 0.4, alphaBlend: false, baseColorTexturePNG: png)
        )
        let draft = GLBDraft.drafts(from: [mesh])[0]
        XCTAssertEqual(draft.indices, [0, 1, 2])
        XCTAssertEqual(draft.baseColorTexturePNG, png)
        XCTAssertEqual(draft.metallic, 0.2)

        let encoder = FakeEncoder()
        XCTAssertEqual(try encoder.encode(meshes: [mesh], generator: "test"), Data("glb".utf8))
        XCTAssertTrue(GLBAvailabilityNote.message.contains("M7a"))
        XCTAssertTrue(GLBAvailabilityNote.message.contains("GLB"))
    }

    func testGeneratedNormalPointsUp() {
        let positions = [Vec3(0, 0, 0), Vec3(0, 0, 1), Vec3(1, 0, 0)]
        let normals = MeshNormals.generate(positions: positions, indices: [0, 1, 2])
        XCTAssertEqual(normals[0].y, 1, accuracy: 1e-9)
        XCTAssertEqual(normals[0].x, 0, accuracy: 1e-9)
    }

    func testProgressLineAndETA() {
        XCTAssertEqual(ETAEstimate.remainingSeconds(elapsed: 10, fraction: 0.25) ?? -1, 30, accuracy: 1e-9)
        XCTAssertNil(ETAEstimate.remainingSeconds(elapsed: 10, fraction: 0))
        let line = ProgressLine.render(fraction: 0.42, stage: "meshGeneration", etaSeconds: 83)
        XCTAssertTrue(line.contains("42%"))
        XCTAssertTrue(line.contains("meshGeneration"))
        XCTAssertTrue(line.contains("ETA 01:23"))
        XCTAssertEqual(ProgressLine.formatETA(nil), "--:--")
        XCTAssertEqual(ProgressLine.formatETA(3661), "1:01:01")
    }
}

private struct FakeEncoder: GLBEncoding {
    func encode(meshes: [ExtractedMesh], generator: String) throws -> Data {
        XCTAssertEqual(generator, "test")
        XCTAssertEqual(meshes.count, 1)
        return Data("glb".utf8)
    }
}
