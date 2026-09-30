import Foundation

public enum APIError: Error {
    case needsReview([String])
}

public class APIClient {
    public var baseURL: URL
    public var token: String
    private let session: URLSession
    
    public init(baseURL: URL = URL(string: "https://perfume-studio-indol.vercel.app")!, token: String = "", session: URLSession = .shared) {
        self.baseURL = baseURL
        self.token = token
        self.session = session
    }
    
    public func send(item: OutboxItem) async throws -> OutboxItem {
        var updatedItem = item
        
        do {
            var uploadedURLs: [String] = []
            for fileURL in item.photoURLs {
                let url = try await uploadDirect(fileURL: fileURL)
                uploadedURLs.append(url)
            }
            
            // NOTE: Ideally we would inject uploadedURLs into the pack JSON here,
            // but the spec just says POST /parts with the JSON.
            try await postPart(packJSON: item.packJSON, idempotencyKey: item.id.uuidString)
            
            updatedItem.status = .sent
            updatedItem.lastError = nil
        } catch let APIError.needsReview(issues) {
            updatedItem.status = .needsReview
            updatedItem.lastError = issues.joined(separator: "\n")
        } catch {
            updatedItem.lastError = error.localizedDescription
            throw error
        }
        
        return updatedItem
    }
    
    private func uploadDirect(fileURL: URL) async throws -> String {
        var req = URLRequest(url: baseURL.appendingPathComponent("uploads/direct"))
        req.httpMethod = "POST"
        if !token.isEmpty { req.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        
        let data = try Data(contentsOf: fileURL)
        req.httpBody = data
        req.addValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        
        let (responseData, resp) = try await session.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        
        if http.statusCode >= 200 && http.statusCode < 300 {
            struct UploadResponse: Decodable { let url: String }
            if let parsed = try? JSONDecoder().decode(UploadResponse.self, from: responseData) {
                return parsed.url
            }
            return ""
        } else {
            throw URLError(.badServerResponse)
        }
    }
    
    private func postPart(packJSON: Data, idempotencyKey: String) async throws {
        var req = URLRequest(url: baseURL.appendingPathComponent("parts"))
        req.httpMethod = "POST"
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        req.addValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key")
        if !token.isEmpty { req.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        req.httpBody = packJSON
        
        let (data, resp) = try await session.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        
        if http.statusCode == 422 {
            struct ReviewResponse: Decodable { let issues: [String] }
            if let parsed = try? JSONDecoder().decode(ReviewResponse.self, from: data) {
                throw APIError.needsReview(parsed.issues)
            } else {
                throw APIError.needsReview(["Validation failed"])
            }
        }
        
        if http.statusCode < 200 || http.statusCode >= 300 {
            throw URLError(.badServerResponse)
        }
    }
}
