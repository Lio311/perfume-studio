import XCTest
@testable import PackKit

final class MockURLProtocol: URLProtocol {
    static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?
    
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    
    override func startLoading() {
        guard let handler = MockURLProtocol.requestHandler else {
            fatalError("Handler is unavailable.")
        }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }
    
    override func stopLoading() {}
}

final class APIClientTests: XCTestCase {
    
    func testIdempotencyKey() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let session = URLSession(configuration: config)
        let client = APIClient(session: session)
        
        let item = OutboxItem(packJSON: Data(), name: "Test")
        var receivedKey = ""
        
        MockURLProtocol.requestHandler = { req in
            if req.url?.path.contains("parts") == true {
                receivedKey = req.value(forHTTPHeaderField: "Idempotency-Key") ?? ""
                return (HTTPURLResponse(url: req.url!, statusCode: 201, httpVersion: nil, headerFields: nil)!, Data())
            }
            return (HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data())
        }
        
        let updated = try await client.send(item: item)
        XCTAssertEqual(receivedKey, item.id.uuidString)
        XCTAssertEqual(updated.status, .sent)
    }
    
    func test422NeedsReview() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let session = URLSession(configuration: config)
        let client = APIClient(session: session)
        
        let item = OutboxItem(packJSON: Data(), name: "Test")
        
        MockURLProtocol.requestHandler = { req in
            if req.url?.path.contains("parts") == true {
                let json = """
                {"issues": ["Missing price"]}
                """.data(using: .utf8)!
                return (HTTPURLResponse(url: req.url!, statusCode: 422, httpVersion: nil, headerFields: nil)!, json)
            }
            return (HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data())
        }
        
        let updated = try await client.send(item: item)
        XCTAssertEqual(updated.status, .needsReview)
        XCTAssertEqual(updated.lastError, "Missing price")
    }
}
