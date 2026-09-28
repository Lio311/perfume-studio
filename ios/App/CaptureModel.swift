import Foundation
import CoreVideo
import PackKit
import CaptureKit
import MeasureKit

/// Owns the camera session and the PackKit distance pipeline. UI updates stay on the main queue.
final class CaptureModel: ObservableObject {
    let capture = CardCaptureSession()

    @Published private(set) var guide: DistanceGuide.Output?
    @Published private(set) var source: DistanceSource?
    @Published private(set) var rawMm: Double?
    @Published private(set) var filteredMm: Double?
    @Published private(set) var sigmaMm: Double = 0
    @Published private(set) var framesPerSecond: Double = 0
    @Published var showDebug = false
    @Published private(set) var flash = false
    @Published private(set) var sessionFailed = false
    @Published var hapticTick = 0
    #if DEBUG
    @Published var simulatedCentimetres = 20.0
    #endif

    private var distance = DistanceSession()
    private var frameRate = FrameRateMeter()
    private var hapticEnabled = true
    #if DEBUG
    private var simulationTimer: Timer?
    #endif

    var cameraSupported: Bool { capture.isCameraSupported }
    var lidarSupported: Bool { capture.isLiDARSupported }

    var autoCaptureEnabled = false {
        didSet { distance.autoCaptureEnabled = autoCaptureEnabled }
    }

    init() {
        capture.onFrame = { [weak self] buffer, snapshot in
            let corners = CardDetector.detect(in: buffer)
            let pose = corners.flatMap {
                CardPose.estimate(imageCorners: $0, intrinsics: snapshot.intrinsics)
            }
            let choice = DistanceChooser.choose(
                cardDepthMm: pose?.depthMm,
                cardTiltDegrees: pose?.tiltDegrees,
                lidarMm: snapshot.lidarMillimetres,
                vioMm: snapshot.vioMillimetres
            )
            let time = snapshot.time
            DispatchQueue.main.async {
                self?.ingest(choice: choice, time: time)
            }
        }
        capture.onSessionFailed = { [weak self] in
            DispatchQueue.main.async { self?.sessionFailed = true }
        }
    }

    func start() {
        sessionFailed = false
        capture.start()
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

    func shutter() {
        flash = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { [weak self] in
            self?.flash = false
        }
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

    private func simulate(centimetres: Double, time: TimeInterval) {
        let choice = DistanceChooser.Choice(rawZMm: centimetres * 10, source: .card, tiltDegrees: 0)
        ingest(choice: choice, time: time)
    }
    #endif

    private func ingest(choice: DistanceChooser.Choice?, time: TimeInterval) {
        framesPerSecond = frameRate.push(time: time)
        guard let choice else { return }
        let reading = distance.update(
            rawZMm: choice.rawZMm,
            source: choice.source,
            tiltDegrees: choice.tiltDegrees,
            time: time
        )
        guard reading.accepted, let guide = reading.guide else { return }
        source = reading.source
        rawMm = reading.rawMm
        filteredMm = reading.filteredMm
        sigmaMm = reading.sigmaMm
        self.guide = guide
        if guide.enteredGreen, hapticEnabled {
            hapticTick += 1
        }
        if reading.shouldAutoCapture {
            shutter()
        }
    }

    #if DEBUG
    deinit { simulationTimer?.invalidate() }
    #endif
}
