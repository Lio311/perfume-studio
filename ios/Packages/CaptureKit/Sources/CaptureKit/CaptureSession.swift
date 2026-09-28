import ARKit
import AVFoundation
import CoreVideo
import simd
import PackKit

/// One camera frame reduced to the numbers the distance pipeline needs.
/// The pixel buffer is not retained: the handler must finish with it before returning.
public struct CaptureSnapshot: Sendable {
    public var time: TimeInterval
    public var intrinsics: CameraIntrinsics
    public var imageWidth: Int
    public var imageHeight: Int
    public var lidarMillimetres: Double?
    public var vioMillimetres: Double?

    public init(
        time: TimeInterval,
        intrinsics: CameraIntrinsics,
        imageWidth: Int,
        imageHeight: Int,
        lidarMillimetres: Double?,
        vioMillimetres: Double?
    ) {
        self.time = time
        self.intrinsics = intrinsics
        self.imageWidth = imageWidth
        self.imageHeight = imageHeight
        self.lidarMillimetres = lidarMillimetres
        self.vioMillimetres = vioMillimetres
    }
}

/// World tracking on the wide camera. LiDAR is optional and is never required to start.
/// Frames are delivered on a background queue, at the camera rate (60 fps on device, so ≥ 20).
public final class CardCaptureSession: NSObject, ARSessionDelegate {
    public let arSession = ARSession()
    public let queue = DispatchQueue(label: "com.perfumestudio.capture", qos: .userInteractive)

    /// Called on `queue`. `pixelBuffer` is `capturedImage` and is only valid for this call.
    public var onFrame: ((CVPixelBuffer, CaptureSnapshot) -> Void)?
    public var onSessionFailed: (() -> Void)?

    public var isCameraSupported: Bool { ARWorldTrackingConfiguration.isSupported }

    /// True only when smoothed scene depth exists. Non-Pro iPhones return false; that is not an error.
    public var isLiDARSupported: Bool {
        ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth)
    }

    private var running = false

    public override init() {
        super.init()
    }

    /// Pins the wide camera so ARKit does not swap to the ultra-wide macro camera.
    public func start() {
        guard isCameraSupported, !running else { return }
        let configuration = ARWorldTrackingConfiguration()
        configuration.planeDetection = [.horizontal, .vertical]
        configuration.environmentTexturing = .none
        if let format = Self.wideVideoFormat() {
            configuration.videoFormat = format
        }
        if isLiDARSupported {
            var semantics = configuration.frameSemantics
            semantics.insert(.smoothedSceneDepth)
            configuration.frameSemantics = semantics
        }
        claimDelegate()
        running = true
        arSession.run(configuration, options: [.resetTracking, .removeExistingAnchors])
    }

    public func stop() {
        running = false
        arSession.pause()
    }

    /// Keeps this object as the session delegate after an `ARSCNView` takes the session.
    public func attach(_ view: ARSCNView) {
        if view.session !== arSession {
            view.session = arSession
        }
        view.automaticallyUpdatesLighting = false
        claimDelegate()
    }

    public func session(_ session: ARSession, didUpdate frame: ARFrame) {
        let buffer = frame.capturedImage
        let snapshot = Self.snapshot(from: frame, session: session)
        onFrame?(buffer, snapshot)
    }

    public func session(_ session: ARSession, didFailWithError error: Error) {
        running = false
        onSessionFailed?()
    }

    private func claimDelegate() {
        arSession.delegateQueue = queue
        arSession.delegate = self
    }

    /// Highest-resolution wide-camera format at 30 fps or faster. Never the ultra-wide.
    static func wideVideoFormat() -> ARConfiguration.VideoFormat? {
        let formats = ARWorldTrackingConfiguration.supportedVideoFormats
        let wide = formats.filter { $0.captureDeviceType == .builtInWideAngleCamera }
        let fast = wide.filter { $0.framesPerSecond >= 30 }
        let pool = fast.isEmpty ? (wide.isEmpty ? formats : wide) : fast
        return pool.max { lhs, rhs in
            let left = lhs.imageResolution.width * lhs.imageResolution.height
            let right = rhs.imageResolution.width * rhs.imageResolution.height
            if left == right { return lhs.framesPerSecond < rhs.framesPerSecond }
            return left < right
        }
    }

    static func snapshot(from frame: ARFrame, session: ARSession) -> CaptureSnapshot {
        let buffer = frame.capturedImage
        let bufferWidth = CVPixelBufferGetWidth(buffer)
        let bufferHeight = CVPixelBufferGetHeight(buffer)
        var intrinsics = intrinsics(of: frame.camera)
        let cameraSize = frame.camera.imageResolution
        if cameraSize.width != CGFloat(bufferWidth) || cameraSize.height != CGFloat(bufferHeight) {
            intrinsics = intrinsics.scaled(
                from: PixelSize(width: Double(cameraSize.width), height: Double(cameraSize.height)),
                to: PixelSize(width: Double(bufferWidth), height: Double(bufferHeight))
            )
        }
        return CaptureSnapshot(
            time: frame.timestamp,
            intrinsics: intrinsics,
            imageWidth: bufferWidth,
            imageHeight: bufferHeight,
            lidarMillimetres: lidarMillimetres(frame),
            vioMillimetres: vioMillimetres(session: session, frame: frame)
        )
    }

    private static func intrinsics(of camera: ARCamera) -> CameraIntrinsics {
        let matrix = camera.intrinsics
        return CameraIntrinsics(
            fx: Double(matrix.columns.0.x),
            fy: Double(matrix.columns.1.y),
            cx: Double(matrix.columns.2.x),
            cy: Double(matrix.columns.2.y)
        )
    }

    /// Centre-ROI median of high-confidence smoothed scene depth, in millimetres.
    /// Nil when the device has no LiDAR, the frame has no depth, or no high-confidence pixels.
    static func lidarMillimetres(_ frame: ARFrame) -> Double? {
        guard ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth),
              let depth = frame.smoothedSceneDepth else { return nil }
        guard let meters = centreMedianMetres(depthMap: depth.depthMap, confidenceMap: depth.confidenceMap) else {
            return nil
        }
        let millimetres = Double(meters) * 1000
        return millimetres.isFinite && millimetres > 0 ? millimetres : nil
    }

    /// Raycast along the camera axis to the nearest plane. Nil until ARKit has a plane.
    static func vioMillimetres(session: ARSession, frame: ARFrame) -> Double? {
        let transform = frame.camera.transform
        let origin = SIMD3<Float>(transform.columns.3.x, transform.columns.3.y, transform.columns.3.z)
        let backward = SIMD3<Float>(transform.columns.2.x, transform.columns.2.y, transform.columns.2.z)
        let length = simd_length(backward)
        guard length > 1e-5 else { return nil }
        let forward = -backward / length
        let query = ARRaycastQuery(origin: origin, direction: forward, allowing: .estimatedPlane, alignment: .any)
        var nearest: Float?
        for hit in session.raycast(query) {
            let point = SIMD3<Float>(
                hit.worldTransform.columns.3.x,
                hit.worldTransform.columns.3.y,
                hit.worldTransform.columns.3.z
            )
            let depth = simd_dot(point - origin, forward)
            guard depth > 0.02 else { continue }
            if let current = nearest {
                if depth < current { nearest = depth }
            } else {
                nearest = depth
            }
        }
        guard let nearest else { return nil }
        return Double(nearest) * 1000
    }
}

