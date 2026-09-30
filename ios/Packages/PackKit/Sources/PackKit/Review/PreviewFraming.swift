import Foundation

/// Camera distance and clip planes that fit a bounding sphere, independent of SceneKit.
/// A 20 mm cap and a 100 mm bottle use the same fraction of the vertical field of view.
public enum PreviewFraming {
    public struct Frame: Equatable, Sendable {
        public var distance: Double
        public var near: Double
        public var far: Double
        /// Fraction of the vertical field of view filled by the sphere's diameter.
        public var fill: Double
    }

    /// `radiusMetres` is the bounding-sphere radius. `fill` is how much of the vertical FOV the diameter should occupy.
    public static func frame(radiusMetres: Double, verticalFOVDegrees: Double = 60, fill: Double = 0.85) -> Frame {
        let radius = radiusMetres.isFinite ? max(radiusMetres, 1e-6) : 1e-6
        let fov = verticalFOVDegrees.isFinite ? max(verticalFOVDegrees, 1) : 60
        let clampedFill = min(0.95, max(0.2, fill.isFinite ? fill : 0.85))
        let halfFOV = fov * Double.pi / 360
        let distance = radius / tan(clampedFill * halfFOV)
        let near = distance * 0.01
        let far = max(distance * 4, distance + radius * 8)
        return Frame(distance: distance, near: near, far: far, fill: clampedFill)
    }
}
