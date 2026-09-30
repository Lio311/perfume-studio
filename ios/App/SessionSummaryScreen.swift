import PackKit
import Store
import SwiftUI
import UIKit

/// Parts captured in one session: thumbnail, kind, size, status, and how many checks failed.
struct SessionSummaryScreen: View {
    @ObservedObject var library: DraftLibrary
    let sessionId: UUID
    var onOpen: (UUID) -> Void
    var onAdd: (PartKind) -> Void
    var onFinish: () -> Void

    @State private var picking = false

    private let kinds: [PartKind] = [.bottle, .cap, .pump, .collar, .box, .label]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("סיכום הסשן")
                    .font(.title2.bold())
                if parts.isEmpty {
                    Text("אין חלקים בסשן")
                        .foregroundStyle(.white.opacity(0.7))
                } else {
                    ForEach(parts, id: \.sequence.partId) { draft in
                        partRow(draft)
                    }
                }
                Button("הוסף חלק") { picking = true }
                    .buttonStyle(.borderedProminent)
                if picking {
                    ForEach(kinds, id: \.self) { kind in
                        Button(kind.hebrewName) { onAdd(kind) }
                            .buttonStyle(.bordered)
                    }
                }
                Button("סיים סשן") { onFinish() }
                    .buttonStyle(.bordered)
            }
            .padding(20)
        }
        .background(Color.black.ignoresSafeArea())
        .foregroundStyle(.white)
        .navigationTitle("סיכום הסשן")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { library.reload() }
    }

    private var parts: [ScanDraft] {
        library.drafts.filter { $0.resolvedSessionId == sessionId }
    }

    private func partRow(_ draft: ScanDraft) -> some View {
        Button {
            onOpen(draft.sequence.partId)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                thumbnail(draft)
                VStack(alignment: .leading, spacing: 4) {
                    Text(draft.sequence.kind.hebrewName)
                        .font(.headline)
                    if let measurement = draft.measurement {
                        Text(MeasureFormat.triple(measurement.dimensions))
                            .font(.subheadline.monospacedDigit())
                    } else {
                        Text("אין מידות")
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.7))
                    }
                    Text(draft.resolvedStatus.hebrew)
                        .font(.caption.bold())
                    Text(issueLabel(draft))
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.75))
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .foregroundStyle(.white)
    }

    private func thumbnail(_ draft: ScanDraft) -> some View {
        Group {
            if let image = storedImage(draft) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                Color.white.opacity(0.08)
            }
        }
        .frame(width: 72, height: 72)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func storedImage(_ draft: ScanDraft) -> UIImage? {
        let photo = draft.sequence.steps.first { $0.angle == .side }?.photo
            ?? draft.sequence.steps.first { $0.photo != nil }?.photo
        guard let photo, let data = try? library.store.imageData(partId: draft.sequence.partId, fileName: photo.fileName) else {
            return nil
        }
        return UIImage(data: data)
    }

    private func issueLabel(_ draft: ScanDraft) -> String {
        guard let measurement = draft.measurement else { return "0 בעיות" }
        let count = ReviewModel.issues(measurement.reviewDraft(kind: draft.sequence.kind)).count
        return count == 1 ? "בעיה אחת" : "\(count) בעיות"
    }
}
