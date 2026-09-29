import Foundation

public struct PlanarFace: Equatable, Sendable {
    public var widthMm: Double
    public var heightMm: Double
    public var rectangleFit: Double

    public init(widthMm: Double, heightMm: Double, rectangleFit: Double) {
        self.widthMm = widthMm
        self.heightMm = heightMm
        self.rectangleFit = rectangleFit
    }
}

public enum DimensionEstimator {
    /// Round kinds: height is the profile extent, width and depth are twice the maximum radius.
    public static func roundDimensions(kind: PartKind, extraction: ProfileExtraction) -> Dimensions {
        let diameter = 2 * extraction.radiusMm
        switch kind {
        case .bottle, .cap, .pump, .collar:
            return Dimensions(widthMm: diameter, heightMm: extraction.heightMm, depthMm: diameter)
        case .box, .label:
            return Dimensions(widthMm: diameter, heightMm: extraction.heightMm, depthMm: diameter)
        }
    }

    /// Box: width and height from the front face, depth from the side face.
    /// Label: width and height from the rectified front, depth 0.
    public static func planarDimensions(kind: PartKind, front: PlanarFace, side: PlanarFace?) -> Dimensions {
        if kind == .label {
            return Dimensions(widthMm: front.widthMm, heightMm: front.heightMm, depthMm: 0)
        }
        let depth = side?.widthMm ?? front.widthMm
        return Dimensions(widthMm: front.widthMm, heightMm: front.heightMm, depthMm: depth)
    }

    /// Rectified front (or side) face. Pass the card-plane map when the face lies in that plane.
    public static func planarFace(silhouette: Silhouette, plane: CardPlaneMap) -> PlanarFace? {
        let rows = silhouette.rows()
        guard rows.count >= 2 else { return nil }
        var minX = Double.infinity
        var maxX = -Double.infinity
        var minY = Double.infinity
        var maxY = -Double.infinity
        var widths: [Double] = []
        for row in rows {
            let y = Double(row.y) + 0.5
            guard let left = plane.planeMm(fromPixel: SIMD2(Double(row.left), y)),
                  let right = plane.planeMm(fromPixel: SIMD2(Double(row.right + 1), y)) else { continue }
            minX = min(minX, left.x, right.x)
            maxX = max(maxX, left.x, right.x)
            minY = min(minY, left.y, right.y)
            maxY = max(maxY, left.y, right.y)
            widths.append(abs(right.x - left.x))
        }
        guard minX.isFinite, maxX > minX, maxY > minY else { return nil }
        return PlanarFace(
            widthMm: maxX - minX,
            heightMm: maxY - minY,
            rectangleFit: fit(widths)
        )
    }

    public static func planarFace(silhouette: Silhouette, millimetresPerPixel: Double) -> PlanarFace? {
        let rows = silhouette.rows()
        guard rows.count >= 2, millimetresPerPixel > 0 else { return nil }
        let widthPx = rows.map { Double($0.right - $0.left + 1) }.max() ?? 0
        let heightPx = Double(rows.last!.y - rows.first!.y + 1)
        let widths = rows.map { Double($0.right - $0.left + 1) }
        return PlanarFace(
            widthMm: widthPx * millimetresPerPixel,
            heightMm: heightPx * millimetresPerPixel,
            rectangleFit: fit(widths)
        )
    }

    private static func fit(_ widths: [Double]) -> Double {
        guard let maxWidth = widths.max(), maxWidth > 0 else { return 0 }
        let close = widths.filter { $0 >= 0.98 * maxWidth }.count
        return Double(close) / Double(widths.count)
    }
}
