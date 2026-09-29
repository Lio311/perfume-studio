import CoreImage
import CoreVideo
import Darwin
import Foundation
import PackKit
import MeasureKit
import Store
import UIKit

struct CaptureReadingStamp {
    var distanceMm: Double?
    var source: CaptureDistanceSource
    var sigmaMm: Double?
    var guide: DistanceGuide.State?
    var tiltDegrees: Double?
}

struct PreparedStill {
    var cgImage: CGImage
    var corners: [ImagePoint]?
    var intrinsics: CameraIntrinsics
}

/// Turns one `capturedImage` buffer into a full-resolution JPEG plus metadata.
/// The bitmap keeps the camera pixel grid. UIImage orientation `.right` is the
/// portrait correction for this app (portrait only, back wide camera), and
/// `jpegData` writes that orientation into EXIF so the photo is upright.
/// Corners and intrinsics stay in that bitmap's pixels (origin top-left, Y down).
/// Vision is given `.right` for this portrait back camera,
/// then the corners are converted back into the same buffer space as the intrinsics.
enum StillImageBuilder {
    /// Call on the capture queue. `buffer` is a copy of `capturedImage`; the `ARFrame` is not retained.
    static func prepare(buffer: CVPixelBuffer, intrinsics: CameraIntrinsics) -> PreparedStill? {
        let context = CIContext()
        let image = CIImage(cvPixelBuffer: buffer)
        guard let cgImage = context.createCGImage(image, from: image.extent) else { return nil }
        let corners = CardDetector.detect(in: buffer, orientation: .backCameraPortrait)?.corners.map(ImagePoint.init)
        return PreparedStill(cgImage: cgImage, corners: corners, intrinsics: intrinsics)
    }

    /// Call on the main queue. Builds the oriented JPEG at quality 0.9.
    static func pending(
        from prepared: PreparedStill,
        angle: CaptureAngle,
        stamp: CaptureReadingStamp,
        hasLiDAR: Bool
    ) -> PendingCapture? {
        let oriented = UIImage(cgImage: prepared.cgImage, scale: 1, orientation: .right)
        guard let jpeg = ScanImage.jpegData(from: oriented, quality: ScanImage.jpegQuality), !jpeg.isEmpty else { return nil }
        let photo = makePhoto(
            angle: angle,
            fileSize: (prepared.cgImage.width, prepared.cgImage.height),
            intrinsics: prepared.intrinsics,
            corners: prepared.corners,
            stamp: stamp,
            hasLiDAR: hasLiDAR
        )
        return PendingCapture(image: oriented, jpeg: jpeg, photo: photo)
    }

    static func makePhoto(
        angle: CaptureAngle,
        fileSize: (Int, Int),
        intrinsics: CameraIntrinsics,
        corners: [ImagePoint]?,
        stamp: CaptureReadingStamp,
        hasLiDAR: Bool
    ) -> CapturedPhoto {
        let id = UUID()
        return CapturedPhoto(
            id: id,
            angle: angle,
            fileName: "\(angle.rawValue)-\(id.uuidString.lowercased()).jpg",
            pixelWidth: fileSize.0,
            pixelHeight: fileSize.1,
            capturedAt: Date(),
            intrinsics: intrinsics,
            distanceMm: stamp.distanceMm,
            distanceSource: stamp.source,
            sigmaMm: stamp.sigmaMm,
            guideState: stamp.guide,
            cardCorners: corners,
            tiltDegrees: stamp.tiltDegrees,
            deviceModel: DeviceModel.identifier,
            hasLiDAR: hasLiDAR
        )
    }
}

enum DeviceModel {
    static var identifier: String {
        var system = utsname()
        uname(&system)
        return withUnsafePointer(to: &system.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) {
                String(cString: $0)
            }
        }
    }
}

#if DEBUG
enum FakeCaptureImage {
    static func load() -> UIImage {
        if let url = Bundle.main.url(forResource: "FakeCapture", withExtension: "png"),
           let data = try? Data(contentsOf: url),
           let image = UIImage(data: data) {
            return image
        }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 600, height: 800), format: format)
        return renderer.image { context in
            UIColor(white: 0.12, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 600, height: 800))
            UIColor(white: 0.94, alpha: 1).setFill()
            context.fill(CGRect(x: 180, y: 280, width: 240, height: 150))
        }
    }

    static func make(angle: CaptureAngle, stamp: CaptureReadingStamp, hasLiDAR: Bool) -> PendingCapture {
        let image = load()
        let pixelWidth = Int(image.size.width * image.scale)
        let pixelHeight = Int(image.size.height * image.scale)
        let jpeg = ScanImage.jpegData(from: image, quality: ScanImage.jpegQuality) ?? Data()
        let intrinsics = CameraIntrinsics(
            fx: Double(max(pixelWidth, pixelHeight)),
            fy: Double(max(pixelWidth, pixelHeight)),
            cx: Double(pixelWidth) / 2,
            cy: Double(pixelHeight) / 2
        )
        let photo = StillImageBuilder.makePhoto(
            angle: angle,
            fileSize: (pixelWidth, pixelHeight),
            intrinsics: intrinsics,
            corners: nil,
            stamp: stamp,
            hasLiDAR: hasLiDAR
        )
        return PendingCapture(image: image, jpeg: jpeg, photo: photo)
    }
}
#endif
