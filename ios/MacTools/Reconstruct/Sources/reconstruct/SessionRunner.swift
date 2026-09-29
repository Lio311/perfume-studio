import Foundation
import ReconstructCore

#if os(macOS)
import CoreGraphics
import ImageIO
import RealityKit
import simd

struct SessionOutcome {
    var modelURL: URL?
    var cancelled: Bool
    var errorMessage: String?
    var warnings: [String]
    var poseViews: [CardView]
}

enum SessionRunner {
    static func reconstruct(
        folder: URL,
        rawURL: URL,
        detail: DetailLevel,
        masking: Bool,
        ordering: SampleOrder,
        sensitivity: FeatureSensitivityLevel,
        requestPoses: Bool,
        manifest: CaptureManifest,
        onProgress: @escaping (Double, String, Double?) -> Void
    ) async throws -> SessionOutcome {
        var configuration = PhotogrammetrySession.Configuration()
        configuration.isObjectMaskingEnabled = masking
        configuration.sampleOrdering = ordering == .sequential ? .sequential : .unordered
        configuration.featureSensitivity = sensitivity == .high ? .high : .normal
        let session = try PhotogrammetrySession(input: folder, configuration: configuration)

        let monitor = InterruptMonitor()
        monitor.install { session.cancel() }
        defer { monitor.stop() }

        var requests: [PhotogrammetrySession.Request] = [
            .modelFile(url: rawURL, detail: sessionDetail(detail), geometry: nil),
        ]
        if requestPoses, #available(macOS 14.0, *) {
            requests.append(.poses)
        }
        try session.process(requests: requests)

        let started = Date()
        var fraction = 0.0
        var stage = "processing"
        var knownETA: Double?
        var outcome = SessionOutcome(modelURL: nil, cancelled: false, errorMessage: nil, warnings: [], poseViews: [])

        for try await output in session.outputs {
            switch output {
            case .requestProgress(let request, let fractionComplete):
                guard isModelFile(request) else { continue }
                fraction = fractionComplete
                let eta = knownETA ?? ETAEstimate.remainingSeconds(
                    elapsed: Date().timeIntervalSince(started),
                    fraction: fractionComplete
                )
                onProgress(fractionComplete, stage, eta)
            case .requestComplete(_, let result):
                if case .modelFile(let url) = result {
                    outcome.modelURL = url
                } else if #available(macOS 14.0, *) {
                    let views = poseViews(from: result, manifest: manifest)
                    if !views.isEmpty {
                        outcome.poseViews = views
                    }
                }
            case .requestError(let request, let error):
                guard isModelFile(request) else { continue }
                outcome.errorMessage = bilingual(
                    "שגיאה: PhotogrammetrySession נכשל בבקשת המודל.",
                    "Error: PhotogrammetrySession failed the model request."
                ) + "\n" + error.localizedDescription
            case .processingCancelled:
                outcome.cancelled = true
            case .processingComplete:
                return outcome
            case .invalidSample(let id, let reason):
                outcome.warnings.append(bilingual(
                    "אזהרה: דגימה \(id) לא תקינה: \(reason)",
                    "Warning: Sample \(id) is invalid: \(reason)"
                ))
            case .skippedSample(let id):
                outcome.warnings.append(bilingual(
                    "אזהרה: דגימה \(id) דולגה.",
                    "Warning: Sample \(id) was skipped."
                ))
            case .automaticDownsampling:
                outcome.warnings.append(bilingual(
                    "אזהרה: התמונות הוקטנו אוטומטית בגלל מגבלת זיכרון.",
                    "Warning: Images were automatically downsampled because of memory limits."
                ))
            case .stitchingIncomplete:
                outcome.warnings.append(bilingual(
                    "אזהרה: התפירה לא הושלמה. ייתכן שחסרות זוויות בצילום.",
                    "Warning: Stitching is incomplete. The photo orbit may be missing angles."
                ))
            case .inputComplete:
                stage = "inputComplete"
                onProgress(fraction, stage, knownETA)
            default:
                if #available(macOS 14.0, *) {
                    if let update = progressUpdate(output) {
                        stage = update.stage
                        if let eta = update.eta {
                            knownETA = eta
                        }
                        onProgress(fraction, stage, knownETA ?? ETAEstimate.remainingSeconds(
                            elapsed: Date().timeIntervalSince(started),
                            fraction: fraction
                        ))
                    }
                }
            }
        }
        if outcome.cancelled {
            return outcome
        }
        if outcome.errorMessage == nil && outcome.modelURL == nil {
            outcome.errorMessage = bilingual(
                "שגיאה: PhotogrammetrySession הסתיים בלי מודל.",
                "Error: PhotogrammetrySession ended without a model."
            )
        }
        return outcome
    }

    private static func sessionDetail(_ detail: DetailLevel) -> PhotogrammetrySession.Request.Detail {
        switch detail {
        case .preview: return .preview
        case .reduced: return .reduced
        case .medium: return .medium
        case .full: return .full
        case .raw: return .raw
        }
    }

    private static func isModelFile(_ request: PhotogrammetrySession.Request) -> Bool {
        if case .modelFile = request { return true }
        return false
    }
}

