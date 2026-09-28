import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import PackKit

/// Base path per API.md v0.2. Implemented in M5.
public struct APIClient: Sendable {
    public var baseURL: URL
    public init(baseURL: URL) { self.baseURL = baseURL }
    public var v1: URL { baseURL.appendingPathComponent("api/v1") }
}
