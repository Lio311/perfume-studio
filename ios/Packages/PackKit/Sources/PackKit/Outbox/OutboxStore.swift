import Foundation

@MainActor
public class OutboxStore: ObservableObject {
    @Published public private(set) var items: [OutboxItem] = []
    
    private let fileURL: URL
    
    public init(fileURL: URL = URL.documentsDirectory.appendingPathComponent("outbox.json")) {
        self.fileURL = fileURL
        load()
    }
    
    public func load() {
        guard let data = try? Data(contentsOf: fileURL) else { return }
        if let decoded = try? JSONDecoder().decode([OutboxItem].self, from: data) {
            self.items = decoded
        }
    }
    
    public func save() {
        if let data = try? JSONEncoder().encode(items) {
            try? data.write(to: fileURL, options: .atomic)
        }
    }
    
    public func add(_ item: OutboxItem) {
        items.insert(item, at: 0)
        save()
    }
    
    public func update(_ item: OutboxItem) {
        if let idx = items.firstIndex(where: { $0.id == item.id }) {
            items[idx] = item
            save()
        }
    }
    
    public func remove(id: UUID) {
        items.removeAll(where: { $0.id == id })
        save()
    }
}
