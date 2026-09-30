import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

public struct OutboxView: View {
    @ObservedObject var manager: OutboxManager
    @State private var itemToDelete: OutboxItem?
    @State private var showExport = false
    @State private var exportURL: URL?
    
    public init(manager: OutboxManager) {
        self.manager = manager
    }
    
    public var body: some View {
        NavigationView {
            List {
                ForEach(manager.store.items) { item in
                    HStack(spacing: 12) {
                        #if canImport(UIKit)
                        if let firstPhoto = item.photoURLs.first,
                           let imgData = try? Data(contentsOf: firstPhoto),
                           let uiImage = UIImage(data: imgData) {
                            Image(uiImage: uiImage)
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                                .frame(width: 50, height: 50)
                                .cornerRadius(8)
                        } else {
                            RoundedRectangle(cornerRadius: 8)
                                .fill(Color.gray.opacity(0.3))
                                .frame(width: 50, height: 50)
                        }
                        #else
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.gray.opacity(0.3))
                            .frame(width: 50, height: 50)
                        #endif
                        
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.name)
                                .font(.headline)
                            
                            HStack {
                                statusBadge(for: item.status)
                                if item.status == .failed || item.status == .needsReview {
                                    Text(item.lastError ?? "")
                                        .font(.caption)
                                        .foregroundColor(.red)
                                        .lineLimit(1)
                                }
                            }
                        }
                        
                        Spacer()
                        
                        if item.status == .failed {
                            Button("נסה שוב") {
                                manager.retry(item: item)
                            }
                            .buttonStyle(BorderedButtonStyle())
                        }
                    }
                    .swipeActions {
                        Button(role: .destructive) {
                            itemToDelete = item
                        } label: {
                            Label("מחק", systemImage: "trash")
                        }
                    }
                }
            }
            .environment(\.layoutDirection, .rightToLeft)
            .navigationTitle("תיבת יוצאים")
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    Button("ייצא הכל כ-JSON") {
                        exportAll()
                    }
                }
                ToolbarItem(placement: .automatic) {
                    Button("שלח עכשיו") {
                        manager.processQueue()
                    }
                }
            }
            .confirmationDialog("למחוק את הפריט?", isPresented: Binding(
                get: { itemToDelete != nil },
                set: { if !$0 { itemToDelete = nil } }
            )) {
                Button("מחק", role: .destructive) {
                    if let item = itemToDelete {
                        manager.store.remove(id: item.id)
                    }
                }
                Button("ביטול", role: .cancel) {}
            }
            .sheet(isPresented: $showExport) {
                if let url = exportURL {
                    ShareSheet(activityItems: [url])
                }
            }
        }
    }
    
    private func statusBadge(for status: OutboxItemStatus) -> some View {
        let text: String
        let color: Color
        switch status {
        case .pending: text = "ממתין"; color = .gray
        case .sending: text = "שולח..."; color = .blue
        case .sent: text = "נשלח"; color = .green
        case .needsReview: text = "דורש תיקון"; color = .orange
        case .failed: text = "נכשל"; color = .red
        }
        return Text(text)
            .font(.caption).bold()
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(color.opacity(0.2))
            .foregroundColor(color)
            .cornerRadius(4)
    }
    
    private func exportAll() {
        let items = manager.store.items
        var jsonStrings = [String]()
        for item in items {
            if let str = String(data: item.packJSON, encoding: .utf8) {
                jsonStrings.append(str)
            }
        }
        let arrayString = "[" + jsonStrings.joined(separator: ",") + "]"
        let data = arrayString.data(using: .utf8)
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("outbox_export.json")
        try? data?.write(to: tempURL)
        exportURL = tempURL
        showExport = true
    }
}

#if canImport(UIKit)
struct ShareSheet: UIViewControllerRepresentable {
    var activityItems: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
#else
struct ShareSheet: View {
    var activityItems: [Any]
    var body: some View {
        Text("Share sheet not available")
    }
}
#endif
