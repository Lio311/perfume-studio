import Foundation

/// One camera frame in `capturedImage` pixels (origin top-left, y down).
public struct DistanceFrame: Equatable, Sendable {
    public var time: TimeInterval
    public var corners: [SIMD2<Double>]?
    public var confidence: Double
    public var intrinsics: CameraIntrinsics
    public var imageSize: PixelSize
    public var lidarMillimetres: Double?
    public var vioMillimetres: Double?
    public var orientation: VisionImageOrientation
    public var reference: CardReference
    /// Simulator stand-in. Skips the pose solve and measures this choice directly.
    public var forcedMeasurement: DistanceChooser.Choice?

    public init(
        time: TimeInterval,
        corners: [SIMD2<Double>]? = nil,
        confidence: Double = 1,
        intrinsics: CameraIntrinsics,
        imageSize: PixelSize,
        lidarMillimetres: Double? = nil,
        vioMillimetres: Double? = nil,
        orientation: VisionImageOrientation = .backCameraPortrait,
        reference: CardReference = .id1,
        forcedMeasurement: DistanceChooser.Choice? = nil
    ) {
        self.time = time
        self.corners = corners
        self.confidence = confidence
        self.intrinsics = intrinsics
        self.imageSize = imageSize
        self.lidarMillimetres = lidarMillimetres
        self.vioMillimetres = vioMillimetres
        self.orientation = orientation
        self.reference = reference
        self.forcedMeasurement = forcedMeasurement
    }
}

/// What the guide should show after one frame, including a dimmed hold.
public struct DistanceFrameResult: Equatable, Sendable {
    public var reading: DistanceReading?
    public var dimmed: Bool
    public var rejectedReason: CardRejectReason?
    public var rejectedFrames: Int
    public var orientation: VisionImageOrientation
    public var attemptedRawMillimetres: Double?
    public var attemptedWidthOnlyMillimetres: Double?
    public var corners: [SIMD2<Double>]
    public var guide: DistanceGuide.Output?
    public var source: DistanceSourceInfo?
    public var sigmaMillimetres: Double
    public var showsApproximateBadge: Bool
    public var shouldAutoCapture: Bool
    public var distanceUnavailable: Bool
    public var tiltDegrees: Double?

    public var filteredMillimetres: Double? { reading?.filteredMm }
    public var rawMillimetres: Double? { attemptedRawMillimetres ?? reading?.rawMm }
}

/// Pose, rejection gates, filter, guide, and the 700 ms card hold.
public struct DistancePipeline {
    public var session: DistanceSession
    public private(set) var rejectedFrames = 0
    public private(set) var orientation: VisionImageOrientation = .backCameraPortrait
    private var chooser: DistanceSourceChooser
    private var memory: CardPoseMemory?
    private var acceptedArea: Double?
    private var lastReading: DistanceReading?
    private var lastTilt: Double?

    public init(
        targetMm: Double = 200,
        halfBandMm: Double = 5,
        hold: TimeInterval = DistanceTiming.lossHold,
        autoCaptureEnabled: Bool = false
    ) {
        session = DistanceSession(targetMm: targetMm, halfBandMm: halfBandMm, autoCaptureEnabled: autoCaptureEnabled)
        chooser = DistanceSourceChooser(grace: hold)
    }

    public var autoCaptureEnabled: Bool {
        get { session.autoCaptureEnabled }
        set { session.autoCaptureEnabled = newValue }
    }

    public var hold: TimeInterval {
        get { chooser.grace }
        set { chooser.grace = newValue }
    }

    public mutating func setTarget(mm: Double) { session.setTarget(mm: mm) }
    public mutating func setHalfBand(mm: Double) { session.setHalfBand(mm: mm) }

    public mutating func reset() {
        session.reset()
        chooser.reset()
        memory = nil
        acceptedArea = nil
        lastReading = nil
        lastTilt = nil
        rejectedFrames = 0
    }

    public mutating func push(_ frame: DistanceFrame) -> DistanceFrameResult {
        orientation = frame.orientation
        if let forced = frame.forcedMeasurement {
            let card = forced.source == .card ? forced : nil
            let decision = chooser.update(
                card: card,
                lidarMm: forced.source == .lidar ? forced.rawZMm : frame.lidarMillimetres,
                vioMm: forced.source == .vio ? forced.rawZMm : frame.vioMillimetres,
                time: frame.time
            )
            return commit(
                decision,
                frame: frame,
                reason: nil,
                corners: frame.corners ?? [],
                attemptedRaw: forced.rawZMm,
                attemptedWidth: nil,
                solvedMemory: nil,
                solvedArea: nil,
                tilt: forced.tiltDegrees
            )
        }

        let evaluation = evaluate(frame)
        if let reason = evaluation.reason, reason.countsAsRejection {
            rejectedFrames += 1
        }
        let decision = chooser.update(
            card: evaluation.card,
            lidarMm: frame.lidarMillimetres,
            vioMm: frame.vioMillimetres,
            time: frame.time
        )
        return commit(
            decision,
            frame: frame,
            reason: evaluation.reason,
            corners: evaluation.corners,
            attemptedRaw: evaluation.rawMillimetres,
            attemptedWidth: evaluation.widthOnlyMillimetres,
            solvedMemory: evaluation.memory,
            solvedArea: evaluation.area,
            tilt: evaluation.card?.tiltDegrees
        )
    }

    private struct Evaluation {
        var card: DistanceChooser.Choice?
        var reason: CardRejectReason?
        var corners: [SIMD2<Double>]
        var rawMillimetres: Double?
        var widthOnlyMillimetres: Double?
        var memory: CardPoseMemory?
        var area: Double?
    }

