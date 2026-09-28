import XCTest
@testable import APIClient

final class APIClientTests: XCTestCase {
    func testV1Path() {
        let c = APIClient(baseURL: URL(string: "https://example.invalid")!)
        XCTAssertEqual(c.v1.absoluteString, "https://example.invalid/api/v1")
    }
}
