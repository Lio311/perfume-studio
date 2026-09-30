import SwiftUI
import PackKit

@main
struct ScannerApp: App {
    @StateObject private var outboxManager = OutboxManager(store: OutboxStore())
    
    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(outboxManager)
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, Locale(identifier: "he"))
        }
    }
}
