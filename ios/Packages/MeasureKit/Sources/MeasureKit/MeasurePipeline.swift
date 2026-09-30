import CoreGraphics
import Foundation
import ImageIO
import PackKit

public struct MeasurePhotoInput: Sendable {
    public var jpeg: Data
    public var photo: CapturedPhoto

    public init(jpeg: Data, photo: CapturedPhoto) {
        self.jpeg = jpeg
        self.photo = photo
    }
}

public struct MeasurePreparedPhoto: Sendable {
    public var photo: CapturedPhoto
    public var silhouette: Silhouette?
    public var corners: [SIMD2<Double>]?
    public var needsOutlineReview: Bool
    /// Downsampled luminance for edge snapping. Origin top-left of the saved image.
    public var luminance: [UInt8]
    public var luminanceWidth: Int
    public var luminanceHeight: Int

    public init(
        photo: CapturedPhoto,
        silhouette: Silhouette?,
        corners: [SIMD2<Double>]?,
        needsOutlineReview: Bool,
        luminance: [UInt8],
        luminanceWidth: Int,
        luminanceHeight: Int
    ) {
        self.photo = photo
        self.silhouette = silhouette
        self.corners = corners
        self.needsOutlineReview = needsOutlineReview
        self.luminance = luminance
        self.luminanceWidth = luminanceWidth
        self.luminanceHeight = luminanceHeight
    }

    public func snap(_ point: SIMD2<Double>, radius: Int = 8) -> SIMD2<Double> {
        guard luminanceWidth > 2, luminanceHeight > 2, photo.pixelWidth > 0, photo.pixelHeight > 0 else { return point }
        let luma = SIMD2(
            point.x * Double(luminanceWidth) / Double(photo.pixelWidth),
            point.y * Double(luminanceHeight) / Double(photo.pixelHeight)
        )
        let snapped = EdgeSnap.snap(
            point: luma,
            luminance: luminance,
            width: luminanceWidth,
            height: luminanceHeight,
            radius: radius
        )
        return SIMD2(
            snapped.x * Double(photo.pixelWidth) / Double(luminanceWidth),
            snapped.y * Double(photo.pixelHeight) / Double(luminanceHeight)
        )
    }
}

public struct MeasurePrepared: Sendable {
    public var photos: [MeasurePreparedPhoto]

    public init(photos: [MeasurePreparedPhoto]) {
        self.photos = photos
    }

    public func photo(for angle: CaptureAngle) -> MeasurePreparedPhoto? {
        photos.first { $0.photo.angle == angle }
    }
}

/// Decodes stills, masks the part, and finds the card off the main thread. Cancel drops a stale result.
public final class MeasurePipeline: @unchecked Sendable {
    private let queue = DispatchQueue(label: "com.perfumestudio.measure", qos: .userInitiated)
    private let lock = NSLock()
    private var token = 0

    public init() {}

    public func cancel() {
        lock.lock()
        token += 1
        lock.unlock()
    }

    public func prepare(_ inputs: [MeasurePhotoInput], completion: @escaping (MeasurePrepared?) -> Void) {
        lock.lock()
        token += 1
        let current = token
        lock.unlock()
        queue.async { [weak self] in
            guard let self else {
                DispatchQueue.main.async { completion(nil) }
                return
            }
            var photos: [MeasurePreparedPhoto] = []
            photos.reserveCapacity(inputs.count)
            for input in inputs {
                if !self.isCurrent(current) {
                    DispatchQueue.main.async { completion(nil) }
                    return
                }
                if let prepared = self.prepareOne(input) {
                    photos.append(prepared)
                }
            }
            let prepared = MeasurePrepared(photos: photos)
            DispatchQueue.main.async {
                completion(self.isCurrent(current) ? prepared : nil)
            }
        }
    }

    private func prepareOne(_ input: MeasurePhotoInput) -> MeasurePreparedPhoto? {
        guard let image = SavedStillImage.cgImage(from: input.jpeg) else { return nil }
        let corners = ReferenceDetector.corners(image: image, stored: input.photo.cardCorners)
        let masked = SubjectMasker.mask(image: image, card: corners)
        let full = SubjectMasker.luminance(image: image) ?? []
        let working = EdgeContour.downsample(full, width: image.width, height: image.height, maxEdge: 1000)
        return MeasurePreparedPhoto(
            photo: input.photo,
            silhouette: masked?.silhouette,
            corners: corners,
            needsOutlineReview: masked?.needsOutlineReview ?? true,
            luminance: working.pixels,
            luminanceWidth: working.width,
            luminanceHeight: working.height
        )
    }

    private func isCurrent(_ value: Int) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return token == value
    }
}

enum SavedStillImage {
    /// Pixels of the stored JPEG, without applying EXIF orientation.
    /// The bitmap stays in `capturedImage` space; orientation `.right` is metadata.
    static func cgImage(from data: Data) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: false,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        if let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) {
            return image
        }
        return CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary)
    }
}
