import XCTest
@testable import PackKit

final class OutboxTests: XCTestCase {
    
    @MainActor
    func testStorePersistsAndReloads() {
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let store = OutboxStore(fileURL: tempURL)
        
        XCTAssertEqual(store.items.count, 0)
        
        let item = OutboxItem(packJSON: Data(), name: "Test")
        store.add(item)
        
        XCTAssertEqual(store.items.count, 1)
        
        let reloadedStore = OutboxStore(fileURL: tempURL)
        XCTAssertEqual(reloadedStore.items.count, 1)
        XCTAssertEqual(reloadedStore.items[0].id, item.id)
    }
}
    
    @MainActor
    func testStoreResetsSendingToPendingOnLoad() {
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let store = OutboxStore(fileURL: tempURL)
        
        var item = OutboxItem(packJSON: Data(), name: "Test")
        item.status = .sending
        store.add(item)
        
        let reloadedStore = OutboxStore(fileURL: tempURL)
        XCTAssertEqual(reloadedStore.items.count, 1)
        XCTAssertEqual(reloadedStore.items[0].status, .pending)
    }
