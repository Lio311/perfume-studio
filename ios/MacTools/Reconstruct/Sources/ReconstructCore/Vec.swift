import Foundation

public struct Vec2: Equatable, Sendable {
    public var x: Double
    public var y: Double

    public init(_ x: Double, _ y: Double) {
        self.x = x
        self.y = y
    }
}

public struct Vec3: Equatable, Codable, Sendable {
    public var x: Double
    public var y: Double
    public var z: Double

    public init(_ x: Double, _ y: Double, _ z: Double) {
        self.x = x
        self.y = y
        self.z = z
    }

    public static let zero = Vec3(0, 0, 0)

    public var length: Double { (x * x + y * y + z * z).squareRoot() }

    public func dot(_ other: Vec3) -> Double {
        x * other.x + y * other.y + z * other.z
    }

    public func cross(_ other: Vec3) -> Vec3 {
        Vec3(
            y * other.z - z * other.y,
            z * other.x - x * other.z,
            x * other.y - y * other.x
        )
    }

    public func normalized() -> Vec3? {
        let len = length
        guard len > 1e-12, len.isFinite else { return nil }
        return self * (1 / len)
    }

    public static func + (lhs: Vec3, rhs: Vec3) -> Vec3 {
        Vec3(lhs.x + rhs.x, lhs.y + rhs.y, lhs.z + rhs.z)
    }

    public static func - (lhs: Vec3, rhs: Vec3) -> Vec3 {
        Vec3(lhs.x - rhs.x, lhs.y - rhs.y, lhs.z - rhs.z)
    }

    public static func * (lhs: Vec3, rhs: Double) -> Vec3 {
        Vec3(lhs.x * rhs, lhs.y * rhs, lhs.z * rhs)
    }
}

/// Column-major 4×4. Camera poses use this so the math stays Foundation-only.
public struct Mat4: Equatable, Sendable {
    public var m: [Double]

    public init(m: [Double]) {
        self.m = m
    }

    public init(rotationColumns: (Vec3, Vec3, Vec3), translation: Vec3) {
        let c0 = rotationColumns.0
        let c1 = rotationColumns.1
        let c2 = rotationColumns.2
        m = [
            c0.x, c0.y, c0.z, 0,
            c1.x, c1.y, c1.z, 0,
            c2.x, c2.y, c2.z, 0,
            translation.x, translation.y, translation.z, 1,
        ]
    }

    public static var identity: Mat4 {
        Mat4(
            rotationColumns: (Vec3(1, 0, 0), Vec3(0, 1, 0), Vec3(0, 0, 1)),
            translation: .zero
        )
    }

    public func transformPoint(_ point: Vec3) -> Vec3 {
        let x = m[0] * point.x + m[4] * point.y + m[8] * point.z + m[12]
        let y = m[1] * point.x + m[5] * point.y + m[9] * point.z + m[13]
        let z = m[2] * point.x + m[6] * point.y + m[10] * point.z + m[14]
        return Vec3(x, y, z)
    }

    public func transformDirection(_ direction: Vec3) -> Vec3 {
        let x = m[0] * direction.x + m[4] * direction.y + m[8] * direction.z
        let y = m[1] * direction.x + m[5] * direction.y + m[9] * direction.z
        let z = m[2] * direction.x + m[6] * direction.y + m[10] * direction.z
        return Vec3(x, y, z)
    }
}

public struct BoundingBox: Equatable, Sendable {
    public var min: Vec3
    public var max: Vec3

    public init(min: Vec3, max: Vec3) {
        self.min = min
        self.max = max
    }

    public var size: Vec3 {
        Vec3(max.x - min.x, max.y - min.y, max.z - min.z)
    }

    public static func enclosing(_ points: [Vec3]) -> BoundingBox? {
        guard var low = points.first else { return nil }
        guard low.x.isFinite, low.y.isFinite, low.z.isFinite else { return nil }
        var high = low
        for point in points.dropFirst() {
            guard point.x.isFinite, point.y.isFinite, point.z.isFinite else { return nil }
            low.x = Swift.min(low.x, point.x)
            low.y = Swift.min(low.y, point.y)
            low.z = Swift.min(low.z, point.z)
            high.x = Swift.max(high.x, point.x)
            high.y = Swift.max(high.y, point.y)
            high.z = Swift.max(high.z, point.z)
        }
        return BoundingBox(min: low, max: high)
    }
}
