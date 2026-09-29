import Foundation

// Camera frame used by the pose solver: X right, Y down, Z forward (the optical axis).
// A fronto-parallel card has its centre at (tx, ty, Z) and its normal along ±Z.

struct Mat3: Equatable {
    var c0: SIMD3<Double>
    var c1: SIMD3<Double>
    var c2: SIMD3<Double>

    static let identity = Mat3(c0: SIMD3(1, 0, 0), c1: SIMD3(0, 1, 0), c2: SIMD3(0, 0, 1))

    func column(_ index: Int) -> SIMD3<Double> {
        switch index {
        case 0: return c0
        case 1: return c1
        default: return c2
        }
    }

    var determinant: Double {
        dot(c0, cross(c1, c2))
    }

    var transpose: Mat3 {
        Mat3(
            c0: SIMD3(c0.x, c1.x, c2.x),
            c1: SIMD3(c0.y, c1.y, c2.y),
            c2: SIMD3(c0.z, c1.z, c2.z)
        )
    }

    func inverse() -> Mat3? {
        let det = determinant
        guard det.isFinite, abs(det) > 1e-12 else { return nil }
        let invDet = 1 / det
        return Mat3(
            c0: cross(c1, c2) * invDet,
            c1: cross(c2, c0) * invDet,
            c2: cross(c0, c1) * invDet
        )
    }

    static func * (lhs: Mat3, rhs: Mat3) -> Mat3 {
        Mat3(c0: lhs * rhs.c0, c1: lhs * rhs.c1, c2: lhs * rhs.c2)
    }

    static func * (lhs: Mat3, rhs: SIMD3<Double>) -> SIMD3<Double> {
        lhs.c0 * rhs.x + lhs.c1 * rhs.y + lhs.c2 * rhs.z
    }

    static func * (lhs: Mat3, rhs: Double) -> Mat3 {
        Mat3(c0: lhs.c0 * rhs, c1: lhs.c1 * rhs, c2: lhs.c2 * rhs)
    }

    static func + (lhs: Mat3, rhs: Mat3) -> Mat3 {
        Mat3(c0: lhs.c0 + rhs.c0, c1: lhs.c1 + rhs.c1, c2: lhs.c2 + rhs.c2)
    }
}

func dot(_ a: SIMD3<Double>, _ b: SIMD3<Double>) -> Double {
    a.x * b.x + a.y * b.y + a.z * b.z
}

func cross(_ a: SIMD3<Double>, _ b: SIMD3<Double>) -> SIMD3<Double> {
    SIMD3(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x
    )
}

func length(_ a: SIMD3<Double>) -> Double {
    dot(a, a).squareRoot()
}

func length2(_ a: SIMD2<Double>) -> Double {
    (a.x * a.x + a.y * a.y).squareRoot()
}

enum PoseMath {
    static func modelCorners(_ reference: CardReference) -> [SIMD3<Double>] {
        let w = reference.widthMm / 2
        let h = reference.heightMm / 2
        return [
            SIMD3(-w, -h, 0),
            SIMD3(w, -h, 0),
            SIMD3(w, h, 0),
            SIMD3(-w, h, 0),
        ]
    }

    static func intrinsicsMatrix(_ k: CameraIntrinsics) -> Mat3 {
        Mat3(c0: SIMD3(k.fx, 0, 0), c1: SIMD3(0, k.fy, 0), c2: SIMD3(k.cx, k.cy, 1))
    }

    static func project(_ point: SIMD3<Double>, rotation: Mat3, translation: SIMD3<Double>, intrinsics: CameraIntrinsics) -> SIMD2<Double>? {
        let camera = rotation * point + translation
        guard camera.z > 1e-6 else { return nil }
        return SIMD2(
            intrinsics.fx * camera.x / camera.z + intrinsics.cx,
            intrinsics.fy * camera.y / camera.z + intrinsics.cy
        )
    }

