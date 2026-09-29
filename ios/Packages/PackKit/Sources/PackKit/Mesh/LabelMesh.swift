import Foundation

/// A label is a plane. On a pack that also has a bottle it becomes a band on the +Z side,
/// offset along the radius so it does not z-fight the glass.
enum LabelMesh {
    static let verticalSteps = 8
    static let angularSteps = 16

    static func plane(widthMm: Double, heightMm: Double, offsetMm: Double, material: MeshMaterial) -> Mesh {
        let half = widthMm / 2
        let z = offsetMm
        var mesh = MeshAccumulator()
        let v0 = mesh.add(mm: SIMD3(-half, 0, z), normal: SIMD3(0, 0, 1), uv: SIMD2(0, 0))
        let v1 = mesh.add(mm: SIMD3(half, 0, z), normal: SIMD3(0, 0, 1), uv: SIMD2(1, 0))
        let v2 = mesh.add(mm: SIMD3(half, heightMm, z), normal: SIMD3(0, 0, 1), uv: SIMD2(1, 1))
        let v3 = mesh.add(mm: SIMD3(-half, heightMm, z), normal: SIMD3(0, 0, 1), uv: SIMD2(0, 1))
        mesh.indices.append(contentsOf: [v0, v1, v2, v0, v2, v3])
        return mesh.mesh(material: material)
    }

    static func band(
        bottleWidthMm: Double,
        bottleHeightMm: Double,
        profile: [Double],
        labelWidthMm: Double,
        labelHeightMm: Double,
        offsetMm: Double,
        material: MeshMaterial
    ) -> Mesh {
        let rows = verticalSteps
        let columns = angularSteps
        var y0 = bottleHeightMm / 2 - labelHeightMm / 2
        var y1 = y0 + labelHeightMm
        if labelHeightMm <= bottleHeightMm, bottleHeightMm > 0 {
            y0 = min(max(0, y0), bottleHeightMm - labelHeightMm)
            y1 = y0 + labelHeightMm
        }
        let midY = (y0 + y1) / 2
        let midRadius = LatheMesh.radiusMm(
            profile: profile,
            widthMm: bottleWidthMm,
            heightMm: bottleHeightMm,
            yMm: midY
        )
        let arc = min(.pi, labelWidthMm / max(midRadius, LatheMesh.minimumRadiusMm))
        var mesh = MeshAccumulator()
        var grid: [[UInt32]] = []
        for row in 0...rows {
            let v = Double(row) / Double(rows)
            let y = y0 + (y1 - y0) * v
            let radius = LatheMesh.radiusMm(
                profile: profile,
                widthMm: bottleWidthMm,
                heightMm: bottleHeightMm,
                yMm: y
            ) + offsetMm
            var line: [UInt32] = []
            for column in 0...columns {
                let u = Double(column) / Double(columns)
                let phi = -arc / 2 + arc * u
                let sine = sin(phi)
                let cosine = cos(phi)
                line.append(mesh.add(
                    mm: SIMD3(radius * sine, y, radius * cosine),
                    normal: SIMD3(sine, 0, cosine),
                    uv: SIMD2(u, v)
                ))
            }
            grid.append(line)
        }
        for row in 0..<rows {
            for column in 0..<columns {
                let a = grid[row][column]
                let b = grid[row][column + 1]
                let d = grid[row + 1][column]
                let c = grid[row + 1][column + 1]
                mesh.indices.append(contentsOf: [a, b, d, b, c, d])
            }
        }
        return mesh.mesh(material: material)
    }
}