@available(macOS 14.0, *)
private func progressUpdate(_ output: PhotogrammetrySession.Output) -> (stage: String, eta: TimeInterval?)? {
    guard case .requestProgressInfo(_, let info) = output else { return nil }
    let stage = info.processingStage.map(stageName) ?? "processing"
    return (stage, info.estimatedRemainingTime)
}

@available(macOS 14.0, *)
private func stageName(_ stage: PhotogrammetrySession.Output.ProcessingStage) -> String {
    switch stage {
    case .preProcessing: return "preProcessing"
    case .imageAlignment: return "imageAlignment"
    case .pointCloudGeneration: return "pointCloudGeneration"
    case .meshGeneration: return "meshGeneration"
    case .textureMapping: return "textureMapping"
    case .optimization: return "optimization"
    @unknown default: return "processing"
    }
}

@available(macOS 14.0, *)
private func poseViews(from result: PhotogrammetrySession.Result, manifest: CaptureManifest) -> [CardView] {
    guard case .poses(let poses) = result else { return [] }
    var views: [CardView] = []
    for (sampleID, pose) in poses.posesBySample {
        guard let url = poses.urlsBySample[sampleID] else { continue }
        guard let photo = matchingPhoto(manifest: manifest, url: url) else { continue }
        guard photo.cardCorners.count == 4 else { continue }
        let size = imagePixelSize(url)
        guard let pixels = CardCornerResolver.pixelCorners(
            photo.cardCorners,
            imageWidth: photo.imageWidth ?? size?.width,
            imageHeight: photo.imageHeight ?? size?.height
        ) else { continue }
        guard let intrinsics = intrinsics(from: pose) ?? photo.intrinsics else { continue }
        views.append(CardView(
            fileName: url.lastPathComponent,
            corners: pixels,
            intrinsics: intrinsics,
            cameraToWorld: mat4(pose.transform.matrix)
        ))
    }
    return views
}

@available(macOS 14.0, *)
private func intrinsics(from pose: PhotogrammetrySession.Pose) -> PinholeIntrinsics? {
    guard let matrix = pose.intrinsics else { return nil }
    let fx = Double(matrix.columns.0.x)
    let fy = Double(matrix.columns.1.y)
    let cx = Double(matrix.columns.2.x)
    let cy = Double(matrix.columns.2.y)
    guard fx > 1, fy > 1, cx.isFinite, cy.isFinite else { return nil }
    return PinholeIntrinsics(fx: fx, fy: fy, cx: cx, cy: cy)
}

private func matchingPhoto(manifest: CaptureManifest, url: URL) -> CapturePhoto? {
    let file = url.lastPathComponent
    return manifest.photos.first { photo in
        guard let name = photo.file else { return false }
        let leaf = URL(fileURLWithPath: name).lastPathComponent
        return leaf.caseInsensitiveCompare(file) == .orderedSame
    }
}

private func imagePixelSize(_ url: URL) -> (width: Double, height: Double)? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    else { return nil }
    guard let width = number(properties[kCGImagePropertyPixelWidth]),
          let height = number(properties[kCGImagePropertyPixelHeight]),
          width > 1, height > 1 else { return nil }
    return (width, height)
}

private func number(_ raw: Any?) -> Double? {
    if let value = raw as? Double { return value }
    if let value = raw as? Int { return Double(value) }
    if let value = raw as? NSNumber { return value.doubleValue }
    return nil
}

private func mat4(_ matrix: simd_float4x4) -> Mat4 {
    Mat4(m: [
        Double(matrix.columns.0.x), Double(matrix.columns.0.y), Double(matrix.columns.0.z), Double(matrix.columns.0.w),
        Double(matrix.columns.1.x), Double(matrix.columns.1.y), Double(matrix.columns.1.z), Double(matrix.columns.1.w),
        Double(matrix.columns.2.x), Double(matrix.columns.2.y), Double(matrix.columns.2.z), Double(matrix.columns.2.w),
        Double(matrix.columns.3.x), Double(matrix.columns.3.y), Double(matrix.columns.3.z), Double(matrix.columns.3.w),
    ])
}

private final class InterruptMonitor {
    private var source: DispatchSourceSignal?

    func install(cancel: @escaping () -> Void) {
        signal(SIGINT, SIG_IGN)
        let source = DispatchSource.makeSignalSource(signal: SIGINT, queue: .global())
        source.setEventHandler(handler: cancel)
        source.resume()
        self.source = source
    }

    func stop() {
        source?.cancel()
        source = nil
    }
}

private func bilingual(_ he: String, _ en: String) -> String {
    he + "\n" + en
}
#endif
