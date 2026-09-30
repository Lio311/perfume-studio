import Foundation

public struct PinholeIntrinsics: Equatable, Sendable {
    public var fx: Double
    public var fy: Double
    public var cx: Double
    public var cy: Double

    public init(fx: Double, fy: Double, cx: Double, cy: Double) {
        self.fx = fx
        self.fy = fy
        self.cx = cx
        self.cy = cy
    }
}

public struct CapturePhoto: Equatable, Sendable {
    public var file: String?
    /// Image pixels, origin top-left, or normalized 0...1 when every component is in that range.
    /// Order: top-left, top-right, bottom-right, bottom-left.
    public var cardCorners: [Vec2]
    public var intrinsics: PinholeIntrinsics?
    public var imageWidth: Double?
    public var imageHeight: Double?

    public init(
        file: String? = nil,
        cardCorners: [Vec2] = [],
        intrinsics: PinholeIntrinsics? = nil,
        imageWidth: Double? = nil,
        imageHeight: Double? = nil
    ) {
        self.file = file
        self.cardCorners = cardCorners
        self.intrinsics = intrinsics
        self.imageWidth = imageWidth
        self.imageHeight = imageHeight
    }
}

/// Tolerant view of the iPhone M8 `capture.json`. Unknown keys are ignored.
public struct CaptureManifest: Equatable, Sendable {
    public var partId: String?
    public var kind: String?
    public var heightMm: Double?
    public var widthMm: Double?
    public var depthMm: Double?
    public var photos: [CapturePhoto]

    public init(
        partId: String? = nil,
        kind: String? = nil,
        heightMm: Double? = nil,
        widthMm: Double? = nil,
        depthMm: Double? = nil,
        photos: [CapturePhoto] = []
    ) {
        self.partId = partId
        self.kind = kind
        self.heightMm = heightMm
        self.widthMm = widthMm
        self.depthMm = depthMm
        self.photos = photos
    }
}

public struct CaptureDecodeResult: Equatable, Sendable {
    public var manifest: CaptureManifest
    public var warnings: [String]

    public init(manifest: CaptureManifest, warnings: [String]) {
        self.manifest = manifest
        self.warnings = warnings
    }
}

public struct CaptureDecodeError: Equatable, Error {
    public var message: String

    public init(message: String) {
        self.message = message
    }
}

public enum CaptureManifestDecoder {
    public static func decode(_ data: Data) -> Result<CaptureDecodeResult, CaptureDecodeError> {
        guard !data.isEmpty else {
            return .failure(CaptureDecodeError(message: bilingual(
                "שגיאה: capture.json ריק.",
                "Error: capture.json is empty."
            )))
        }
        let object: Any
        do {
            object = try JSONSerialization.jsonObject(with: data)
        } catch {
            return .failure(CaptureDecodeError(message: bilingual(
                "שגיאה: capture.json אינו JSON תקין.",
                "Error: capture.json is not valid JSON."
            )))
        }
        guard let root = object as? [String: Any] else {
            return .failure(CaptureDecodeError(message: bilingual(
                "שגיאה: capture.json חייב להיות אובייקט JSON.",
                "Error: capture.json must be a JSON object."
            )))
        }

        var warnings: [String] = []
        var manifest = CaptureManifest()
        manifest.partId = firstString(root, keys: ["partId", "partID", "id"])
        if let kind = firstString(root, keys: ["kind"]) {
            manifest.kind = kind
        } else if root["kind"] != nil {
            warnings.append(bilingual(
                "אזהרה: השדה kind ב-capture.json אינו מחרוזת ודולג.",
                "Warning: capture.json kind is not a string and was skipped."
            ))
        }

        applyDimensions(root["dimensionsMm"] ?? root["dimensions"] ?? root["dims"], to: &manifest, warnings: &warnings)
        if let height = finitePositive(root["heightMm"]) { manifest.heightMm = height }
        if let width = finitePositive(root["widthMm"]) { manifest.widthMm = width }
        if let depth = finitePositive(root["depthMm"]) { manifest.depthMm = depth }
        if root["heightMm"] != nil && finitePositive(root["heightMm"]) == nil {
            warnings.append(skipped("heightMm"))
        }
        if root["widthMm"] != nil && finitePositive(root["widthMm"]) == nil {
            warnings.append(skipped("widthMm"))
        }
        if root["depthMm"] != nil && finitePositive(root["depthMm"]) == nil {
            warnings.append(skipped("depthMm"))
        }

        if let photos = root["photos"] as? [Any] {
            for (index, item) in photos.enumerated() {
                guard let photo = item as? [String: Any] else {
                    warnings.append(bilingual(
                        "אזהרה: photos[\(index)] אינו אובייקט ודולג.",
                        "Warning: photos[\(index)] is not an object and was skipped."
                    ))
                    continue
                }
                manifest.photos.append(decodePhoto(photo, index: index, warnings: &warnings))
            }
        } else if root["photos"] != nil {
            warnings.append(bilingual(
                "אזהרה: photos ב-capture.json אינו מערך ודולג.",
                "Warning: capture.json photos is not an array and was skipped."
            ))
        }

        return .success(CaptureDecodeResult(manifest: manifest, warnings: warnings))
    }

