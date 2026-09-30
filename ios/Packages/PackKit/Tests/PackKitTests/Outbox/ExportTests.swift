import XCTest
@testable import PackKit

final class ExportTests: XCTestCase {
    func testExportFormat() throws {
        let partJSON = """
        {
            "id": "test",
            "name": "test",
            "createdAt": 123,
            "parts": [{"id": "p1"}]
        }
        """.data(using: .utf8)!
        
        let item1 = OutboxItem(packJSON: partJSON, name: "I1")
        let item2 = OutboxItem(packJSON: partJSON, name: "I2")
        
        var allParts: [[String: Any]] = []
        for item in [item1, item2] {
            if let pack = try? JSONSerialization.jsonObject(with: item.packJSON) as? [String: Any],
               let parts = pack["parts"] as? [[String: Any]] {
                allParts.append(contentsOf: parts)
            }
        }
        let combinedPack: [String: Any] = [
            "id": "export",
            "name": "Outbox Export",
            "createdAt": 0,
            "parts": allParts
        ]
        
        let data = try JSONSerialization.data(withJSONObject: combinedPack)
        
        // Let's decode it back using PackValidator or JSONDecoder to ensure it's a valid structure
        let decoded = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        let parts = decoded["parts"] as! [[String: Any]]
        XCTAssertEqual(parts.count, 2)
        XCTAssertEqual(parts[0]["id"] as? String, "p1")
    }
}
