import Foundation
import ReconstructCore

#if os(macOS)
import ImageIO

enum CommandDriver {
    static func run(_ options: ReconstructOptions) async -> Int32 {
        let scan = ImageFolderScan.scan(directory: options.imagesFolder, isReadable: imageIsReadable)
        if scan.directoryUnreadable {
            return fail(ImageRules.directoryMissing())
        }
        if let failure = ImageRules.failure(
            readableCount: scan.readable.count,
            unreadableNames: scan.unreadable.map(\.lastPathComponent)
        ) {
            return fail(failure)
        }

        var warnings = ImageRules.warnings(readableCount: scan.readable.count)
        warnings.forEach(emit)

        var capture: CaptureManifest?
        let captureURL = options.imagesFolder.appendingPathComponent("capture.json")
        if FileManager.default.fileExists(atPath: captureURL.path) {
            do {
                let data = try Data(contentsOf: captureURL)
                switch CaptureManifestDecoder.decode(data) {
                case .success(let decoded):
                    capture = decoded.manifest
                    warnings.append(contentsOf: decoded.warnings)
                    decoded.warnings.forEach(emit)
                case .failure(let error):
                    return fail(error.message)
                }
            } catch {
                return fail(bilingual(
                    "שגיאה: לא ניתן לקרוא את capture.json.",
                    "Error: Could not read capture.json."
                ) + "\n" + error.localizedDescription)
            }
        }

        let plan = ReferenceResolver.resolve(
            cliHeight: options.heightMm,
            cliWidth: options.widthMm,
            useCard: options.useCard,
            capture: capture
        )
        if case .missing = plan {
            return fail(ReferenceResolver.missingMessage)
        }
        if case .card(let fallback) = plan, fallback == nil, !macOS14OrNewer() {
            return fail(bilingual(
                "שגיאה: --card ב-macOS 13 דורש מידת גיבוי (--height-mm, --width-mm, או מידות ב-capture.json).",
                "Error: --card on macOS 13 needs a fallback dimension (--height-mm, --width-mm, or capture.json dimensions)."
            ))
        }

        let name = ModelName.resolve(
            flag: options.name,
            partId: capture?.partId,
            folderName: options.imagesFolder.lastPathComponent
        )
        let files = OutputFiles.files(name: name)
        do {
            try FileManager.default.createDirectory(at: options.outputDirectory, withIntermediateDirectories: true)
        } catch {
            return fail(bilingual(
                "שגיאה: לא ניתן ליצור את תיקיית הפלט.",
                "Error: Could not create the output directory."
            ) + "\n" + error.localizedDescription)
        }

        let rawURL = options.outputDirectory.appendingPathComponent(files.usdz)
        let started = Date()
        var printer = ProgressPrinter()
        let outcome: SessionOutcome
        do {
            outcome = try await SessionRunner.reconstruct(
                folder: options.imagesFolder,
                rawURL: rawURL,
                detail: options.detail,
                masking: options.masking,
                ordering: options.ordering,
                sensitivity: options.featureSensitivity,
                requestPoses: options.useCard,
                manifest: capture ?? CaptureManifest(),
                onProgress: { fraction, stage, eta in
                    printer.update(fraction: fraction, stage: stage, eta: eta)
                }
            )
        } catch {
            printer.finish()
            return fail(bilingual(
                "שגיאה: PhotogrammetrySession נכשל.",
                "Error: PhotogrammetrySession failed."
            ) + "\n" + error.localizedDescription)
        }
        printer.finish()

        if outcome.cancelled {
            emit(bilingual("בוטל.", "Cancelled."))
            return 130
        }
        if let message = outcome.errorMessage {
            return fail(message)
        }
        guard let modelURL = outcome.modelURL else {
            return fail(bilingual(
                "שגיאה: PhotogrammetrySession לא החזיר קובץ מודל.",
                "Error: PhotogrammetrySession did not return a model file."
            ))
        }
        warnings.append(contentsOf: outcome.warnings)
        outcome.warnings.forEach(emit)

        let cardFactor: Double? = options.useCard ? CardObservationBuilder.scale(views: outcome.poseViews) : nil
        let loaded: [LoadedMesh]
        do {
            loaded = try ModelExport.load(usdz: modelURL)
        } catch ModelExportError.message(let message) {
            return fail(message)
        } catch {
            return fail(bilingual(
                "שגיאה: קריאת ה-USDZ נכשלה.",
                "Error: Reading the USDZ failed."
            ) + "\n" + error.localizedDescription)
        }

        let meshes = loaded.map(\.mesh)
        guard let before = MeshPositions.bounds(of: meshes) else {
            return fail(bilingual(
                "שגיאה: לא נמצאה גאומטריה ב-USDZ.",
                "Error: The USDZ file has no triangle geometry."
            ))
        }
        guard let solution = ScaleSolve.solve(bounds: before, plan: plan, cardMillimetresPerUnit: cardFactor) else {
            if case .card = plan {
                return fail(ReferenceResolver.missingMessage + "\n" + bilingual(
                    "הקובץ הגולמי נשאר ב-\(modelURL.path).",
                    "The raw file was left at \(modelURL.path)."
                ))
            }
            return fail(bilingual(
                "שגיאה: לא ניתן לחשב קנה מידה. תיבת הגבול שטוחה על הציר שנבחר.",
                "Error: Cannot compute a scale factor. The bounding box is flat on the chosen axis."
            ))
        }
        warnings.append(contentsOf: solution.warnings)
        solution.warnings.forEach(emit)

        let scaledMeshes = MeshPositions.applying(solution.similarity, to: meshes)
        let scaledLoaded = zip(loaded, scaledMeshes).map { original, mesh in
            LoadedMesh(mesh: mesh, material: original.material)
        }
        let after = BoundingBox(
            min: solution.similarity.apply(before.min),
            max: solution.similarity.apply(before.max)
        )
        let dimensionWarnings = DimensionCheck.warnings(
            after: after,
            captureHeight: capture?.heightMm,
            captureWidth: capture?.widthMm,
            captureDepth: capture?.depthMm,
            scaledAxis: solution.scaledAxis
        )
        warnings.append(contentsOf: dimensionWarnings)
        dimensionWarnings.forEach(emit)

        let scaledURL = options.outputDirectory.appendingPathComponent(files.scaledUsdz)
        let objURL = options.outputDirectory.appendingPathComponent(files.obj)
        do {
            try ModelExport.write(scaledLoaded, usdz: scaledURL, obj: objURL)
        } catch ModelExportError.message(let message) {
            return fail(message)
        } catch {
            return fail(bilingual(
                "שגיאה: ייצוא המודל המכויל נכשל.",
                "Error: Exporting the scaled model failed."
            ) + "\n" + error.localizedDescription)
        }

        var glbName: String?
        #if PACKKIT_GLB
        do {
            let data = try PackKitGLBEncoder().encode(meshes: scaledMeshes, generator: "perfume-studio-reconstruct")
            let glbURL = options.outputDirectory.appendingPathComponent(files.glb)
            try data.write(to: glbURL)
            glbName = files.glb
        } catch {
            let message = bilingual(
                "אזהרה: כתיבת GLB נכשלה.",
                "Warning: Writing the GLB failed."
            ) + "\n" + error.localizedDescription
            warnings.append(message)
            emit(message)
        }
        #else
        warnings.append(GLBAvailabilityNote.message)
        emit(GLBAvailabilityNote.message)
        #endif

        let report = ReconstructionReport(
            name: name,
            detail: options.detail.rawValue,
            imageCount: scan.readable.count,
            durationSeconds: Date().timeIntervalSince(started),
            scaleFactor: solution.factor,
            reference: solution.reference,
            boundingBoxMmBefore: ReportBox(bounds: before),
            boundingBoxMmAfter: ReportBox(bounds: after),
            warnings: warnings,
            outputs: ReportOutputs(usdz: files.usdz, scaledUsdz: files.scaledUsdz, obj: files.obj, glb: glbName)
        )
        let reportURL = options.outputDirectory.appendingPathComponent(files.report)
        do {
            try ReportCodec.encode(report).write(to: reportURL)
        } catch {
            return fail(bilingual(
                "שגיאה: כתיבת report.json נכשלה.",
                "Error: Writing report.json failed."
            ) + "\n" + error.localizedDescription)
        }

        let summary = """
        נכתב \(files.usdz)
        נכתב \(files.scaledUsdz)
        נכתב \(files.obj)
        נכתב \(files.report)
        Wrote \(rawURL.path)
        Wrote \(scaledURL.path)
        Wrote \(objURL.path)
        Wrote \(reportURL.path)
        """
        print(summary)
        return 0
    }
}

private struct ProgressPrinter {
    private var lastCount = 0

    mutating func update(fraction: Double, stage: String, eta: Double?) {
        let line = ProgressLine.render(fraction: fraction, stage: stage, etaSeconds: eta)
        let width = max(lastCount, line.count)
        let padded = line.padding(toLength: width, withPad: " ", startingAt: 0)
        FileHandle.standardError.write(Data(("\r" + padded).utf8))
        lastCount = line.count
    }

    func finish() {
        if lastCount > 0 {
            FileHandle.standardError.write(Data("\n".utf8))
        }
    }
}

private func imageIsReadable(_ url: URL) -> Bool {
    let values = try? url.resourceValues(forKeys: [.fileSizeKey])
    if let size = values?.fileSize, size <= 0 { return false }
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return false }
    return CGImageSourceGetCount(source) > 0
}

private func macOS14OrNewer() -> Bool {
    if #available(macOS 14.0, *) {
        return true
    }
    return false
}

private func emit(_ message: String) {
    FileHandle.standardError.write(Data((message + "\n").utf8))
}

private func fail(_ message: String) -> Int32 {
    emit(message)
    return 1
}

private func bilingual(_ he: String, _ en: String) -> String {
    he + "\n" + en
}
#endif
