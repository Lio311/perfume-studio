import Foundation
import PackKit
import Store

@MainActor
final class DraftLibrary: ObservableObject {
    @Published private(set) var drafts: [ScanDraft] = []
    let store: ScanFileStore

    init() {
        if let root = try? ScanFileStore.applicationSupportRoot() {
            store = ScanFileStore(root: root)
        } else {
            let fallback = FileManager.default.temporaryDirectory.appendingPathComponent("Scans", isDirectory: true)
            try? FileManager.default.createDirectory(at: fallback, withIntermediateDirectories: true)
            store = ScanFileStore(root: fallback)
        }
        reload()
    }

    func reload() {
        drafts = (try? store.list()) ?? []
    }

    func save(sequence: CaptureSequence, images: [String: Data]) throws {
        try store.save(sequence: sequence, images: images)
        reload()
    }

    func delete(partId: UUID) throws {
        try store.delete(partId: partId)
        reload()
    }
}
