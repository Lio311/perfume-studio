import Foundation

public struct MeasureSpan: Equatable, Sendable {
    public var start: SIMD2<Double>
    public var end: SIMD2<Double>

    public init(start: SIMD2<Double>, end: SIMD2<Double>) {
        self.start = start
        self.end = end
    }
}

/// Axis, width, and height lines in saved-image pixels, taken from the silhouette.
public struct MeasureOverlayModel: Equatable, Sendable {
    public var outline: [SIMD2<Double>]
    public var axis: MeasureSpan
    public var width: MeasureSpan
    public var height: MeasureSpan

    public init(outline: [SIMD2<Double>], axis: MeasureSpan, width: MeasureSpan, height: MeasureSpan) {
        self.outline = outline
        self.axis = axis
        self.width = width
        self.height = height
    }
}

public enum MeasureOverlayGeometry {
    public static func model(silhouette: Silhouette) -> MeasureOverlayModel? {
        let rows = silhouette.rows()
        guard let first = rows.first, let last = rows.last, last.y > first.y else { return nil }
        var widest = first
        var widestSpan = first.right - first.left
        for row in rows {
            let span = row.right - row.left
            if span > widestSpan {
                widest = row
                widestSpan = span
            }
        }
        let topMid = 0.5 * Double(first.left + first.right)
        let bottomMid = 0.5 * Double(last.left + last.right)
        var outline: [SIMD2<Double>] = []
        outline.reserveCapacity(rows.count * 2)
        let step = max(1, rows.count / 64)
        var index = 0
        while index < rows.count {
            let row = rows[index]
            outline.append(SIMD2(Double(row.left), Double(row.y)))
            index += step
        }
        if let row = rows.last {
            outline.append(SIMD2(Double(row.left), Double(row.y)))
        }
        index = rows.count - 1
        while index >= 0 {
            let row = rows[index]
            outline.append(SIMD2(Double(row.right), Double(row.y)))
            index -= step
        }
        return MeasureOverlayModel(
            outline: outline,
            axis: MeasureSpan(
                start: SIMD2(topMid, Double(first.y)),
                end: SIMD2(bottomMid, Double(last.y))
            ),
            width: MeasureSpan(
                start: SIMD2(Double(widest.left), Double(widest.y)),
                end: SIMD2(Double(widest.right), Double(widest.y))
            ),
            height: MeasureSpan(
                start: SIMD2(topMid, Double(first.y)),
                end: SIMD2(topMid, Double(last.y))
            )
        )
    }
}