    private static func decodePhoto(_ photo: [String: Any], index: Int, warnings: inout [String]) -> CapturePhoto {
        var decoded = CapturePhoto()
        decoded.file = firstString(photo, keys: ["file", "filename", "name", "url"])
        decoded.imageWidth = finitePositive(photo["imageWidth"] ?? photo["width"])
        decoded.imageHeight = finitePositive(photo["imageHeight"] ?? photo["height"])
        if let raw = photo["intrinsics"] {
            if let intrinsics = decodeIntrinsics(raw) {
                decoded.intrinsics = intrinsics
            } else {
                warnings.append(bilingual(
                    "אזהרה: intrinsics בתמונה \(index) לא זוהו ודולגו.",
                    "Warning: intrinsics on photo \(index) were not understood and were skipped."
                ))
            }
        }
        let cornersRaw = photo["cardCorners"] ?? photo["corners"]
        if let cornersRaw {
            let parsed = decodeCorners(cornersRaw)
            if parsed.count >= 4 {
                if parsed.count > 4 {
                    warnings.append(bilingual(
                        "אזהרה: לתמונה \(index) יש יותר מ-4 פינות כרטיס. נעשה שימוש בארבע הראשונות.",
                        "Warning: photo \(index) has more than 4 card corners. The first four are used."
                    ))
                }
                decoded.cardCorners = Array(parsed.prefix(4))
            } else if !parsed.isEmpty || !(cornersRaw is [Any] && (cornersRaw as? [Any])?.isEmpty == true) {
                warnings.append(bilingual(
                    "אזהרה: פינות הכרטיס בתמונה \(index) אינן ארבע נקודות ודולגו.",
                    "Warning: card corners on photo \(index) are not four points and were skipped."
                ))
            }
        }
        return decoded
    }

    private static func decodeCorners(_ raw: Any) -> [Vec2] {
        guard let items = raw as? [Any] else { return [] }
        return items.compactMap(decodePoint)
    }

    private static func decodePoint(_ raw: Any) -> Vec2? {
        if let pair = raw as? [Any], pair.count >= 2, let x = finite(pair[0]), let y = finite(pair[1]) {
            return Vec2(x, y)
        }
        if let dict = raw as? [String: Any] {
            let xRaw = dict["x"] ?? dict["u"] ?? dict["X"]
            let yRaw = dict["y"] ?? dict["v"] ?? dict["Y"]
            if let x = finite(xRaw as Any), let y = finite(yRaw as Any) {
                return Vec2(x, y)
            }
        }
        return nil
    }

    private static func decodeIntrinsics(_ raw: Any) -> PinholeIntrinsics? {
        if let dict = raw as? [String: Any],
           let fx = finitePositive(dict["fx"]),
           let fy = finitePositive(dict["fy"]),
           let cx = finite(dict["cx"]),
           let cy = finite(dict["cy"]) {
            return PinholeIntrinsics(fx: fx, fy: fy, cx: cx, cy: cy)
        }
        if let rows = raw as? [Any], rows.count == 3,
           let r0 = rows[0] as? [Any], r0.count >= 3,
           let r1 = rows[1] as? [Any], r1.count >= 3,
           let fx = finitePositive(r0[0]),
           let cx = finite(r0[2]),
           let fy = finitePositive(r1[1]),
           let cy = finite(r1[2]) {
            return PinholeIntrinsics(fx: fx, fy: fy, cx: cx, cy: cy)
        }
        return nil
    }

    private static func applyDimensions(_ raw: Any?, to manifest: inout CaptureManifest, warnings: inout [String]) {
        guard let raw else { return }
        guard let dict = raw as? [String: Any] else {
            warnings.append(bilingual(
                "אזהרה: אובייקט המידות ב-capture.json אינו אובייקט ודולג.",
                "Warning: the dimensions object in capture.json is not an object and was skipped."
            ))
            return
        }
        if let height = finitePositive(dict["heightMm"] ?? dict["height"]) { manifest.heightMm = height }
        if let width = finitePositive(dict["widthMm"] ?? dict["width"]) { manifest.widthMm = width }
        if let depth = finitePositive(dict["depthMm"] ?? dict["depth"]) { manifest.depthMm = depth }
    }

    private static func firstString(_ dict: [String: Any], keys: [String]) -> String? {
        for key in keys {
            if let value = dict[key] as? String {
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { return trimmed }
            }
        }
        return nil
    }

    private static func finite(_ raw: Any?) -> Double? {
        guard let raw else { return nil }
        if raw is Bool { return nil }
        if let value = raw as? Double, value.isFinite { return value }
        if let value = raw as? Int { return Double(value) }
        if let value = raw as? NSNumber {
            let number = value.doubleValue
            return number.isFinite ? number : nil
        }
        if let text = raw as? String {
            let value = Double(text.trimmingCharacters(in: .whitespacesAndNewlines))
            if let value, value.isFinite { return value }
        }
        return nil
    }

    private static func finitePositive(_ raw: Any?) -> Double? {
        guard let value = finite(raw), value > 0 else { return nil }
        return value
    }

    private static func skipped(_ key: String) -> String {
        bilingual(
            "אזהרה: השדה \(key) ב-capture.json אינו מספר חיובי ודולג.",
            "Warning: capture.json \(key) is not a positive number and was skipped."
        )
    }

    private static func bilingual(_ he: String, _ en: String) -> String {
        he + "\n" + en
    }
}