    static func rodrigues(_ w: SIMD3<Double>) -> Mat3 {
        let theta2 = dot(w, w)
        if theta2 < 1e-16 {
            return Mat3(
                c0: SIMD3(1, w.z, -w.y),
                c1: SIMD3(-w.z, 1, w.x),
                c2: SIMD3(w.y, -w.x, 1)
            )
        }
        let theta = theta2.squareRoot()
        let k = w / theta
        let s = sin(theta)
        let c = cos(theta)
        let skew = Mat3(
            c0: SIMD3(0, k.z, -k.y),
            c1: SIMD3(-k.z, 0, k.x),
            c2: SIMD3(k.y, -k.x, 0)
        )
        let outer = Mat3(
            c0: k * k.x,
            c1: k * k.y,
            c2: k * k.z
        )
        return Mat3.identity * c + outer * (1 - c) + skew * s
    }

    static func rodriguesInverse(_ rotation: Mat3) -> SIMD3<Double> {
        let trace = rotation.c0.x + rotation.c1.y + rotation.c2.z
        let theta = acos(min(1, max(-1, (trace - 1) / 2)))
        let vee = SIMD3(
            rotation.c1.z - rotation.c2.y,
            rotation.c2.x - rotation.c0.z,
            rotation.c0.y - rotation.c1.x
        )
        if theta < 1e-8 { return vee / 2 }
        return vee * (theta / (2 * sin(theta)))
    }

    static func closestRotation(_ matrix: Mat3) -> Mat3 {
        let (u, _, vt) = svd3(matrix)
        var rotation = u * vt
        if rotation.determinant < 0 {
            var flipped = u
            flipped.c2 = flipped.c2 * -1
            rotation = flipped * vt
        }
        return rotation
    }

    /// Direct linear transform. `source` is the card plane (mm), `destination` is the image (px).
    static func homography(from source: [SIMD2<Double>], to destination: [SIMD2<Double>]) -> Mat3? {
        guard source.count == 4, destination.count == 4 else { return nil }
        let src = normalize(source)
        let dst = normalize(destination)
        var rows = Array(repeating: Array(repeating: 0.0, count: 9), count: 8)
        for index in 0..<4 {
            let x = src.points[index].x
            let y = src.points[index].y
            let u = dst.points[index].x
            let v = dst.points[index].y
            rows[2 * index] = [-x, -y, -1, 0, 0, 0, u * x, u * y, u]
            rows[2 * index + 1] = [0, 0, 0, -x, -y, -1, v * x, v * y, v]
        }
        guard let h = smallestEigenvector(gram(rows)), h.count == 9 else { return nil }
        let normalized = Mat3(
            c0: SIMD3(h[0], h[3], h[6]),
            c1: SIMD3(h[1], h[4], h[7]),
            c2: SIMD3(h[2], h[5], h[8])
        )
        guard let dstInverse = dst.transform.inverse() else { return nil }
        let homography = dstInverse * normalized * src.transform
        guard homography.c0.x.isFinite else { return nil }
        return homography
    }

    static func poseCandidates(homography: Mat3, intrinsics: CameraIntrinsics) -> [(rotation: Mat3, translation: SIMD3<Double>)] {
        guard let kInverse = intrinsicsMatrix(intrinsics).inverse() else { return [] }
        let m = kInverse * homography
        var poses: [(Mat3, SIMD3<Double>)] = []
        for sign in [1.0, -1.0] {
            let scaled = m * sign
            let n1 = length(scaled.c0)
            let n2 = length(scaled.c1)
            guard n1 > 1e-9, n2 > 1e-9 else { continue }
            let norm = (n1 + n2) / 2
            let r1 = scaled.c0 / norm
            let r2 = scaled.c1 / norm
            let r3 = cross(r1, r2)
            let translation = scaled.c2 / norm
            let rotation = closestRotation(Mat3(c0: r1, c1: r2, c2: r3))
            guard translation.z.isFinite, rotation.c0.x.isFinite else { continue }
            poses.append((rotation, translation))
            poses.append((rotation * -1, translation * -1))
        }
        return poses
    }

    struct Pose {
        var rotation: Mat3
        var translation: SIMD3<Double>
        var rmse: Double
    }

