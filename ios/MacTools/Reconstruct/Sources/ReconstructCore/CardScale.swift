import Foundation

public struct Ray: Equatable, Sendable {
    public var origin: Vec3
    public var direction: Vec3

    public init(origin: Vec3, direction: Vec3) {
        self.origin = origin
        self.direction = direction
    }
}

public enum RayMath {
    /// Least-squares closest point to two or more rays. Nil when the rays are parallel or the point sits behind the cameras.
    public static func closestPoint(_ rays: [Ray]) -> Vec3? {
        guard rays.count >= 2 else { return nil }
        var directions: [Vec3] = []
        directions.reserveCapacity(rays.count)
        for ray in rays {
            guard let direction = ray.direction.normalized() else { return nil }
            directions.append(direction)
        }

        var a00 = 0.0, a01 = 0.0, a02 = 0.0
        var a11 = 0.0, a12 = 0.0, a22 = 0.0
        var b0 = 0.0, b1 = 0.0, b2 = 0.0
        for (ray, direction) in zip(rays, directions) {
            let d00 = 1 - direction.x * direction.x
            let d01 = -direction.x * direction.y
            let d02 = -direction.x * direction.z
            let d11 = 1 - direction.y * direction.y
            let d12 = -direction.y * direction.z
            let d22 = 1 - direction.z * direction.z
            a00 += d00
            a01 += d01
            a02 += d02
            a11 += d11
            a12 += d12
            a22 += d22
            let origin = ray.origin
            b0 += d00 * origin.x + d01 * origin.y + d02 * origin.z
            b1 += d01 * origin.x + d11 * origin.y + d12 * origin.z
            b2 += d02 * origin.x + d12 * origin.y + d22 * origin.z
        }
        guard let point = solveSymmetric3(a00: a00, a01: a01, a02: a02, a11: a11, a12: a12, a22: a22, b0: b0, b1: b1, b2: b2) else {
            return nil
        }
        var inFront = 0
        for (ray, direction) in zip(rays, directions) {
            if (point - ray.origin).dot(direction) > 1e-6 {
                inFront += 1
            }
        }
        guard inFront * 2 >= rays.count else { return nil }
        return point
    }

    static func solveSymmetric3(a00: Double, a01: Double, a02: Double, a11: Double, a12: Double, a22: Double, b0: Double, b1: Double, b2: Double) -> Vec3? {
        var rows = [
            [a00, a01, a02, b0],
            [a01, a11, a12, b1],
            [a02, a12, a22, b2],
        ]
        for column in 0..<3 {
            var pivot = column
            var best = abs(rows[column][column])
            for row in (column + 1)..<3 {
                let value = abs(rows[row][column])
                if value > best {
                    best = value
                    pivot = row
                }
            }
            guard best > 1e-10 else { return nil }
            if pivot != column {
                rows.swapAt(pivot, column)
            }
            let divisor = rows[column][column]
            for col in column..<4 {
                rows[column][col] /= divisor
            }
            for row in 0..<3 where row != column {
                let factor = rows[row][column]
                if factor == 0 { continue }
                for col in column..<4 {
                    rows[row][col] -= factor * rows[column][col]
                }
            }
        }
        let point = Vec3(rows[0][3], rows[1][3], rows[2][3])
        guard point.x.isFinite, point.y.isFinite, point.z.isFinite else { return nil }
        return point
    }
}

public enum CameraRay {
    /// Image origin is top-left and +v points down. The camera looks along -Z and +Y is up.
    /// `cameraToWorld` is the camera pose in the photogrammetry coordinate system.
    public static func ray(pixel: Vec2, intrinsics: PinholeIntrinsics, cameraToWorld: Mat4) -> Ray? {
        guard intrinsics.fx != 0, intrinsics.fy != 0 else { return nil }
        let x = (pixel.x - intrinsics.cx) / intrinsics.fx
        let y = -((pixel.y - intrinsics.cy) / intrinsics.fy)
        let direction = cameraToWorld.transformDirection(Vec3(x, y, -1))
        guard let unit = direction.normalized() else { return nil }
        return Ray(origin: cameraToWorld.transformPoint(.zero), direction: unit)
    }
}

public enum CardScale {
    /// ISO/IEC 7810 ID-1.
    public static let widthMm = 85.60
    public static let heightMm = 53.98
    /// Long-edge and short-edge scale estimates must agree within this relative error.
    public static let maxRelativeDisagreement = 0.15

    /// Millimetres per model unit from four reconstructed card corners.
    /// Corner order is top-left, top-right, bottom-right, bottom-left.
    public static func millimetresPerUnit(corners: [Vec3]) -> Double? {
        guard corners.count == 4 else { return nil }
        let sideA = ((corners[1] - corners[0]).length + (corners[3] - corners[2]).length) / 2
        let sideB = ((corners[2] - corners[1]).length + (corners[0] - corners[3]).length) / 2
        let longSide = max(sideA, sideB)
        let shortSide = min(sideA, sideB)
        guard longSide > 1e-8, shortSide > 1e-8 else { return nil }
        let longScale = widthMm / longSide
        let shortScale = heightMm / shortSide
        let relative = abs(longScale - shortScale) / max(longScale, shortScale)
        guard relative <= maxRelativeDisagreement else { return nil }
        let scale = (longScale + shortScale) / 2
        guard scale.isFinite, scale > 0 else { return nil }
        return scale
    }

    public static func triangulate(cornerRays: [[Ray]]) -> [Vec3]? {
        guard cornerRays.count == 4 else { return nil }
        var corners: [Vec3] = []
        for rays in cornerRays {
            guard rays.count >= 2, let point = RayMath.closestPoint(rays) else { return nil }
            corners.append(point)
        }
        return corners
    }
}

public struct CardView: Equatable, Sendable {
    public var fileName: String
    public var corners: [Vec2]
    public var intrinsics: PinholeIntrinsics
    public var cameraToWorld: Mat4

    public init(fileName: String, corners: [Vec2], intrinsics: PinholeIntrinsics, cameraToWorld: Mat4) {
        self.fileName = fileName
        self.corners = corners
        self.intrinsics = intrinsics
        self.cameraToWorld = cameraToWorld
    }
}

public enum CardCornerResolver {
    /// Values that all lie in 0...1 are normalized and need an image size. Larger values are pixels.
    public static func pixelCorners(_ corners: [Vec2], imageWidth: Double?, imageHeight: Double?) -> [Vec2]? {
        guard corners.count == 4 else { return nil }
        let normalized = corners.allSatisfy { $0.x >= 0 && $0.x <= 1 && $0.y >= 0 && $0.y <= 1 }
        if normalized {
            guard let imageWidth, let imageHeight, imageWidth > 1, imageHeight > 1 else { return nil }
            return corners.map { Vec2($0.x * imageWidth, $0.y * imageHeight) }
        }
        return corners
    }
}

public enum CardObservationBuilder {
    public static func cornerRays(views: [CardView]) -> [[Ray]] {
        var buckets: [[Ray]] = [[], [], [], []]
        for view in views where view.corners.count == 4 {
            for index in 0..<4 {
                if let ray = CameraRay.ray(
                    pixel: view.corners[index],
                    intrinsics: view.intrinsics,
                    cameraToWorld: view.cameraToWorld
                ) {
                    buckets[index].append(ray)
                }
            }
        }
        return buckets
    }

    public static func scale(views: [CardView]) -> Double? {
        let rays = cornerRays(views: views)
        guard let corners = CardScale.triangulate(cornerRays: rays) else { return nil }
        return CardScale.millimetresPerUnit(corners: corners)
    }
}
