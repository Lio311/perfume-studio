import XCTest
@testable import PackKit

final class ManagerTests: XCTestCase {
    
    @MainActor
    func testRetryAndIdempotency() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let session = URLSession(configuration: config)
        let client = APIClient(session: session)
        
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let store = OutboxStore(fileURL: tempURL)
        let manager = OutboxManager(store: store, apiClient: client)
        manager.delays = [0, 0, 0, 0, 0, 0] // Instant backoff
        
        let item = OutboxItem(packJSON: "{}".data(using: .utf8)!, name: "Test")
        store.add(item)
        
        var partsCalls = 0
        var receivedKeys = [String]()
        
        MockURLProtocol.requestHandler = { req in
            if req.url?.path.contains("parts") == true {
                partsCalls += 1
                if let key = req.value(forHTTPHeaderField: "Idempotency-Key") {
                    receivedKeys.append(key)
                }
                
                if partsCalls < 3 {
                    return (HTTPURLResponse(url: req.url!, statusCode: 500, httpVersion: nil, headerFields: nil)!, Data())
                } else {
                    return (HTTPURLResponse(url: req.url!, statusCode: 201, httpVersion: nil, headerFields: nil)!, Data())
                }
            }
            return (HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data())
        }
        
        // Wait for monitor to connect if it does, but we can just call processQueue manually
        // We will call send directly to test backoff loop
        let mirror = Mirror(reflecting: manager)
        if let method = mirror.descendant("send") {
            // Since send is private async, we might need to test through processQueue
        }
        manager.processQueue()
        
        // Wait for it to finish
        try await Task.sleep(nanoseconds: 500_000_000)
        
        let finalItem = store.items.first!
        XCTAssertEqual(finalItem.status, .sent)
        XCTAssertEqual(partsCalls, 3)
        XCTAssertEqual(receivedKeys.count, 3)
        XCTAssertEqual(Set(receivedKeys).count, 1)
        XCTAssertEqual(receivedKeys[0], finalItem.id.uuidString)
    }
}
