import Foundation

/// Metadata stored next to a DEBUG sample photo.
public struct MeasureSampleFilePhoto: Codable, Equatable, Sendable {
    public var angle: CaptureAngle
    public var file: String
    public var pixelWidth: Int
    public var pixelHeight: Int
    public var fx: Double
    public var fy: Double
    public var cx: Double
    public var cy: Double
    public var distanceMm: Double
    public var corners: [ImagePoint]

    public init(
        angle: CaptureAngle,
        file: String,
        pixelWidth: Int,
        pixelHeight: Int,
        fx: Double,
        fy: Double,
        cx: Double,
        cy: Double,
        distanceMm: Double,
        corners: [ImagePoint]
    ) {
        self.angle = angle
        self.file = file
        self.pixelWidth = pixelWidth
        self.pixelHeight = pixelHeight
        self.fx = fx
        self.fy = fy
        self.cx = cx
        self.cy = cy
        self.distanceMm = distanceMm
        self.corners = corners
    }
}

public struct MeasureSampleFile: Codable, Equatable, Sendable {
    public var id: String
    public var kind: PartKind
    public var widthMm: Double
    public var heightMm: Double
    public var depthMm: Double
    public var labelHe: String
    public var photos: [MeasureSampleFilePhoto]

    public init(
        id: String,
        kind: PartKind,
        widthMm: Double,
        heightMm: Double,
        depthMm: Double,
        labelHe: String,
        photos: [MeasureSampleFilePhoto]
    ) {
        self.id = id
        self.kind = kind
        self.widthMm = widthMm
        self.heightMm = heightMm
        self.depthMm = depthMm
        self.labelHe = labelHe
        self.photos = photos
    }
}

public struct MeasureSamplePhoto: Equatable, Sendable {
    public var angle: CaptureAngle
    public var fileName: String
    public var width: Int
    public var height: Int
    /// RGB, row-major, origin top-left, 3 bytes per pixel.
    public var rgb: [UInt8]
    public var intrinsics: CameraIntrinsics
    public var corners: [SIMD2<Double>]
    public var silhouette: Silhouette
    public var distanceMm: Double

    public init(
        angle: CaptureAngle,
        fileName: String,
        width: Int,
        height: Int,
        rgb: [UInt8],
        intrinsics: CameraIntrinsics,
        corners: [SIMD2<Double>],
        silhouette: Silhouette,
        distanceMm: Double
    ) {
        self.angle = angle
        self.fileName = fileName
        self.width = width
        self.height = height
        self.rgb = rgb
        self.intrinsics = intrinsics
        self.corners = corners
        self.silhouette = silhouette
        self.distanceMm = distanceMm
    }

    public var file: MeasureSampleFilePhoto {
        MeasureSampleFilePhoto(
            angle: angle,
            file: fileName,
            pixelWidth: width,
            pixelHeight: height,
            fx: intrinsics.fx,
            fy: intrinsics.fy,
            cx: intrinsics.cx,
            cy: intrinsics.cy,
            distanceMm: distanceMm,
            corners: corners.map(ImagePoint.init)
        )
    }
}

/// A rendered part standing next to an upright ID-1 card, with known true dimensions.
public struct MeasureSample: Equatable, Sendable {
    public var id: String
    public var kind: PartKind
    public var widthMm: Double
    public var heightMm: Double
    public var depthMm: Double
    public var labelHe: String
    public var photos: [MeasureSamplePhoto]

    public init(
        id: String,
        kind: PartKind,
        widthMm: Double,
        heightMm: Double,
        depthMm: Double,
        labelHe: String,
        photos: [MeasureSamplePhoto]
    ) {
        self.id = id
        self.kind = kind
        self.widthMm = widthMm
        self.heightMm = heightMm
        self.depthMm = depthMm
        self.labelHe = labelHe
        self.photos = photos
    }

    public var file: MeasureSampleFile {
        MeasureSampleFile(
            id: id,
            kind: kind,
            widthMm: widthMm,
            heightMm: heightMm,
            depthMm: depthMm,
            labelHe: labelHe,
            photos: photos.map(\.file)
        )
    }
}

/// Deterministic DEBUG scenes: a 100 mm bottle, a 25 × 30 mm cap, and a box, each beside an upright card.
public enum MeasureSampleLibrary {
    public static let bottle = MeasureSampleScene.bottle()
    public static let cap = MeasureSampleScene.cap()
    public static let box = MeasureSampleScene.box()
    public static let all = [bottle, cap, box]

    public static func sample(id: String) -> MeasureSample? {
        all.first { $0.id == id }
    }
}

