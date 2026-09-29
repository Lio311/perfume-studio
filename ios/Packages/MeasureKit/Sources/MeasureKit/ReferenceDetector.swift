import CoreGraphics
import Foundation
import PackKit

/// Card corners in saved-image pixels. Stored corners win; otherwise the still is detected again
/// and ordered with the same long-edge rule as the live guide.
public enum ReferenceDetector {
    public static func corners(
        image: CGImage,
        stored: [ImagePoint]?,
        orientation: VisionImageOrientation = .backCameraPortrait,
        reference: CardReference = .id1
    ) -> [SIMD2<Double>]? {
        if let stored, stored.count == 4 {
            let ordered = CardCornerOrder.order(stored.map { SIMD2($0.x, $0.y) }, reference: reference)
            return ordered.count == 4 ? ordered : nil
        }
        guard let detection = CardDetector.detect(in: image, orientation: orientation) else { return nil }
        let ordered = CardCornerOrder.order(detection.corners, reference: reference)
        return ordered.count == 4 ? ordered : nil
    }
}
