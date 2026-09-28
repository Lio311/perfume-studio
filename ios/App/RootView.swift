import SwiftUI
import PackKit

/// M0 placeholder. M1 replaces the body with the camera + distance guide screen.
struct RootView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                Image(systemName: "camera.viewfinder").font(.system(size: 56))
                Text("סורק רכיבים").font(.title.bold())
                Text("גרסת שלד · PackKit \(PackKit.version)")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            .padding()
        }
    }
}
