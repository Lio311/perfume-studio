import AVFoundation
import CoreVideo
import Foundation
import PackKit
import CaptureKit
import MeasureKit
import UIKit

#if DEBUG
struct ShareTrace: Identifiable {
    let id = UUID()
    let url: URL
}
#endif

struct PendingCapture: Identifiable {
    var id: UUID { photo.id }
    var image: UIImage
    var jpeg: Data
    var photo: CapturedPhoto
}

/// Owns the camera session and the PackKit distance pipeline. UI updates stay on the main queue.
final class CaptureModel: ObservableObject {
    /// M1 frame source. A later milestone can add another `CaptureFrameSource`
    /// without changing the distance pipeline. Object Capture is not implemented here.
    let capture = CardCaptureSession()

    @Published private(set) var guide: DistanceGuide.Output?
    @Published private(set) var source: DistanceSourceInfo?
    @Published private(set) var rawMm: Double?
    @Published private(set) var filteredMm: Double?
    @Published private(set) var sigmaMm: Double = 0
    @Published private(set) var framesPerSecond: Double = 0
    @Published private(set) var distanceUnavailable = true
    @Published private(set) var dimmed = false
    @Published private(set) var rejectedFrames = 0
    @Published private(set) var orientationLabel = VisionImageOrientation.backCameraPortrait.rawValue
    @Published var showDebug = false
    @Published private(set) var flash = false
    @Published private(set) var sessionFailed = false
    @Published private(set) var cameraDenied = false
    @Published var hapticTick = 0
    @Published var captureHaptic = 0
    @Published var pending: PendingCapture?
    #if DEBUG
    @Published var simulatedCentimetres = 20.0
    @Published var recordDistance = false
    @Published var shareItem: ShareTrace?
    #endif

    private var pipeline = DistancePipeline()
    private var frameRate = FrameRateMeter()
    private var scheduler = VisionFrameScheduler()
    private var hapticEnabled = true
    private var requestingAccess = false
    private var latestTilt: Double?
    private var captureAngle: CaptureAngle?
    private var capturing = false
    private var latestPixels: CVPixelBuffer?
    private var latestSnapshot: CaptureSnapshot?
    private let visionQueue = DispatchQueue(label: "com.perfumestudio.vision", qos: .userInitiated)
    #if DEBUG
    private var traceLines: [String] = []
    private var traceStart: TimeInterval?
    #endif
    #if DEBUG
    private var simulationTimer: Timer?
    #endif

    var cameraSupported: Bool { capture.isCameraSupported }
    var lidarSupported: Bool { capture.isLiDARSupported }

    var autoCaptureEnabled = false {
        didSet { pipeline.autoCaptureEnabled = autoCaptureEnabled }
    }

    init() {
        capture.onFrame = { [weak self] pixels, snapshot in
            self?.handle(pixels: pixels, snapshot: snapshot)
        }
        capture.onSessionFailed = { [weak self] in
            DispatchQueue.main.async {
                self?.sessionFailed = true
                self?.capturing = false
                self?.flash = false
            }
        }
    }