    static func refine(
        rotation: Mat3,
        translation: SIMD3<Double>,
        objectPoints: [SIMD3<Double>],
        imagePoints: [SIMD2<Double>],
        intrinsics: CameraIntrinsics
    ) -> Pose? {
        var w = rodriguesInverse(rotation)
        var t = translation
        guard w.x.isFinite, t.x.isFinite else { return nil }
        var lambda = 1e-2
        var best = residualSum(w: w, t: t, objectPoints: objectPoints, imagePoints: imagePoints, intrinsics: intrinsics)
        guard best.isFinite else { return nil }
        let steps: [Double] = [1e-6, 1e-6, 1e-6, 1e-3, 1e-3, 1e-3]
        for _ in 0..<16 {
            if best < 1e-6 { break }
            var jacobian = Array(repeating: Array(repeating: 0.0, count: 6), count: 8)
            let base = residualVector(w: w, t: t, objectPoints: objectPoints, imagePoints: imagePoints, intrinsics: intrinsics)
            for column in 0..<6 {
                var w2 = w
                var t2 = t
                switch column {
                case 0: w2.x += steps[column]
                case 1: w2.y += steps[column]
                case 2: w2.z += steps[column]
                case 3: t2.x += steps[column]
                case 4: t2.y += steps[column]
                default: t2.z += steps[column]
                }
                let bumped = residualVector(w: w2, t: t2, objectPoints: objectPoints, imagePoints: imagePoints, intrinsics: intrinsics)
                for row in 0..<8 {
                    jacobian[row][column] = (bumped[row] - base[row]) / steps[column]
                }
            }
            var columnScale = [Double](repeating: 1, count: 6)
            for column in 0..<6 {
                var sum = 0.0
                for row in 0..<8 { sum += jacobian[row][column] * jacobian[row][column] }
                columnScale[column] = max(sum.squareRoot(), 1e-12)
                for row in 0..<8 { jacobian[row][column] /= columnScale[column] }
            }
            var normal = Array(repeating: Array(repeating: 0.0, count: 6), count: 6)
            var right = [Double](repeating: 0, count: 6)
            for row in 0..<8 {
                for column in 0..<6 {
                    right[column] += jacobian[row][column] * base[row]
                    for other in 0..<6 {
                        normal[column][other] += jacobian[row][column] * jacobian[row][other]
                    }
                }
            }
            for column in 0..<6 { normal[column][column] += lambda }
            guard var delta = solve(normal, right.map { -$0 }) else {
                lambda = min(lambda * 10, 1e8)
                continue
            }
            for column in 0..<6 { delta[column] /= columnScale[column] }
            let stepW = SIMD3(delta[0], delta[1], delta[2])
            let stepT = SIMD3(delta[3], delta[4], delta[5])
            if length(stepW) > 0.6 || length(stepT) > 80 {
                lambda = min(lambda * 10, 1e8)
                continue
            }
            let trialW = w + stepW
            let trialT = t + stepT
            let trial = residualSum(w: trialW, t: trialT, objectPoints: objectPoints, imagePoints: imagePoints, intrinsics: intrinsics)
            if trial.isFinite, trial < best {
                w = trialW
                t = trialT
                best = trial
                lambda = max(lambda / 10, 1e-8)
            } else {
                lambda = min(lambda * 10, 1e8)
            }
        }
        guard t.z > 1, best.isFinite else { return nil }
        return Pose(rotation: rodrigues(w), translation: t, rmse: (best / 8).squareRoot())
    }

    static func widthOnlyDepth(imagePoints: [SIMD2<Double>], widthMm: Double, fx: Double) -> Double? {
        guard imagePoints.count == 4, fx > 0, widthMm > 0 else { return nil }
        let top = length2(imagePoints[1] - imagePoints[0])
        let bottom = length2(imagePoints[2] - imagePoints[3])
        let pixels = (top + bottom) / 2
        guard pixels > 1 else { return nil }
        return fx * widthMm / pixels
    }

    static func tiltDegrees(_ rotation: Mat3) -> Double {
        let cosine = min(1, max(0, abs(rotation.c2.z)))
        return acos(cosine) * 180 / .pi
    }

