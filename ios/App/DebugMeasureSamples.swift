import CoreGraphics
import Foundation
import PackKit
import Store
import UIKit

#if DEBUG
enum DebugMeasureSamples {
    /// Writes one bundled (or freshly rendered) sample into the draft store and returns a finished sequence.
    static func install(_ sample: MeasureSample, store: ScanFileStore) throws -> CaptureSequence {
        var sequence = CaptureSequence(kind: sample.kind)
        var images: [String: Data] = [:]
        for photo in sample.photos {
            let jpeg = bundledJPEG(named: photo.fileName) ?? encode(photo)
            let captured = CapturedPhoto(
                angle: photo.angle,
                fileName: photo.fileName,
                pixelWidth: photo.width,
                pixelHeight: photo.height,
                capturedAt: Date(timeIntervalSince1970: 1_759_000_000),
                intrinsics: photo.intrinsics,
                distanceMm: photo.distanceMm,
                distanceSource: .card,
                sigmaMm: 1,
                guideState: .green,
                cardCorners: photo.corners.map(ImagePoint.init),
                tiltDegrees: 0,
                deviceModel: "iPhone15,4",
                hasLiDAR: false
            )
            guard sequence.capture(captured) else { continue }
            images[photo.fileName] = jpeg
        }
        while sequence.skip() {}
        try store.save(sequence: sequence, images: images, now: Date())
        return sequence
    }

    static func bundledJPEG(named fileName: String) -> Data? {
        let base = (fileName as NSString).deletingPathExtension
        guard let url = Bundle.main.url(forResource: base, withExtension: "jpg") else { return nil }
        return try? Data(contentsOf: url)
    }

    static func encode(_ photo: MeasureSamplePhoto) -> Data {
        var rgba = [UInt8](repeating: 255, count: photo.width * photo.height * 4)
        for index in 0..<(photo.width * photo.height) {
            rgba[index * 4] = photo.rgb[index * 3]
            rgba[index * 4 + 1] = photo.rgb[index * 3 + 1]
            rgba[index * 4 + 2] = photo.rgb[index * 3 + 2]
        }
        let data = Data(rgba)
        guard let provider = CGDataProvider(data: data as CFData),
              let image = CGImage(
                width: photo.width,
                height: photo.height,
                bitsPerComponent: 8,
                bitsPerPixel: 32,
                bytesPerRow: photo.width * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                provider: provider,
                decode: nil,
                shouldInterpolate: false,
                intent: .defaultIntent
              ) else { return Data() }
        let oriented = UIImage(cgImage: image, scale: 1, orientation: .right)
        return ScanImage.jpegData(from: oriented, quality: 0.95) ?? Data()
    }
}
#endif