enum MeasureSampleScene {
    static let width = 640
    static let height = 480
    static let distance = 250.0
    static let intrinsics = CameraIntrinsics(fx: 900, fy: 900, cx: 320, cy: 240)
    static let cardCentreX = -38.0

    static func bottle() -> MeasureSample {
        let photo = renderRound(
            angle: .side,
            fileName: "measure-bottle.jpg",
            radius: 20,
            heightMm: 100,
            axisX: 48,
            red: 36, green: 150, blue: 214
        )
        return MeasureSample(
            id: "bottle-100",
            kind: .bottle,
            widthMm: 40,
            heightMm: 100,
            depthMm: 40,
            labelHe: "בקבוק 100 מ״מ",
            photos: [photo]
        )
    }

    static func cap() -> MeasureSample {
        let side = renderRound(
            angle: .side,
            fileName: "measure-cap-side.jpg",
            radius: 12.5,
            heightMm: 30,
            axisX: 48,
            red: 214, green: 168, blue: 72
        )
        let top = renderDisk(
            angle: .top,
            fileName: "measure-cap-top.jpg",
            radius: 12.5,
            axisX: 48,
            red: 214, green: 168, blue: 72
        )
        return MeasureSample(
            id: "cap-25x30",
            kind: .cap,
            widthMm: 25,
            heightMm: 30,
            depthMm: 25,
            labelHe: "פקק 25×30 מ״מ",
            photos: [side, top]
        )
    }

    static func box() -> MeasureSample {
        let front = renderQuad(
            angle: .front,
            fileName: "measure-box-front.jpg",
            centreX: 48,
            widthMm: 76,
            heightMm: 120,
            red: 92, green: 124, blue: 86
        )
        let side = renderQuad(
            angle: .side,
            fileName: "measure-box-side.jpg",
            centreX: 55,
            widthMm: 46,
            heightMm: 120,
            red: 92, green: 124, blue: 86
        )
        return MeasureSample(
            id: "box",
            kind: .box,
            widthMm: 76,
            heightMm: 120,
            depthMm: 46,
            labelHe: "קופסה",
            photos: [front, side]
        )
    }

    private static func renderRound(
        angle: CaptureAngle,
        fileName: String,
        radius: Double,
        heightMm: Double,
        axisX: Double,
        red: UInt8,
        green: UInt8,
        blue: UInt8
    ) -> MeasureSamplePhoto {
        let mask = revolve(radius: radius, heightMm: heightMm, axisX: axisX)
        return paint(angle: angle, fileName: fileName, silhouette: mask, red: red, green: green, blue: blue)
    }

    private static func renderDisk(
        angle: CaptureAngle,
        fileName: String,
        radius: Double,
        axisX: Double,
        red: UInt8,
        green: UInt8,
        blue: UInt8
    ) -> MeasureSamplePhoto {
        var pixels = [UInt8](repeating: 0, count: width * height)
        for y in 0..<height {
            for x in 0..<width {
                let planeX = (Double(x) + 0.5 - intrinsics.cx) * distance / intrinsics.fx
                let planeY = (Double(y) + 0.5 - intrinsics.cy) * distance / intrinsics.fy
                let dx = planeX - axisX
                let dy = planeY
                if dx * dx + dy * dy <= radius * radius {
                    pixels[y * width + x] = 255
                }
            }
        }
        return paint(
            angle: angle,
            fileName: fileName,
            silhouette: Silhouette(width: width, height: height, pixels: pixels),
            red: red, green: green, blue: blue
        )
    }

    private static func renderQuad(
        angle: CaptureAngle,
        fileName: String,
        centreX: Double,
        widthMm: Double,
        heightMm: Double,
        red: UInt8,
        green: UInt8,
        blue: UInt8
    ) -> MeasureSamplePhoto {
        let hx = widthMm / 2
        let hy = heightMm / 2
        let local = [
            SIMD2(centreX - hx, -hy),
            SIMD2(centreX + hx, -hy),
            SIMD2(centreX + hx, hy),
            SIMD2(centreX - hx, hy),
        ]
        let projected = local.map { point in
            project(SIMD3(point.x, point.y, distance))
        }
        return paint(
            angle: angle,
            fileName: fileName,
            silhouette: fillQuad(projected),
            red: red, green: green, blue: blue
        )
    }

