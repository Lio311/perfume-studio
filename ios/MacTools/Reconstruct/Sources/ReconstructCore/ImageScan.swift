import Foundation

public struct ImageFolderScanResult: Equatable, Sendable {
    public var readable: [URL]
    public var unreadable: [URL]
    public var directoryUnreadable: Bool

    public init(readable: [URL], unreadable: [URL], directoryUnreadable: Bool) {
        self.readable = readable
        self.unreadable = unreadable
        self.directoryUnreadable = directoryUnreadable
    }
}

public enum ImageFolderScan {
    public static let supportedExtensions: Set<String> = ["heic", "heif", "jpg", "jpeg"]

    public static func scan(directory: URL, isReadable: (URL) -> Bool) -> ImageFolderScanResult {
        let manager = FileManager.default
        var isDirectory: ObjCBool = false
        guard manager.fileExists(atPath: directory.path, isDirectory: &isDirectory), isDirectory.boolValue else {
            return ImageFolderScanResult(readable: [], unreadable: [], directoryUnreadable: true)
        }
        guard let items = try? manager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        ) else {
            return ImageFolderScanResult(readable: [], unreadable: [], directoryUnreadable: true)
        }

        var readable: [URL] = []
        var unreadable: [URL] = []
        for url in items.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
            let ext = url.pathExtension.lowercased()
            guard supportedExtensions.contains(ext) else { continue }
            var regular = true
            if let values = try? url.resourceValues(forKeys: [.isRegularFileKey]), values.isRegularFile == false {
                regular = false
            }
            guard regular else { continue }
            if isReadable(url) {
                readable.append(url)
            } else {
                unreadable.append(url)
            }
        }
        return ImageFolderScanResult(readable: readable, unreadable: unreadable, directoryUnreadable: false)
    }
}

public enum ImageRules {
    public static let failBelow = 10
    public static let warnBelow = 20

    public static func failure(readableCount: Int, unreadableNames: [String]) -> String? {
        if !unreadableNames.isEmpty {
            let list = unreadableNames.joined(separator: ", ")
            return bilingual(
                "שגיאה: קבצי תמונה לא קריאים: \(list)",
                "Error: Unreadable image files: \(list)"
            )
        }
        if readableCount < failBelow {
            return bilingual(
                "שגיאה: נמצאו \(readableCount) תמונות קריאות. נדרשות לפחות 10.",
                "Error: Found \(readableCount) readable images. At least 10 are required."
            )
        }
        return nil
    }

    public static func warnings(readableCount: Int) -> [String] {
        guard readableCount < warnBelow else { return [] }
        return [bilingual(
            "אזהרה: נמצאו \(readableCount) תמונות. מומלצות 20 או יותר (עדיף 30–50).",
            "Warning: Found \(readableCount) images. 20 or more are recommended (30–50 is better)."
        )]
    }

    public static func directoryMissing() -> String {
        bilingual(
            "שגיאה: תיקיית התמונות לא נמצאה או שאינה תיקייה.",
            "Error: The images folder was not found or is not a directory."
        )
    }

    private static func bilingual(_ he: String, _ en: String) -> String {
        he + "\n" + en
    }
}
