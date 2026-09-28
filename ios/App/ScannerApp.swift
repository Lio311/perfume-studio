import SwiftUI

@main
struct ScannerApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, Locale(identifier: "he"))
        }
    }
}