    static func cycles(_ points: [SIMD2<Double>]) -> [[SIMD2<Double>]] {
        guard points.count == 4 else { return [] }
        return (0..<4).map { shift in
            (0..<4).map { points[($0 + shift) % 4] }
        }
    }

    private static func residualVector(
        w: SIMD3<Double>,
        t: SIMD3<Double>,
        objectPoints: [SIMD3<Double>],
        imagePoints: [SIMD2<Double>],
        intrinsics: CameraIntrinsics
    ) -> [Double] {
        let rotation = rodrigues(w)
        var values = [Double](repeating: 1000, count: 8)
        for index in 0..<4 {
            guard let projected = project(objectPoints[index], rotation: rotation, translation: t, intrinsics: intrinsics) else { continue }
            values[2 * index] = projected.x - imagePoints[index].x
            values[2 * index + 1] = projected.y - imagePoints[index].y
        }
        return values
    }

    private static func residualSum(
        w: SIMD3<Double>,
        t: SIMD3<Double>,
        objectPoints: [SIMD3<Double>],
        imagePoints: [SIMD2<Double>],
        intrinsics: CameraIntrinsics
    ) -> Double {
        residualVector(w: w, t: t, objectPoints: objectPoints, imagePoints: imagePoints, intrinsics: intrinsics)
            .reduce(0) { $0 + $1 * $1 }
    }

    private struct NormalizedPoints {
        var points: [SIMD2<Double>]
        var transform: Mat3
    }

    private static func normalize(_ points: [SIMD2<Double>]) -> NormalizedPoints {
        var mean = SIMD2<Double>(repeating: 0)
        for point in points { mean += point }
        mean /= Double(points.count)
        var distance = 0.0
        for point in points { distance += length2(point - mean) }
        let scale = (2.0).squareRoot() * Double(points.count) / max(distance, 1e-9)
        let transform = Mat3(
            c0: SIMD3(scale, 0, 0),
            c1: SIMD3(0, scale, 0),
            c2: SIMD3(-scale * mean.x, -scale * mean.y, 1)
        )
        let normalized = points.map { point in
            SIMD2(scale * (point.x - mean.x), scale * (point.y - mean.y))
        }
        return NormalizedPoints(points: normalized, transform: transform)
    }

    private static func gram(_ rows: [[Double]]) -> [[Double]] {
        let cols = rows[0].count
        var matrix = Array(repeating: Array(repeating: 0.0, count: cols), count: cols)
        for column in 0..<cols {
            for other in column..<cols {
                var sum = 0.0
                for row in rows { sum += row[column] * row[other] }
                matrix[column][other] = sum
                matrix[other][column] = sum
            }
        }
        return matrix
    }

    private static func smallestEigenvector(_ matrix: [[Double]]) -> [Double]? {
        let (values, vectors) = jacobi(matrix)
        guard let index = values.enumerated().min(by: { $0.element < $1.element })?.offset else { return nil }
        return (0..<vectors.count).map { vectors[$0][index] }
    }

