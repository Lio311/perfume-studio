import Foundation

/// One accepted (or explicitly rejected) update of the distance pipeline.
public struct DistanceReading: Equatable, Sendable {
    public var accepted: Bool
    public var source: DistanceSourceInfo
    public var rawMm: Double
    public var filteredMm: Double?
    public var guide: DistanceGuide.Output?
    public var shouldAutoCapture: Bool
    public var sigmaMm: Double
    public var showsApproximateBadge: Bool

    public init(
        accepted: Bool,
        source: DistanceSourceInfo,
        rawMm: Double,
        filteredMm: Double?,
        guide: DistanceGuide.Output?,
        shouldAutoCapture: Bool,
        sigmaMm: Double,
        showsApproximateBadge: Bool
    ) {
        self.accepted = accepted
        self.source = source
        self.rawMm = rawMm
        self.filteredMm = filteredMm
        self.guide = guide
        self.shouldAutoCapture = shouldAutoCapture
        self.sigmaMm = sigmaMm
        self.showsApproximateBadge = showsApproximateBadge
    }
}

/// Calibration, then the median/EMA filter, the guide, and the auto-capture gate.
public struct DistanceSession {
    public var calibration: DistanceCalibration
    public var guide: DistanceGuide
    public var autoCaptureEnabled: Bool
    public private(set) var filter = DistanceFilter()
    public private(set) var gate = AutoCaptureGate()
    public private(set) var spread = DistanceSpread()

    public init(
        calibration: DistanceCalibration = .identity,
        targetMm: Double = 200,
        halfBandMm: Double = 5,
        autoCaptureEnabled: Bool = false
    ) {
        self.calibration = calibration
        self.guide = DistanceGuide(targetMm: targetMm, halfBandMm: halfBandMm)
        self.autoCaptureEnabled = autoCaptureEnabled
    }

    public mutating func reset() {
        filter.reset()
        guide.reset()
        gate.reset()
        spread.reset()
    }

    public mutating func setTarget(mm: Double) {
        guard mm != guide.targetMm else { return }
        guide.targetMm = mm
        guide.reset()
        gate.reset()
    }

    public mutating func setHalfBand(mm: Double) {
        guard mm != guide.halfBandMm else { return }
        guide.halfBandMm = mm
        guide.reset()
        gate.reset()
    }

    public mutating func update(
        rawZMm: Double,
        source: some DistanceSource,
        tiltDegrees: Double,
        time: TimeInterval
    ) -> DistanceReading {
        let info = DistanceSourceInfo(source)
        let rejected = DistanceReading(
            accepted: false,
            source: info,
            rawMm: rawZMm,
            filteredMm: filter.value,
            guide: nil,
            shouldAutoCapture: false,
            sigmaMm: 0,
            showsApproximateBadge: false
        )
        guard source.accepts(rawZMm: rawZMm) else { return rejected }
        let calibrated = calibration.apply(to: rawZMm)
        guard calibrated.isFinite, calibrated > 0 else { return rejected }
        guard let filtered = filter.push(zMm: calibrated, time: time, source: source) else { return rejected }
        if filtered.didReset {
            guide.reset()
            gate.reset()
        }
        let output = guide.update(zMm: filtered.millimetres)
        let sigma = spread.push(filtered.millimetres, time: time)
        let fire = gate.update(
            isGreen: output.state == .green,
            source: source,
            tiltDegrees: tiltDegrees,
            zMm: rawZMm,
            time: time,
            enabled: autoCaptureEnabled
        )
        return DistanceReading(
            accepted: true,
            source: info,
            rawMm: rawZMm,
            filteredMm: filtered.millimetres,
            guide: output,
            shouldAutoCapture: fire,
            sigmaMm: sigma,
            showsApproximateBadge: source.isApproximate
        )
    }
}
