import Foundation

class KeychainHelper {
    static let shared = KeychainHelper()
    
    func save(_ data: Data, service: String, account: String) {
        let query = [
            kSecValueData: data,
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
        ] as CFDictionary
        
        SecItemAdd(query, nil)
    }
    
    func read(service: String, account: String) -> Data? {
        let query = [
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecClass: kSecClassGenericPassword,
            kSecReturnData: true
        ] as CFDictionary
        
        var result: AnyObject?
        SecItemCopyMatching(query, &result)
        return (result as? Data)
    }
    
    func delete(service: String, account: String) {
        let query = [
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecClass: kSecClassGenericPassword,
        ] as CFDictionary
        
        SecItemDelete(query)
    }
    
    func saveToken(_ token: String) {
        if token.isEmpty {
            delete(service: "PerfumeStudio", account: "OutboxToken")
            return
        }
        if let data = token.data(using: .utf8) {
            delete(service: "PerfumeStudio", account: "OutboxToken")
            save(data, service: "PerfumeStudio", account: "OutboxToken")
        }
    }
    
    func readToken() -> String {
        if let data = read(service: "PerfumeStudio", account: "OutboxToken") {
            return String(data: data, encoding: .utf8) ?? ""
        }
        return ""
    }
}