    private func evaluate(_ frame: DistanceFrame) -> Evaluation {
        guard let corners = frame.corners, corners.count == 4 else {
            return Evaluation(card: nil, reason: .missing, corners: [], rawMillimetres: nil, widthOnlyMillimetres: nil, memory: nil, area: nil)
        }
        if !frame.confidence.isFinite || frame.confidence < DistanceTiming.minimumConfidence {
            return Evaluation(card: nil, reason: .confidence, corners: corners, rawMillimetres: nil, widthOnlyMillimetres: nil, memory: nil, area: nil)
        }
        let ordered = CornerOrdering.alignments(corners, reference: frame.reference, previous: memory?.corners).first ?? corners
        let widthOnly = PoseMath.widthOnlyDepth(imagePoints: ordered, widthMm: frame.reference.widthMm, fx: frame.intrinsics.fx)
        if let aspect = QuadGeometry.metricAspect(ordered, intrinsics: frame.intrinsics),
           !QuadGeometry.aspectAcceptable(aspect, reference: frame.reference) {
            return Evaluation(card: nil, reason: .aspect, corners: ordered, rawMillimetres: nil, widthOnlyMillimetres: widthOnly, memory: nil, area: nil)
        }
        let area = QuadGeometry.area(ordered)
        if let acceptedArea, acceptedArea > 1, abs(area - acceptedArea) / acceptedArea > DistanceTiming.areaJump {
            return Evaluation(card: nil, reason: .area, corners: ordered, rawMillimetres: nil, widthOnlyMillimetres: widthOnly, memory: nil, area: nil)
        }
        let solved = CardPose.solve(
            imageCorners: corners,
            intrinsics: frame.intrinsics,
            reference: frame.reference,
            memory: memory,
            requireWidthAgreement: true
        )
        guard let estimate = solved.estimate else {
            return Evaluation(
                card: nil,
                reason: solved.failure ?? .pose,
                corners: solved.orderedCorners.isEmpty ? ordered : solved.orderedCorners,
                rawMillimetres: nil,
                widthOnlyMillimetres: solved.widthOnlyMillimetres ?? widthOnly,
                memory: nil,
                area: nil
            )
        }
        let choice = DistanceChooser.Choice(
            rawZMm: estimate.depthMm,
            source: .card,
            tiltDegrees: estimate.tiltDegrees
        )
        return Evaluation(
            card: choice,
            reason: nil,
            corners: solved.orderedCorners,
            rawMillimetres: estimate.depthMm,
            widthOnlyMillimetres: estimate.widthOnlyDepthMm,
            memory: solved.memory,
            area: QuadGeometry.area(solved.orderedCorners)
        )
    }

    private mutating func commit(
        _ decision: DistanceSourceChooser.Decision?,
        frame: DistanceFrame,
        reason: CardRejectReason?,
        corners: [SIMD2<Double>],
        attemptedRaw: Double?,
        attemptedWidth: Double?,
        solvedMemory: CardPoseMemory?,
        solvedArea: Double?,
        tilt: Double?
    ) -> DistanceFrameResult {
        switch decision {
        case let .measure(choice):
            let reading = session.update(
                rawZMm: choice.rawZMm,
                source: choice.source,
                tiltDegrees: choice.tiltDegrees,
                time: frame.time
            )
            if reading.accepted {
                lastReading = reading
                lastTilt = tilt
                if choice.source == .card {
                    if let solvedMemory { memory = solvedMemory }
                    if let solvedArea { acceptedArea = solvedArea }
                } else {
                    memory = nil
                    acceptedArea = nil
                }
            }
            return makeResult(
                reading: reading.accepted ? reading : lastReading,
                dimmed: false,
                reason: reading.accepted ? nil : reason,
                corners: corners,
                attemptedRaw: attemptedRaw ?? choice.rawZMm,
                attemptedWidth: attemptedWidth,
                unavailable: !reading.accepted && lastReading == nil,
                tilt: tilt
            )
        case .hold:
            return makeResult(
                reading: lastReading,
                dimmed: lastReading != nil,
                reason: reason,
                corners: corners,
                attemptedRaw: attemptedRaw,
                attemptedWidth: attemptedWidth,
                unavailable: lastReading == nil,
                tilt: tilt ?? lastTilt
            )
        case nil:
            lastReading = nil
            lastTilt = nil
            memory = nil
            acceptedArea = nil
            return makeResult(
                reading: nil,
                dimmed: false,
                reason: reason,
                corners: corners,
                attemptedRaw: attemptedRaw,
                attemptedWidth: attemptedWidth,
                unavailable: true,
                tilt: nil
            )
        }
    }

    private func makeResult(
        reading: DistanceReading?,
        dimmed: Bool,
        reason: CardRejectReason?,
        corners: [SIMD2<Double>],
        attemptedRaw: Double?,
        attemptedWidth: Double?,
        unavailable: Bool,
        tilt: Double?
    ) -> DistanceFrameResult {
        DistanceFrameResult(
            reading: reading,
            dimmed: dimmed && reading != nil,
            rejectedReason: reason,
            rejectedFrames: rejectedFrames,
            orientation: orientation,
            attemptedRawMillimetres: attemptedRaw,
            attemptedWidthOnlyMillimetres: attemptedWidth,
            corners: corners,
            guide: reading?.guide,
            source: reading?.source,
            sigmaMillimetres: reading?.sigmaMm ?? 0,
            showsApproximateBadge: reading?.showsApproximateBadge ?? false,
            shouldAutoCapture: (reading?.shouldAutoCapture ?? false) && !dimmed,
            distanceUnavailable: unavailable || reading == nil,
            tiltDegrees: tilt
        )
    }
}
