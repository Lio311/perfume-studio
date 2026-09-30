import Foundation
import PackKit

public enum ScanStoreError: Error, Equatable {
    case invalidFileName
    case missing
    /// `ready` was refused because the measurement is missing or has blocking pack errors.
    case outboxBlocked
}

/// One saved part: the sequence (including photo metadata) plus when it was written.
public struct ScanDraft: Equatable, Codable, Sendable {
    public var sequence: CaptureSequence
    public var updatedAt: Date
    /// Present after "שמור מידות". Omitted on capture-only drafts.
    public var measurement: DraftMeasurement?
    /// Parts added with "הוסף חלק" share one id. Older drafts use the part id.
    public var sessionId: UUID?
    /// Local outbox. Missing on drafts saved before M4, which read as `draft`.
    public var status: PartReviewStatus?

    public init(
        sequence: CaptureSequence,
        updatedAt: Date,
        measurement: DraftMeasurement? = nil,
        sessionId: UUID? = nil,
        status: PartReviewStatus? = nil
    ) {
        self.sequence = sequence
        self.updatedAt = updatedAt
        self.measurement = measurement
        self.sessionId = sessionId
        self.status = status
    }

    public var resolvedSessionId: UUID { sessionId ?? sequence.partId }
    public var resolvedStatus: PartReviewStatus { status ?? .draft }
}

/// On-device drafts under `Application Support/Scans/<partId>/`.
/// JPEG bytes and `part.json` are written atomically. No network.
public struct ScanFileStore {
    public let root: URL
    private let fileManager: FileManager

    public init(root: URL, fileManager: FileManager = .default) {
        self.root = root
        self.fileManager = fileManager
    }

    public static func applicationSupportRoot(fileManager: FileManager = .default) throws -> URL {
        let base = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let scans = base.appendingPathComponent("Scans", isDirectory: true)
        try fileManager.createDirectory(at: scans, withIntermediateDirectories: true)
        return scans
    }

    /// `measurement: nil` keeps a measurement already stored for this part.
    /// Pass `replaceMeasurement: true` to write `measurement` even when it is nil.
    public func save(
        sequence: CaptureSequence,
        images: [String: Data],
        measurement: DraftMeasurement? = nil,
        replaceMeasurement: Bool = false,
        sessionId: UUID? = nil,
        status: PartReviewStatus? = nil,
        now: Date = Date()
    ) throws {
        let existing = load(partId: sequence.partId)
        let kept = replaceMeasurement ? measurement : (measurement ?? existing?.measurement)
        let keptSession = sessionId ?? existing?.sessionId ?? sequence.partId
        let keptStatus: PartReviewStatus
        if let status {
            keptStatus = status
        } else if replaceMeasurement, measurement == nil {
            keptStatus = .draft
        } else {
            keptStatus = existing?.status ?? .draft
        }
        if keptStatus == .ready {
            guard let kept, !ReviewModel.outboxBlocked(kept.reviewDraft(kind: sequence.kind)) else {
                throw ScanStoreError.outboxBlocked
            }
        }
        let directory = try directoryURL(partId: sequence.partId, create: true)
        for (name, data) in images {
            guard let safe = Self.safeFileName(name) else { throw ScanStoreError.invalidFileName }
            guard sequence.steps.contains(where: { $0.photo?.fileName == safe }) else { continue }
            try data.write(to: directory.appendingPathComponent(safe), options: .atomic)
        }
        try removeOrphanJPEGs(in: directory, sequence: sequence)
        let draft = ScanDraft(
            sequence: sequence,
            updatedAt: now,
            measurement: kept,
            sessionId: keptSession,
            status: keptStatus
        )
        let encoded = try Self.encoder.encode(draft)
        try encoded.write(to: directory.appendingPathComponent("part.json"), options: .atomic)
    }

    public func list() throws -> [ScanDraft] {
        guard fileManager.fileExists(atPath: root.path) else { return [] }
        let children = try fileManager.contentsOfDirectory(
            at: root,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        )
        var drafts: [ScanDraft] = []
        for child in children {
            let url = child.appendingPathComponent("part.json")
            guard let data = try? Data(contentsOf: url),
                  let draft = try? Self.decoder.decode(ScanDraft.self, from: data) else { continue }
            drafts.append(draft)
        }
        return drafts.sorted { lhs, rhs in
            if lhs.updatedAt != rhs.updatedAt { return lhs.updatedAt > rhs.updatedAt }
            return lhs.sequence.partId.uuidString < rhs.sequence.partId.uuidString
        }
    }

    public func load(partId: UUID) -> ScanDraft? {
        let url = root
            .appendingPathComponent(Self.folderName(partId), isDirectory: true)
            .appendingPathComponent("part.json")
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? Self.decoder.decode(ScanDraft.self, from: data)
    }

    public func imageData(partId: UUID, fileName: String) throws -> Data {
        guard let safe = Self.safeFileName(fileName) else { throw ScanStoreError.invalidFileName }
        guard let draft = load(partId: partId),
              draft.sequence.steps.contains(where: { $0.photo?.fileName == safe }) else {
            throw ScanStoreError.missing
        }
        let url = root
            .appendingPathComponent(Self.folderName(partId), isDirectory: true)
            .appendingPathComponent(safe)
        guard let data = try? Data(contentsOf: url) else { throw ScanStoreError.missing }
        return data
    }

    public func delete(partId: UUID) throws {
        let directory = root.appendingPathComponent(Self.folderName(partId), isDirectory: true)
        guard fileManager.fileExists(atPath: directory.path) else { return }
        try fileManager.removeItem(at: directory)
    }

    private func directoryURL(partId: UUID, create: Bool) throws -> URL {
        let directory = root.appendingPathComponent(Self.folderName(partId), isDirectory: true)
        if create {
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        }
        return directory
    }

    private func removeOrphanJPEGs(in directory: URL, sequence: CaptureSequence) throws {
        let keep = Set(sequence.steps.compactMap { $0.photo?.fileName })
        let files = try fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        for file in files where file.pathExtension.lowercased() == "jpg" && !keep.contains(file.lastPathComponent) {
            try fileManager.removeItem(at: file)
        }
    }

    static func folderName(_ partId: UUID) -> String {
        partId.uuidString.lowercased()
    }

    static func safeFileName(_ name: String) -> String? {
        guard !name.isEmpty,
              !name.contains("/"),
              !name.contains("\\"),
              name != ".",
              name != "..",
              !name.hasPrefix("."),
              (name as NSString).lastPathComponent == name else { return nil }
        return name
    }

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()

    private static let decoder = JSONDecoder()
}

#if canImport(UIKit)
import UIKit

public enum ScanImage {
    public static let jpegQuality: CGFloat = 0.9

    public static func jpegData(from image: UIImage, quality: CGFloat = ScanImage.jpegQuality) -> Data? {
        image.jpegData(compressionQuality: quality)
    }
}
#endif
