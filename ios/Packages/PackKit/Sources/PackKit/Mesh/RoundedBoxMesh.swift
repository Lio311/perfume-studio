import Foundation

/// Extruded rounded rectangle. Footprint is width (X) by depth (Z), height along Y.
/// The outer bounding box is the full footprint: corners are inset.
/// Each wall and each corner arc is its own UV island (0...1), and the caps are separate
/// vertices so the top and bottom edges stay hard.
enum RoundedBoxMesh {
    static let cornerSteps = 6

    static func mesh(
        widthMm: Double,
        depthMm: Double,
        heightMm: Double,
        cornerRadiusMm: Double,
        material: MeshMaterial
    ) -> Mesh {
        let width = max(widthMm, 0)
        let depth = max(depthMm, 0)
        let height = max(heightMm, 0)
        let radius = min(max(0, cornerRadiusMm), min(width, depth) / 2)
        let strips = strips(width: width, depth: depth, radius: radius)
        var mesh = MeshAccumulator()
        addSides(strips, height: height, into: &mesh)
        let loop = capLoop(strips)
        addCap(loop, y: 0, upward: false, width: width, depth: depth, into: &mesh)
        addCap(loop, y: height, upward: true, width: width, depth: depth, into: &mesh)
        return mesh.mesh(material: material)
    }

    private struct Sample {
        var x: Double
        var z: Double
        var nx: Double
        var nz: Double
        var u: Double
    }

    /// Walks the outline in the same direction as the lathe (phi 0 at +Z, increasing toward +X).
    private static func strips(width: Double, depth: Double, radius: Double) -> [[Sample]] {
        let halfW = width / 2
        let halfD = depth / 2
        if radius < 1e-4 {
            return [
                flat(from: SIMD2(-halfW, halfD), to: SIMD2(halfW, halfD), normal: SIMD2(0, 1)),
                flat(from: SIMD2(halfW, halfD), to: SIMD2(halfW, -halfD), normal: SIMD2(1, 0)),
                flat(from: SIMD2(halfW, -halfD), to: SIMD2(-halfW, -halfD), normal: SIMD2(0, -1)),
                flat(from: SIMD2(-halfW, -halfD), to: SIMD2(-halfW, halfD), normal: SIMD2(-1, 0)),
            ]
        }
        let corners: [(cx: Double, cz: Double, a0: Double)] = [
            (halfW - radius, halfD - radius, 0),
            (halfW - radius, -(halfD - radius), .pi / 2),
            (-(halfW - radius), -(halfD - radius), .pi),
            (-(halfW - radius), halfD - radius, .pi * 1.5),
        ]
        var result: [[Sample]] = []
        for (index, corner) in corners.enumerated() {
            var arc: [Sample] = []
            for step in 0...cornerSteps {
                let t = Double(step) / Double(cornerSteps)
                let point = arcPoint(corner, t: t, radius: radius)
                arc.append(Sample(x: point.x, z: point.z, nx: point.nx, nz: point.nz, u: t))
            }
            result.append(arc)
            let end = arc[arc.count - 1]
            let next = corners[(index + 1) % corners.count]
            let nextStart = arcPoint(next, t: 0, radius: radius)
            let dx = nextStart.x - end.x
            let dz = nextStart.z - end.z
            let length = (dx * dx + dz * dz).squareRoot()
            if length > 1e-6 {
                // Outward is 90° to the left of travel when phi increases (right-hand around +Y).
                result.append(flat(
                    from: SIMD2(end.x, end.z),
                    to: SIMD2(nextStart.x, nextStart.z),
                    normal: SIMD2(-dz / length, dx / length)
                ))
            }
        }
        return result
    }

    private static func arcPoint(
        _ corner: (cx: Double, cz: Double, a0: Double),
        t: Double,
        radius: Double
    ) -> (x: Double, z: Double, nx: Double, nz: Double) {
        let angle = corner.a0 + t * (.pi / 2)
        let nx = sin(angle)
        let nz = cos(angle)
        return (corner.cx + radius * nx, corner.cz + radius * nz, nx, nz)
    }

    private static func flat(from: SIMD2<Double>, to: SIMD2<Double>, normal: SIMD2<Double>) -> [Sample] {
        let n = MeshMath.normalize(normal)
        return [
            Sample(x: from.x, z: from.y, nx: n.x, nz: n.y, u: 0),
            Sample(x: to.x, z: to.y, nx: n.x, nz: n.y, u: 1),
        ]
    }

    private static func addSides(_ strips: [[Sample]], height: Double, into mesh: inout MeshAccumulator) {
        for strip in strips where strip.count >= 2 {
            var bottom: [UInt32] = []
            var top: [UInt32] = []
            for sample in strip {
                let normal = SIMD3(sample.nx, 0, sample.nz)
                bottom.append(mesh.add(mm: SIMD3(sample.x, 0, sample.z), normal: normal, uv: SIMD2(sample.u, 0)))
                top.append(mesh.add(mm: SIMD3(sample.x, height, sample.z), normal: normal, uv: SIMD2(sample.u, 1)))
            }
            for index in 0..<(strip.count - 1) {
                let a = bottom[index]
                let b = bottom[index + 1]
                let d = top[index]
                let c = top[index + 1]
                mesh.indices.append(contentsOf: [a, b, d, b, c, d])
            }
        }
    }

    private static func capLoop(_ strips: [[Sample]]) -> [Sample] {
        var loop: [Sample] = []
        for strip in strips where strip.count >= 2 {
            loop.append(contentsOf: strip.dropLast())
        }
        return loop
    }

    private static func addCap(
        _ loop: [Sample],
        y: Double,
        upward: Bool,
        width: Double,
        depth: Double,
        into mesh: inout MeshAccumulator
    ) {
        guard loop.count >= 3 else { return }
        let ny: Double = upward ? 1 : -1
        var ring: [UInt32] = []
        for sample in loop {
            let u = width > 0 ? sample.x / width + 0.5 : 0.5
            let v = depth > 0 ? sample.z / depth + 0.5 : 0.5
            ring.append(mesh.add(mm: SIMD3(sample.x, y, sample.z), normal: SIMD3(0, ny, 0), uv: SIMD2(u, v)))
        }
        let centre = mesh.add(mm: SIMD3(0, y, 0), normal: SIMD3(0, ny, 0), uv: SIMD2(0.5, 0.5))
        for index in 0..<ring.count {
            let i0 = ring[index]
            let i1 = ring[(index + 1) % ring.count]
            if upward {
                mesh.indices.append(contentsOf: [i0, i1, centre])
            } else {
                mesh.indices.append(contentsOf: [i0, centre, i1])
            }
        }
    }
}