    private static func paint(
        angle: CaptureAngle,
        fileName: String,
        silhouette: Silhouette,
        red: UInt8,
        green: UInt8,
        blue: UInt8
    ) -> MeasureSamplePhoto {
        let corners = cardCorners()
        let card = fillQuad(corners)
        var rgb = [UInt8](repeating: 18, count: width * height * 3)
        for index in silhouette.pixels.indices {
            let offset = index * 3
            if card.pixels[index] != 0 {
                rgb[offset] = 248
                rgb[offset + 1] = 248
                rgb[offset + 2] = 248
            } else if silhouette.pixels[index] != 0 {
                rgb[offset] = red
                rgb[offset + 1] = green
                rgb[offset + 2] = blue
            }
        }
        return MeasureSamplePhoto(
            angle: angle,
            fileName: fileName,
            width: width,
            height: height,
            rgb: rgb,
            intrinsics: intrinsics,
            corners: corners,
            silhouette: silhouette,
            distanceMm: distance
        )
    }

    static func cardCorners() -> [SIMD2<Double>] {
        let w = CardReference.id1.widthMm / 2
        let h = CardReference.id1.heightMm / 2
        let model = [SIMD3(-w, -h, 0), SIMD3(w, -h, 0), SIMD3(w, h, 0), SIMD3(-w, h, 0)]
        return model.map { project($0 + SIMD3(cardCentreX, 0, distance)) }
    }

    private static func revolve(radius: Double, heightMm: Double, axisX: Double) -> Silhouette {
        let yTop = -heightMm / 2
        let yBottom = heightMm / 2
        let axisZ = distance - radius
        var minV = [Double](repeating: .infinity, count: width)
        var maxV = [Double](repeating: -.infinity, count: width)
        let slices = 80
        for slice in 0..<slices {
            let y = yTop + (yBottom - yTop) * Double(slice) / Double(slices - 1)
            let angles = max(180, Int(radius * 12))
            for step in 0..<angles {
                let angle = 2 * Double.pi * Double(step) / Double(angles)
                let point = SIMD3(axisX + radius * cos(angle), y, axisZ + radius * sin(angle))
                guard point.z > 1 else { continue }
                let pixel = project(point)
                let column = Int(pixel.x.rounded())
                guard column >= 0, column < width else { continue }
                minV[column] = min(minV[column], pixel.y)
                maxV[column] = max(maxV[column], pixel.y)
            }
        }
        var pixels = [UInt8](repeating: 0, count: width * height)
        for column in 0..<width where minV[column].isFinite {
            let top = max(0, Int(floor(minV[column])))
            let bottom = min(height - 1, Int(ceil(maxV[column])))
            if bottom >= top {
                for row in top...bottom {
                    pixels[row * width + column] = 255
                }
            }
        }
        return solidify(Silhouette(width: width, height: height, pixels: pixels))
    }

    /// Column samples can skip a pixel. The part is solid, so each row spans its outer edges.
    private static func solidify(_ silhouette: Silhouette) -> Silhouette {
        var pixels = silhouette.pixels
        for row in silhouette.rows() {
            let start = row.y * silhouette.width
            for x in row.left...row.right {
                pixels[start + x] = 255
            }
        }
        return Silhouette(width: silhouette.width, height: silhouette.height, pixels: pixels)
    }

    private static func fillQuad(_ corners: [SIMD2<Double>]) -> Silhouette {
        var pixels = [UInt8](repeating: 0, count: width * height)
        guard corners.count == 4 else { return Silhouette(width: width, height: height, pixels: pixels) }
        let minY = Int(floor(corners.map(\.y).min() ?? 0))
        let maxY = Int(ceil(corners.map(\.y).max() ?? 0))
        let loop = corners + [corners[0]]
        for row in max(0, minY)...min(height - 1, maxY) {
            let y = Double(row) + 0.5
            var hits: [Double] = []
            for index in 0..<4 {
                let a = loop[index]
                let b = loop[index + 1]
                if (a.y <= y && y <= b.y) || (b.y <= y && y <= a.y), abs(a.y - b.y) > 1e-9 {
                    let t = (y - a.y) / (b.y - a.y)
                    hits.append(a.x + t * (b.x - a.x))
                }
            }
            guard hits.count >= 2 else { continue }
            let left = Int(floor(hits.min()!))
            let right = Int(ceil(hits.max()!))
            for column in max(0, left)...min(width - 1, right) {
                pixels[row * width + column] = 255
            }
        }
        return Silhouette(width: width, height: height, pixels: pixels)
    }

    private static func project(_ point: SIMD3<Double>) -> SIMD2<Double> {
        SIMD2(
            intrinsics.fx * point.x / point.z + intrinsics.cx,
            intrinsics.fy * point.y / point.z + intrinsics.cy
        )
    }
}