/// Median depth, in metres, of high-confidence pixels in the centre of the depth map.
/// Returns nil when the confidence map is missing: low-confidence LiDAR is not used.
private func centreMedianMetres(depthMap: CVPixelBuffer, confidenceMap: CVPixelBuffer?) -> Float? {
    guard let confidenceMap else { return nil }
    guard CVPixelBufferLockBaseAddress(depthMap, .readOnly) == kCVReturnSuccess else { return nil }
    defer { CVPixelBufferUnlockBaseAddress(depthMap, .readOnly) }
    guard CVPixelBufferLockBaseAddress(confidenceMap, .readOnly) == kCVReturnSuccess else { return nil }
    defer { CVPixelBufferUnlockBaseAddress(confidenceMap, .readOnly) }
    guard let depthBase = CVPixelBufferGetBaseAddress(depthMap),
          let confidenceBase = CVPixelBufferGetBaseAddress(confidenceMap) else { return nil }

    let width = CVPixelBufferGetWidth(depthMap)
    let height = CVPixelBufferGetHeight(depthMap)
    let depthStride = CVPixelBufferGetBytesPerRow(depthMap)
    let confidenceWidth = CVPixelBufferGetWidth(confidenceMap)
    let confidenceHeight = CVPixelBufferGetHeight(confidenceMap)
    let confidenceStride = CVPixelBufferGetBytesPerRow(confidenceMap)
    guard width > 2, height > 2, depthStride > 0, confidenceWidth > 0, confidenceHeight > 0 else { return nil }

    let roiWidth = max(3, width / 8)
    let roiHeight = max(3, height / 8)
    let x0 = (width - roiWidth) / 2
    let y0 = (height - roiHeight) / 2
    let high = UInt8(ARConfidenceLevel.high.rawValue)
    let floatSize = MemoryLayout<Float>.size

    var samples: [Float] = []
    samples.reserveCapacity(roiWidth * roiHeight)
    for y in y0..<(y0 + roiHeight) {
        for x in x0..<(x0 + roiWidth) {
            let cx = min(confidenceWidth - 1, x * confidenceWidth / width)
            let cy = min(confidenceHeight - 1, y * confidenceHeight / height)
            let confidence = confidenceBase.advanced(by: cy * confidenceStride + cx)
                .assumingMemoryBound(to: UInt8.self).pointee
            guard confidence == high else { continue }
            let depth = depthBase.load(fromByteOffset: y * depthStride + x * floatSize, as: Float.self)
            if depth.isFinite, depth > 0 { samples.append(depth) }
        }
    }
    guard !samples.isEmpty else { return nil }
    samples.sort()
    let middle = samples.count / 2
    if samples.count % 2 == 1 { return samples[middle] }
    return 0.5 * (samples[middle - 1] + samples[middle])
}
