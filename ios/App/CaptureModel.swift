import ARKit
import AVFoundation
import CoreVideo
import Foundation
import PackKit
import CaptureKit
import MeasureKit
import UIKit

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
    @Published var showDebug = false
    @Published private(set) var flash = false
    @Published private(set) var sessionFailed = false
    @Published private(set) var cameraDenied = false
    @Published var hapticTick = 0
    @Published var captureHaptic = 0
    @Published var pending: PendingCapture?
    #if DEBUG
    @Published var simulatedCentimetres = 20.0
    #endif

    private var distance = DistanceSession()
    private var frameRate = FrameRateMeter()
    private var chooser = DistanceSourceChooser()
    private var sampleHold = DistanceSampleHold()
    private var scheduler = VisionFrameScheduler()
    private var hapticEnabled = true
    private var requestingAccess = false
    private var latestTilt: Double?
    private var captureAngle: CaptureAngle?
    private var capturing = false
    private var frameSerial = 0
    private var nextSerial = 0
    private var readyFrames: [Int: (corners: [SIMD2<Double>]?, snapshot: CaptureSnapshot)] = [:]
    private let visionQueue = DispatchQueue(label: "com.perfumestudio.vision", qos: .userInitiated)
    private let assembleQueue = DispatchQueue(label: "com.perfumestudio.assemble")
    #if DEBUG
    private var simulationTimer: Timer?
    #endif

    var cameraSupported: Bool { capture.isCameraSupported }
    var lidarSupported: Bool { capture.isLiDARSupported }

    var autoCaptureEnabled = false {
        didSet { distance.autoCaptureEnabled = autoCaptureEnabled }
    }

    init() {
        capture.onFrame = { [weak self] frame, snapshot in
            self?.handle(frame: frame, snapshot: snapshot)
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
        distance.setTarget(mm: centimetres * 10)
    }

    func setHalfBand(centimetres: Double) {
        distance.setHalfBand(mm: centimetres * 10)
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

    /// Called on the capture queue. Detection runs off that queue; frames that arrive
    /// while it is in flight are not detected. Slow detections also skip the next frame.
    private func handle(frame: ARFrame, snapshot: CaptureSnapshot) {
        let serial = frameSerial
        frameSerial += 1
        if scheduler.shouldDetect() {
            let held = frame
            visionQueue.async { [weak self] in
                guard let self else { return }
                let started = CACurrentMediaTime()
                let corners = CardDetector.detect(in: held.capturedImage)
                let elapsed = CACurrentMediaTime() - started
                self.capture.queue.async {
                    self.scheduler.detectionFinished(elapsed: elapsed)
                }
                self.enqueue(serial: serial, corners: corners, snapshot: snapshot)
            }
        } else {
            enqueue(serial: serial, corners: nil, snapshot: snapshot)
        }
    }

    private func enqueue(serial: Int, corners: [SIMD2<Double>]?, snapshot: CaptureSnapshot) {
        assembleQueue.async { [weak self] in
            guard let self else { return }
            self.readyFrames[serial] = (corners, snapshot)
            while let item = self.readyFrames.removeValue(forKey: self.nextSerial) {
                let corners = item.corners
                let snapshot = item.snapshot
                self.nextSerial += 1
                DispatchQueue.main.async { [weak self] in
                    self?.consume(corners: corners, snapshot: snapshot)
                }
            }
        }
    }

    private func consume(corners: [SIMD2<Double>]?, snapshot: CaptureSnapshot) {
        let pose = corners.flatMap {
            CardPose.estimate(imageCorners: $0, intrinsics: snapshot.intrinsics)
        }
        let choice = chooser.update(
            cardDepthMm: pose?.depthMm,
            cardTiltDegrees: pose?.tiltDegrees,
            lidarMm: snapshot.lidarMillimetres,
            vioMm: snapshot.vioMillimetres,
            time: snapshot.time
        )
        ingest(choice: choice, time: snapshot.time)
    }

    #if DEBUG
    private func simulate(centimetres: Double, time: TimeInterval) {
        let choice = DistanceChooser.Choice(rawZMm: centimetres * 10, source: .card, tiltDegrees: 0)
        ingest(choice: choice, time: time)
    }
    #endif

    private func ingest(choice: DistanceChooser.Choice?, time: TimeInterval) {
        framesPerSecond = frameRate.push(time: time)
        let reading: DistanceReading?
        if let choice {
            let update = distance.update(
                rawZMm: choice.rawZMm,
                source: choice.source,
                tiltDegrees: choice.tiltDegrees,
                time: time
            )
            reading = update.accepted ? update : nil
        } else {
            reading = nil
        }
        let fresh = sampleHold.update(hasSample: reading != nil, time: time)
        guard fresh, let reading, let guide = reading.guide else {
            if !fresh { clearReading() }
            return
        }
        source = reading.source
        rawMm = reading.rawMm
        filteredMm = reading.filteredMm
        sigmaMm = reading.sigmaMm
        latestTilt = choice?.tiltDegrees
        distanceUnavailable = false
        self.guide = guide
        if guide.enteredGreen, hapticEnabled {
            hapticTick += 1
        }
        if reading.shouldAutoCapture {
            beginShutter()
        }
    }

    private func clearReading() {
        guide = nil
        source = nil
        rawMm = nil
        filteredMm = nil
        sigmaMm = 0
        latestTilt = nil
        distanceUnavailable = true
    }

    deinit {
        capture.onFrame = nil
        capture.stop()
        #if DEBUG
        simulationTimer?.invalidate()
        #endif
    }
}
