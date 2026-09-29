import Foundation

/// Surface of revolution matching `latheGeometry` in `src/import/lathe.ts`.
///
/// The web builds `THREE.LatheGeometry(points, 128)` after mapping each sample with
/// `y = index / (n - 1) * height` and `radius = max(0.1, sample * radius)`, then
/// inserting a centre point at the first and last height. Segment count 128 is the
/// second argument on that call. The seam column is duplicated so `u` runs 0...1.
///
/// PackKit keeps that point set for the side, then gives the top and bottom fans
/// their own vertices so the cap normal stays ±Y (a hard edge). Three's
/// `computeVertexNormals()` smooths across that crease; the task asks for the hard edge.
enum LatheMesh {
    /// `new THREE.LatheGeometry(points, 128)` in `src/import/lathe.ts`.
    static let segments = 128

    /// `Math.max(0.1, sample * radius)` in `src/import/lathe.ts`. The 0.04...1.2 clamp
    /// is applied earlier, when the pack is written (`src/scan/export/pack.ts`).
    static let minimumRadiusMm = 0.1

    static func resolvedProfile(_ lathe: [Double]?) -> [Double] {
        if let lathe, lathe.count >= 4 { return lathe }
        return Array(repeating: 1, count: LatheProfile.sampleCount)
    }

    static func radiusMm(profile: [Double], widthMm: Double, heightMm: Double, yMm: Double) -> Double {
        let samples = resolvedProfile(profile)
        guard samples.count >= 2, heightMm > 0 else {
            return max(minimumRadiusMm, (samples.first ?? 1) * widthMm / 2)
        }
        let t = min(1, max(0, yMm / heightMm))
        let scaled = t * Double(samples.count - 1)
        let lower = min(samples.count - 2, Int(scaled))
        let fraction = scaled - Double(lower)
        let sample = samples[lower] * (1 - fraction) + samples[lower + 1] * fraction
        return max(minimumRadiusMm, sample * widthMm / 2)
    }

    static func revolve(profile input: [Double], widthMm: Double, heightMm: Double, material: MeshMaterial) -> Mesh {
        let profile = resolvedProfile(input)
        let rows = profile.count
        let segments = Self.segments
        let radiusScale = widthMm / 2
        let span = Double(max(1, rows - 1))

        var radii = [Double](repeating: 0, count: rows)
        var heights = [Double](repeating: 0, count: rows)
        for row in 0..<rows {
            heights[row] = (Double(row) / span) * heightMm
            radii[row] = max(minimumRadiusMm, profile[row] * radiusScale)
        }

        let meridian = meridianNormals(radii: radii, heights: heights)
        var mesh = MeshAccumulator()
        var columns: [[UInt32]] = []
        columns.reserveCapacity(segments + 1)

        for column in 0...segments {
            let phi = (Double(column) / Double(segments)) * 2 * Double.pi
            let sine = sin(phi)
            let cosine = cos(phi)
            var indices: [UInt32] = []
            indices.reserveCapacity(rows)
            for row in 0..<rows {
                let radial = meridian[row]
                let position = SIMD3(radii[row] * sine, heights[row], radii[row] * cosine)
                let normal = SIMD3(radial.x * sine, radial.y, radial.x * cosine)
                let uv = SIMD2(Double(column) / Double(segments), Double(row) / span)
                indices.append(mesh.add(mm: position, normal: normal, uv: uv))
            }
            columns.append(indices)
        }

        if rows >= 2 {
            for column in 0..<segments {
                for row in 0..<(rows - 1) {
                    let a = columns[column][row]
                    let b = columns[column + 1][row]
                    let d = columns[column][row + 1]
                    let c = columns[column + 1][row + 1]
                    mesh.indices.append(contentsOf: [a, b, d, b, c, d])
                }
            }
        }

        addCap(row: 0, radii: radii, heights: heights, yNormal: -1, top: false, into: &mesh)
        addCap(row: rows - 1, radii: radii, heights: heights, yNormal: 1, top: true, into: &mesh)
        return mesh.mesh(material: material)
    }

    /// Length-weighted tangent normals along the profile, same `(dy, -dx)` turn as
    /// `LatheGeometry`, without the centre-cap points so the rim stays a hard edge.
    private static func meridianNormals(radii: [Double], heights: [Double]) -> [SIMD2<Double>] {
        let rows = radii.count
        guard rows >= 2 else { return [SIMD2(1, 0)] }
        func outward(_ row: Int) -> SIMD2<Double> {
            let dx = radii[row + 1] - radii[row]
            let dy = heights[row + 1] - heights[row]
            return SIMD2(dy, -dx)
        }
        return (0..<rows).map { row in
            if row == 0 { return MeshMath.normalize(outward(0)) }
            if row == rows - 1 { return MeshMath.normalize(outward(row - 1)) }
            return MeshMath.normalize(outward(row - 1) + outward(row))
        }
    }

    private static func addCap(
        row: Int,
        radii: [Double],
        heights: [Double],
        yNormal: Double,
        top: Bool,
        into mesh: inout MeshAccumulator
    ) {
        let segments = Self.segments
        let radius = radii[row]
        let y = heights[row]
        var ring: [UInt32] = []
        ring.reserveCapacity(segments + 1)
        for column in 0...segments {
            let phi = (Double(column) / Double(segments)) * 2 * Double.pi
            let sine = sin(phi)
            let cosine = cos(phi)
            let position = SIMD3(radius * sine, y, radius * cosine)
            let uv = SIMD2(0.5 + 0.5 * sine, 0.5 + 0.5 * cosine)
            ring.append(mesh.add(mm: position, normal: SIMD3(0, yNormal, 0), uv: uv))
        }
        let centre = mesh.add(mm: SIMD3(0, y, 0), normal: SIMD3(0, yNormal, 0), uv: SIMD2(0.5, 0.5))
        for column in 0..<segments {
            let i0 = ring[column]
            let i1 = ring[column + 1]
            if top {
                mesh.indices.append(contentsOf: [i0, i1, centre])
            } else {
                mesh.indices.append(contentsOf: [i0, centre, i1])
            }
        }
    }
}
