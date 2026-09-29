import Foundation

enum MeasureMath {
    static func polygonArea(_ points: [SIMD2<Double>]) -> Double {
        guard points.count >= 3 else { return 0 }
        var sum = 0.0
        for index in 0..<points.count {
            let next = points[(index + 1) % points.count]
            sum += points[index].x * next.y - next.x * points[index].y
        }
        return abs(sum) / 2
    }

    static func median(_ values: [Double]) -> Double {
        let sorted = values.sorted()
        let count = sorted.count
        guard count > 0 else { return 0 }
        if count % 2 == 1 { return sorted[count / 2] }
        return 0.5 * (sorted[count / 2 - 1] + sorted[count / 2])
    }

    static func mean(_ values: [Double]) -> Double {
        guard !values.isEmpty else { return 0 }
        return values.reduce(0, +) / Double(values.count)
    }

    static func standardDeviation(_ values: [Double]) -> Double {
        guard values.count >= 2 else { return 0 }
        let mid = mean(values)
        let variance = values.reduce(0) { $0 + ($1 - mid) * ($1 - mid) } / Double(values.count)
        return variance.squareRoot()
    }

    /// `u = a + b * v`.
    static func fitLine(_ samples: [(v: Double, u: Double)]) -> (a: Double, b: Double) {
        let n = Double(samples.count)
        guard n >= 2 else { return (samples.first?.u ?? 0, 0) }
        var sumV = 0.0
        var sumU = 0.0
        var sumVV = 0.0
        var sumVU = 0.0
        for sample in samples {
            sumV += sample.v
            sumU += sample.u
            sumVV += sample.v * sample.v
            sumVU += sample.v * sample.u
        }
        let denominator = n * sumVV - sumV * sumV
        if abs(denominator) < 1e-9 { return (sumU / n, 0) }
        let slope = (n * sumVU - sumV * sumU) / denominator
        let intercept = (sumU - slope * sumV) / n
        return (intercept, slope)
    }

    static func resample(_ values: [Double], count: Int) -> [Double] {
        guard count > 0 else { return [] }
        guard let first = values.first else { return Array(repeating: 0, count: count) }
        if values.count == 1 || count == 1 { return Array(repeating: first, count: count) }
        return (0..<count).map { index in
            let position = Double(index) / Double(count - 1) * Double(values.count - 1)
            let lower = Int(position)
            let fraction = position - Double(lower)
            if lower >= values.count - 1 { return values[values.count - 1] }
            return values[lower] * (1 - fraction) + values[lower + 1] * fraction
        }
    }

    /// `Mat3.inverse` returns the transpose of the inverse. This one does not.
    static func inverse(_ matrix: Mat3) -> Mat3? {
        matrix.inverse()?.transpose
    }

    static func rowMajor(_ matrix: Mat3) -> [Double] {
        [
            matrix.c0.x, matrix.c1.x, matrix.c2.x,
            matrix.c0.y, matrix.c1.y, matrix.c2.y,
            matrix.c0.z, matrix.c1.z, matrix.c2.z,
        ]
    }

    static func apply(_ rowMajor: [Double], _ point: SIMD2<Double>) -> SIMD2<Double>? {
        guard rowMajor.count == 9 else { return nil }
        let x = rowMajor[0] * point.x + rowMajor[1] * point.y + rowMajor[2]
        let y = rowMajor[3] * point.x + rowMajor[4] * point.y + rowMajor[5]
        let w = rowMajor[6] * point.x + rowMajor[7] * point.y + rowMajor[8]
        guard w.isFinite, abs(w) > 1e-12 else { return nil }
        return SIMD2(x / w, y / w)
    }

    static func hypot3(_ a: Double, _ b: Double, _ c: Double) -> Double {
        (a * a + b * b + c * c).squareRoot()
    }
}
