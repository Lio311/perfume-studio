import Foundation

public enum APIError: Error {
    case needsReview([String])
}

public class APIClient {
    private let session: URLSession
    
    public var baseURL: URL {
        if let stored = UserDefaults.standard.string(forKey: "outboxBaseURL"), let url = URL(string: stored) {
            return url
        }
        return URL(string: "https://perfume-studio-indol.vercel.app")!
    }
    
    public var token: String {
        return KeychainHelper.shared.readToken()
    }
    
    public init(session: URLSession = .shared) {
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
            
            var finalJSON = item.packJSON
            if !uploadedURLs.isEmpty,
               var pack = try JSONSerialization.jsonObject(with: finalJSON) as? [String: Any],
               var parts = pack["parts"] as? [[String: Any]],
               !parts.isEmpty {
                parts[0]["images"] = uploadedURLs
                pack["parts"] = parts
                if let newData = try? JSONSerialization.data(withJSONObject: pack) {
                    finalJSON = newData
                }
            }
            
            try await postPart(packJSON: finalJSON, idempotencyKey: item.id.uuidString)
            
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
