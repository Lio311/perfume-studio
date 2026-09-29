import Foundation

public struct OutputFiles: Equatable, Sendable {
    public var usdz: String
    public var scaledUsdz: String
    public var glb: String
    public var obj: String
    public var report: String

    public init(usdz: String, scaledUsdz: String, glb: String, obj: String, report: String) {
        self.usdz = usdz
        self.scaledUsdz = scaledUsdz
        self.glb = glb
        self.obj = obj
        self.report = report
    }

    public static func files(name: String) -> OutputFiles {
        OutputFiles(
            usdz: "\(name).usdz",
            scaledUsdz: "\(name)-scaled.usdz",
            glb: "\(name).glb",
            obj: "\(name).obj",
            report: "report.json"
        )
    }
}

public enum ModelName {
    public static func sanitize(_ raw: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        let mapped = String(raw.unicodeScalars.map { scalar in
            allowed.contains(scalar) ? Character(scalar) : "-"
        })
        var collapsed = mapped
        while collapsed.contains("--") {
            collapsed = collapsed.replacingOccurrences(of: "--", with: "-")
        }
        let trimmed = collapsed.trimmingCharacters(in: CharacterSet(charactersIn: "-_."))
        return trimmed.isEmpty ? "model" : trimmed
    }

    public static func resolve(flag: String?, partId: String?, folderName: String) -> String {
        if let flag {
            let trimmed = flag.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { return sanitize(trimmed) }
        }
        if let partId {
            let trimmed = partId.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { return sanitize(trimmed) }
        }
        return sanitize(folderName)
    }
}
