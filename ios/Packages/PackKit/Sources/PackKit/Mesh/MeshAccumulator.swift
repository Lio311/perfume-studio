import Foundation

/// Positions are appended in millimetres and stored in metres.
struct MeshAccumulator {
    var positions: [SIMD3<Float>] = []
    var normals: [SIMD3<Float>] = []
    var uvs: [SIMD2<Float>] = []
    var indices: [UInt32] = []

    @discardableResult
    mutating func add(mm position: SIMD3<Double>, normal: SIMD3<Double>, uv: SIMD2<Double>) -> UInt32 {
        let index = UInt32(positions.count)
        positions.append(SIMD3(Float(position.x / 1000), Float(position.y / 1000), Float(position.z / 1000)))
        let n = MeshMath.normalize(normal)
        normals.append(SIMD3(Float(n.x), Float(n.y), Float(n.z)))
        uvs.append(SIMD2(Float(uv.x), Float(uv.y)))
        return index
    }

    func mesh(material: MeshMaterial) -> Mesh {
        Mesh(positions: positions, normals: normals, uvs: uvs, indices: indices, material: material)
    }
}

enum MeshMath {
    static func normalize(_ v: SIMD3<Double>) -> SIMD3<Double> {
        let length = (v.x * v.x + v.y * v.y + v.z * v.z).squareRoot()
        if length < 1e-12 { return SIMD3(0, 1, 0) }
        return v / length
    }

    static func normalize(_ v: SIMD2<Double>) -> SIMD2<Double> {
        let length = (v.x * v.x + v.y * v.y).squareRoot()
        if length < 1e-12 { return SIMD2(1, 0) }
        return v / length
    }
}