    /// Checks the camera permission explicitly. Requests it once when undetermined,
    /// and starts tracking only after it is granted. LiDAR is never required.
    func refreshCameraAccess() {
        guard capture.isCameraSupported else {
            cameraDenied = false
            return
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            cameraDenied = false
            sessionFailed = false
            capture.start()
        case .notDetermined:
            cameraDenied = false
            guard !requestingAccess else { return }
            requestingAccess = true
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.requestingAccess = false
                    self.cameraDenied = !granted
                    if granted {
                        self.sessionFailed = false
                        self.capture.start()
                    }
                }
            }
        case .denied, .restricted:
            cameraDenied = true
            capture.stop()
        @unknown default:
            cameraDenied = true
            capture.stop()
        }
    }

    func retry() {
        sessionFailed = false
        capturing = false
        flash = false
        capture.stop()
        refreshCameraAccess()
    }

    func stop() {
        capture.stop()
        #if DEBUG
        simulationTimer?.invalidate()
        simulationTimer = nil
        #endif
    }

    func setTarget(centimetres: Double) {
        pipeline.setTarget(mm: centimetres * 10)
    }

    func setHalfBand(centimetres: Double) {
        pipeline.setHalfBand(mm: centimetres * 10)
    }

    func setHapticEnabled(_ enabled: Bool) {
        hapticEnabled = enabled
    }

    func setCaptureAngle(_ angle: CaptureAngle?) {
        captureAngle = angle
    }

    func shutter(angle: CaptureAngle) {
        captureAngle = angle
        beginShutter()
    }

    func discardPending() {
        pending = nil
        capturing = false
    }

    #if DEBUG
    /// Drives the real filter, guide, and overlay when the camera is unavailable (Simulator).
    func startSimulationIfNeeded() {
        guard !capture.isCameraSupported, simulationTimer == nil else { return }
        let timer = Timer(timeInterval: 1.0 / 20.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.simulate(centimetres: self.simulatedCentimetres, time: ProcessInfo.processInfo.systemUptime)
        }
        RunLoop.main.add(timer, forMode: .common)
        simulationTimer = timer
    }

    /// Shutter stand-in for the Simulator: a bundled image, with the live distance reading attached.
    func fakeShutter(angle: CaptureAngle) {
        captureAngle = angle
        guard pending == nil, !capturing else { return }
        flash = true
        captureHaptic += 1
        let stamp = readingStamp()
        let built = FakeCaptureImage.make(
            angle: angle,
            stamp: stamp,
            hasLiDAR: lidarSupported
        )
        pending = built
        flash = false
    }
    #endif

    private func beginShutter() {
        guard let angle = captureAngle, pending == nil, !capturing else { return }
        #if DEBUG
        if !capture.isCameraSupported {
            fakeShutter(angle: angle)
            return
        }
        #endif
        flash = true
        captureHaptic += 1
        capturing = true
        let stamp = readingStamp()
        let hasLiDAR = lidarSupported
        capture.takeStill { [weak self] buffer, intrinsics, _ in
            let prepared = StillImageBuilder.prepare(buffer: buffer, intrinsics: intrinsics)
            DispatchQueue.main.async {
                guard let self else { return }
                self.capturing = false
                self.flash = false
                guard let prepared else { return }
                self.pending = StillImageBuilder.pending(
                    from: prepared,
                    angle: angle,
                    stamp: stamp,
                    hasLiDAR: hasLiDAR
                )
            }
        }
    }

    private func readingStamp() -> CaptureReadingStamp {
        let mapped: CaptureDistanceSource
        if distanceUnavailable {
            mapped = .none
        } else {
            switch source?.id {
            case CameraDistance.card.id: mapped = .card
            case CameraDistance.lidar.id: mapped = .lidar
            case CameraDistance.vio.id: mapped = .vio
            default: mapped = .none
            }
        }
        return CaptureReadingStamp(
            distanceMm: mapped == .none ? nil : filteredMm,
            source: mapped,
            sigmaMm: mapped == .none ? nil : sigmaMm,
            guide: mapped == .none ? nil : guide?.state,
            tiltDegrees: mapped == .none ? nil : latestTilt
        )
    }

    /// Called on the capture queue. `pixels` is already a copy, so the ARFrame is not retained.
    /// Vision runs off the main thread on the latest copy only; a stale result is dropped.
    private func handle(pixels: CVPixelBuffer, snapshot: CaptureSnapshot) {
        latestPixels = pixels
        latestSnapshot = snapshot
        _ = scheduler.arrived()
        let time = snapshot.time
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.framesPerSecond = self.frameRate.push(time: time)
        }
        pumpDetection()
    }

    private func pumpDetection() {
        guard let pixels = latestPixels, let snapshot = latestSnapshot else { return }
        let token = scheduler.latest
        guard scheduler.start(token) else { return }
        let orientation = VisionImageOrientation.backCameraPortrait
        visionQueue.async { [weak self] in
            let detection = CardDetector.detect(in: pixels, orientation: orientation)
            guard let self else { return }
            self.capture.queue.async {
                let fresh = self.scheduler.finish(token)
                if fresh {
                    let corners = detection?.corners
                    let confidence = detection?.confidence ?? 0
                    DispatchQueue.main.async {
                        self.consume(corners: corners, confidence: confidence, snapshot: snapshot, orientation: orientation)
                    }
                }
                self.pumpDetection()
            }
        }
    }

    private func consume(
        corners: [SIMD2<Double>]?,
        confidence: Double,
        snapshot: CaptureSnapshot,
        orientation: VisionImageOrientation
    ) {
        let frame = DistanceFrame(
            time: snapshot.time,
            corners: corners,
            confidence: confidence,
            intrinsics: snapshot.intrinsics,
            imageSize: PixelSize(width: Double(snapshot.imageWidth), height: Double(snapshot.imageHeight)),
            lidarMillimetres: snapshot.lidarMillimetres,
            vioMillimetres: snapshot.vioMillimetres,
            orientation: orientation
        )
        apply(pipeline.push(frame), recorded: frame)
    }

    #if DEBUG
    private func simulate(centimetres: Double, time: TimeInterval) {
        let frame = DistanceFrame(
            time: time,
            intrinsics: CameraIntrinsics(fx: 1500, fy: 1500, cx: 0, cy: 0),
            imageSize: PixelSize(width: 1, height: 1),
            forcedMeasurement: DistanceChooser.Choice(rawZMm: centimetres * 10, source: .card, tiltDegrees: 0)
        )
        apply(pipeline.push(frame), recorded: frame)
    }
    #endif

    private func apply(_ result: DistanceFrameResult, recorded frame: DistanceFrame) {
        #if DEBUG
        appendTrace(frame: frame, result: result)
        #else
        _ = frame
        #endif
        rejectedFrames = result.rejectedFrames
        orientationLabel = result.orientation.rawValue
        dimmed = result.dimmed
        guard !result.distanceUnavailable, let guide = result.guide else {
            clearReading()
            return
        }
        source = result.source
        rawMm = result.rawMillimetres
        filteredMm = result.filteredMillimetres
        sigmaMm = result.sigmaMillimetres
        latestTilt = result.tiltDegrees
        distanceUnavailable = false
        self.guide = guide
        if !result.dimmed, guide.enteredGreen, hapticEnabled {
            hapticTick += 1
        }
        if result.shouldAutoCapture {
            beginShutter()
        }
    }

    #if DEBUG
    func setRecording(_ on: Bool) {
        if on {
            recordDistance = true
            traceLines = [DistanceTrace.header]
            traceStart = nil
            shareItem = nil
        } else if recordDistance {
            recordDistance = false
            if traceLines.count > 1 {
                finishTrace()
            } else {
                traceLines = []
                traceStart = nil
            }
        }
    }

    private func appendTrace(frame: DistanceFrame, result: DistanceFrameResult) {
        guard recordDistance else { return }
        if traceStart == nil { traceStart = frame.time }
        traceLines.append(DistanceTrace.line(DistanceTraceRow(frame: frame, result: result)))
        if let traceStart, frame.time - traceStart >= 10 {
            recordDistance = false
            finishTrace()
        }
    }

    private func finishTrace() {
        let text = traceLines.joined(separator: "\n") + "\n"
        traceLines = []
        let started = traceStart
        traceStart = nil
        guard started != nil else { return }
        let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let stamp = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")
        let url = folder.appendingPathComponent("distance-\(stamp).csv")
        do {
            try text.write(to: url, atomically: true, encoding: .utf8)
            shareItem = ShareTrace(url: url)
        } catch {
            shareItem = nil
        }
    }
    #endif

    private func clearReading() {
        guide = nil
        source = nil
        rawMm = nil
        filteredMm = nil
        sigmaMm = 0
        latestTilt = nil
        distanceUnavailable = true
        dimmed = false
    }

    deinit {
        capture.onFrame = nil
        capture.stop()
        #if DEBUG
        simulationTimer?.invalidate()
        #endif
    }
}
