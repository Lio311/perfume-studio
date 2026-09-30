import Foundation
import Network

@MainActor
public class OutboxManager: ObservableObject {
    public let store: OutboxStore
    public let apiClient: APIClient
    private let monitor = NWPathMonitor()
    private var isConnected = false
    private var isProcessing = false
    
    public init(store: OutboxStore, apiClient: APIClient = APIClient()) {
        self.store = store
        self.apiClient = apiClient
        
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                let connected = path.status == .satisfied
                self?.isConnected = connected
                if connected {
                    self?.processQueue()
                }
            }
        }
        let queue = DispatchQueue(label: "NetworkMonitor")
        monitor.start(queue: queue)
    }
    
    public func processQueue() {
        guard isConnected, !isProcessing else { return }
        isProcessing = true
        
        Task {
            while let item = store.items.first(where: { $0.status == .pending }) {
                await send(item: item)
            }
            isProcessing = false
        }
    }
    
    public func retry(item: OutboxItem) {
        var mutableItem = item
        mutableItem.status = .pending
        mutableItem.attempts = 0
        store.update(mutableItem)
        processQueue()
    }
    
    private func send(item: OutboxItem) async {
        var currentItem = item
        currentItem.status = .sending
        store.update(currentItem)
        
        // Retry backoff logic: 5s, 30s, 2m, 10m. max 6 attempts.
        // Wait, the instructions say "retry with backoff ..., max 6 attempts, then failed"
        // Since we are processing the queue, we can just attempt once, and if it fails, schedule a retry.
        // Or attempt inside a loop for this specific item.
        let delays: [UInt64] = [5, 30, 120, 600, 600, 600]
        
        while currentItem.attempts < 6 {
            currentItem.attempts += 1
            do {
                let updated = try await apiClient.send(item: currentItem)
                store.update(updated)
                return
            } catch {
                if let apiErr = error as? APIError, case .needsReview = apiErr {
                    // It was handled and returned inside apiClient.send!
                    // Wait, apiClient.send traps needsReview and sets status to needsReview without throwing!
                    // So this catch block only runs for network errors.
                }
                
                if currentItem.attempts >= 6 {
                    currentItem.status = .failed
                    store.update(currentItem)
                    return
                }
                
                // Backoff
                let delaySeconds = delays[currentItem.attempts - 1]
                try? await Task.sleep(nanoseconds: delaySeconds * 1_000_000_000)
                guard isConnected else {
                    currentItem.status = .pending
                    store.update(currentItem)
                    return
                }
            }
        }
    }
}