    /// Symmetric Jacobi. Returns eigenvalues and a matrix whose columns are eigenvectors.
    private static func jacobi(_ original: [[Double]]) -> (values: [Double], vectors: [[Double]]) {
        let n = original.count
        var a = original
        var vectors = Array(repeating: Array(repeating: 0.0, count: n), count: n)
        for index in 0..<n { vectors[index][index] = 1 }
        for _ in 0..<40 {
            var pivotRow = 0
            var pivotCol = 1
            var largest = 0.0
            for row in 0..<n {
                for col in (row + 1)..<n where abs(a[row][col]) > largest {
                    largest = abs(a[row][col])
                    pivotRow = row
                    pivotCol = col
                }
            }
            if largest < 1e-14 { break }
            let app = a[pivotRow][pivotRow]
            let aqq = a[pivotCol][pivotCol]
            let apq = a[pivotRow][pivotCol]
            let tau = (aqq - app) / (2 * apq)
            let tangent: Double
            if tau >= 0 {
                tangent = 1 / (tau + (1 + tau * tau).squareRoot())
            } else {
                tangent = -1 / (-tau + (1 + tau * tau).squareRoot())
            }
            let cosine = 1 / (1 + tangent * tangent).squareRoot()
            let sine = tangent * cosine
            for k in 0..<n where k != pivotRow && k != pivotCol {
                let aik = a[k][pivotRow]
                let akq = a[k][pivotCol]
                a[k][pivotRow] = cosine * aik - sine * akq
                a[pivotRow][k] = a[k][pivotRow]
                a[k][pivotCol] = sine * aik + cosine * akq
                a[pivotCol][k] = a[k][pivotCol]
            }
            a[pivotRow][pivotRow] = cosine * cosine * app - 2 * sine * cosine * apq + sine * sine * aqq
            a[pivotCol][pivotCol] = sine * sine * app + 2 * sine * cosine * apq + cosine * cosine * aqq
            a[pivotRow][pivotCol] = 0
            a[pivotCol][pivotRow] = 0
            for k in 0..<n {
                let vip = vectors[k][pivotRow]
                let viq = vectors[k][pivotCol]
                vectors[k][pivotRow] = cosine * vip - sine * viq
                vectors[k][pivotCol] = sine * vip + cosine * viq
            }
        }
        return ((0..<n).map { a[$0][$0] }, vectors)
    }

    private static func svd3(_ matrix: Mat3) -> (u: Mat3, s: SIMD3<Double>, vt: Mat3) {
        let ata = matrix.transpose * matrix
        let entries = [
            [ata.c0.x, ata.c1.x, ata.c2.x],
            [ata.c0.y, ata.c1.y, ata.c2.y],
            [ata.c0.z, ata.c1.z, ata.c2.z],
        ]
        let (values, vectors) = jacobi(entries)
        var order = [0, 1, 2]
        order.sort { values[$0] > values[$1] }
        let singular = SIMD3(
            max(0, values[order[0]]).squareRoot(),
            max(0, values[order[1]]).squareRoot(),
            max(0, values[order[2]]).squareRoot()
        )
        func column(_ index: Int) -> SIMD3<Double> {
            let row = order[index]
            return SIMD3(vectors[0][row], vectors[1][row], vectors[2][row])
        }
        let v = Mat3(c0: column(0), c1: column(1), c2: column(2))
        func uColumn(_ index: Int, vColumn: SIMD3<Double>) -> SIMD3<Double> {
            let sigma = singular[index]
            let mapped = matrix * vColumn
            if sigma > 1e-12 { return mapped / sigma }
            return length(mapped) > 0 ? mapped / length(mapped) : SIMD3(index == 0 ? 1 : 0, index == 1 ? 1 : 0, index == 2 ? 1 : 0)
        }
        var u = Mat3(c0: uColumn(0, vColumn: v.c0), c1: uColumn(1, vColumn: v.c1), c2: uColumn(2, vColumn: v.c2))
        if u.determinant < 0 { u.c2 = u.c2 * -1 }
        return (u, singular, v.transpose)
    }

    private static func solve(_ matrix: [[Double]], _ rhs: [Double]) -> [Double]? {
        let n = rhs.count
        var a = matrix
        var b = rhs
        for column in 0..<n {
            var pivot = column
            var best = abs(a[column][column])
            for row in (column + 1)..<n where abs(a[row][column]) > best {
                best = abs(a[row][column])
                pivot = row
            }
            if best < 1e-14 { return nil }
            if pivot != column {
                a.swapAt(column, pivot)
                b.swapAt(column, pivot)
            }
            for row in (column + 1)..<n {
                let factor = a[row][column] / a[column][column]
                b[row] -= factor * b[column]
                for other in column..<n { a[row][other] -= factor * a[column][other] }
            }
        }
        var solution = [Double](repeating: 0, count: n)
        for row in stride(from: n - 1, through: 0, by: -1) {
            var sum = b[row]
            for column in (row + 1)..<n { sum -= a[row][column] * solution[column] }
            solution[row] = sum / a[row][row]
        }
        return solution.allSatisfy(\.isFinite) ? solution : nil
    }
}
