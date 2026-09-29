import Foundation

/// Orders a detected card the same way the live distance guide does:
/// the long physical side (85.60 mm on ID-1) lies on the long image edges.
public enum CardCornerOrder {
    public static func order(
        _ corners: [SIMD2<Double>],
        reference: CardReference = .id1,
        previous: [SIMD2<Double>]? = nil
    ) -> [SIMD2<Double>] {
        guard corners.count == 4 else { return corners }
        return CornerOrdering.alignments(corners, reference: reference, previous: previous).first ?? corners
    }
}
