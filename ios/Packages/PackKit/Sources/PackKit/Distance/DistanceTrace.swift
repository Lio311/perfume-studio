import Foundation

/// One recorded distance frame. Corners are `capturedImage` pixels.
public struct DistanceTraceRow: Equatable, Sendable {
    public var time: TimeInterval
    public var corners: [SIMD2<Double>]
    public var imageWidth: Double
    public var imageHeight: Double
    public var fx: Double
    public var fy: Double
    public var cx: Double
    public var cy: Double
    public var rawZ: Double?
    public var widthOnlyZ: Double?
    public var filteredZ: Double?
    public var state: String
    public var source: String
    public var rejectedReason: String

    public init(
        time: TimeInterval,
        corners: [SIMD2<Double>],
        imageWidth: Double,
        imageHeight: Double,
        fx: Double,
        fy: Double,
        cx: Double,
        cy: Double,
        rawZ: Double?,
        widthOnlyZ: Double?,
        filteredZ: Double?,
        state: String,
        source: String,
        rejectedReason: String
    ) {
        self.time = time
        self.corners = corners
        self.imageWidth = imageWidth
        self.imageHeight = imageHeight
        self.fx = fx
        self.fy = fy
        self.cx = cx
        self.cy = cy
        self.rawZ = rawZ
        self.widthOnlyZ = widthOnlyZ
        self.filteredZ = filteredZ
        self.state = state
        self.source = source
        self.rejectedReason = rejectedReason
    }

    public init(frame: DistanceFrame, result: DistanceFrameResult) {
        let corners = result.corners.count == 4 ? result.corners : (frame.corners ?? [])
        self.init(
            time: frame.time,
            corners: corners,
            imageWidth: frame.imageSize.width,
            imageHeight: frame.imageSize.height,
            fx: frame.intrinsics.fx,
            fy: frame.intrinsics.fy,
            cx: frame.intrinsics.cx,
            cy: frame.intrinsics.cy,
            rawZ: result.rawMillimetres,
            widthOnlyZ: result.attemptedWidthOnlyMillimetres,
            filteredZ: result.filteredMillimetres,
            state: result.guide?.state.rawValue ?? "",
            source: result.source?.id ?? "",
            rejectedReason: result.rejectedReason?.rawValue ?? ""
        )
    }
}

/// CSV record of the distance pipeline, and the replay that feeds it back through.
public enum DistanceTrace {
    public static let header = "timestamp,x0,y0,x1,y1,x2,y2,x3,y3,imageWidth,imageHeight,fx,fy,cx,cy,rawZ,widthOnlyZ,filteredZ,state,source,rejectedReason"
    private static let posix = Locale(identifier: "en_US_POSIX")

    public static func format(_ rows: [DistanceTraceRow]) -> String {
        ([header] + rows.map(line)).joined(separator: "\n") + "\n"
    }

    public static func line(_ row: DistanceTraceRow) -> String {
        var fields: [String] = [number(row.time)]
        if row.corners.count == 4 {
            for corner in row.corners {
                fields.append(number(corner.x))
                fields.append(number(corner.y))
            }
        } else {
            fields.append(contentsOf: Array(repeating: "", count: 8))
        }
        fields.append(contentsOf: [
            number(row.imageWidth),
            number(row.imageHeight),
            number(row.fx),
            number(row.fy),
            number(row.cx),
            number(row.cy),
            optional(row.rawZ),
            optional(row.widthOnlyZ),
            optional(row.filteredZ),
            row.state,
            row.source,
            row.rejectedReason,
        ])
        return fields.joined(separator: ",")
    }

    public static func parse(_ csv: String) -> [DistanceTraceRow] {
        csv.split(whereSeparator: \.isNewline).compactMap { raw in
            let line = String(raw).trimmingCharacters(in: .whitespaces)
            if line.isEmpty || line.hasPrefix("timestamp,") { return nil }
            return parseLine(line)
        }
    }

    /// Runs the CSV's corners and intrinsics through the live pipeline.
    /// Recorded Z, state, and rejection columns are not inputs.
    public static func replay(
        _ csv: String,
        targetMm: Double = 200,
        halfBandMm: Double = 5
    ) -> [DistanceFrameResult] {
        var pipeline = DistancePipeline(targetMm: targetMm, halfBandMm: halfBandMm)
        return parse(csv).map { row in
            let corners: [SIMD2<Double>]? = row.corners.count == 4 ? row.corners : nil
            let frame = DistanceFrame(
                time: row.time,
                corners: corners,
                confidence: 1,
                intrinsics: CameraIntrinsics(fx: row.fx, fy: row.fy, cx: row.cx, cy: row.cy),
                imageSize: PixelSize(width: row.imageWidth, height: row.imageHeight),
                orientation: .backCameraPortrait
            )
            return pipeline.push(frame)
        }
    }

    private static func parseLine(_ line: String) -> DistanceTraceRow? {
        let fields = line.split(separator: ",", omittingEmptySubsequences: false).map(String.init)
        guard fields.count >= 21 else { return nil }
        guard let time = Double(fields[0]) else { return nil }
        var corners: [SIMD2<Double>] = []
        var complete = true
        for index in 0..<4 {
            let xText = fields[1 + index * 2]
            let yText = fields[2 + index * 2]
            if xText.isEmpty || yText.isEmpty {
                complete = false
                break
            }
            guard let x = Double(xText), let y = Double(yText) else { return nil }
            corners.append(SIMD2(x, y))
        }
        if !complete { corners = [] }
        func required(_ index: Int) -> Double? { Double(fields[index]) }
        guard let imageWidth = required(9),
              let imageHeight = required(10),
              let fx = required(11),
              let fy = required(12),
              let cx = required(13),
              let cy = required(14) else { return nil }
        return DistanceTraceRow(
            time: time,
            corners: corners,
            imageWidth: imageWidth,
            imageHeight: imageHeight,
            fx: fx,
            fy: fy,
            cx: cx,
            cy: cy,
            rawZ: optionalDouble(fields[15]),
            widthOnlyZ: optionalDouble(fields[16]),
            filteredZ: optionalDouble(fields[17]),
            state: fields[18],
            source: fields[19],
            rejectedReason: fields[20]
        )
    }

    private static func number(_ value: Double) -> String {
        String(format: "%.6f", locale: posix, value)
    }

    private static func optional(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "" }
        return number(value)
    }

    private static func optionalDouble(_ text: String) -> Double? {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }
        return Double(trimmed)
    }
}
