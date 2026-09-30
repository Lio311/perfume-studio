import PackKit
import Store
import SwiftUI

/// Home: pick a part kind, or resume and delete a saved draft. Hebrew, right to left.
struct RootView: View {
    @StateObject private var library = DraftLibrary()
    @State private var path = NavigationPath()
    @State private var opened: [UUID: CaptureSequence] = [:]
    @State private var pendingDelete: UUID?
    @State private var measureFirst: Set<UUID> = []

    private let kinds: [PartKind] = [.bottle, .cap, .pump, .collar, .box, .label]

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("רכיב חדש")
                        .font(.title3.bold())
                    ForEach(kinds, id: \.self) { kind in
                        Button {
                            let sequence = CaptureSequence(kind: kind)
                            opened[sequence.partId] = sequence
                            path.append(sequence.partId)
                        } label: {
                            Text(kind.hebrewName)
                                .font(.title2.bold())
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 18)
                                .background(Color.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(.white)
                        .accessibilityLabel(kind.hebrewName)
                    }

                    #if DEBUG
                    Text("דוגמאות מדידה")
                        .font(.title3.bold())
                        .padding(.top, 8)
                    debugSampleButton(MeasureSampleLibrary.bottle)
                    debugSampleButton(MeasureSampleLibrary.cap)
                    debugSampleButton(MeasureSampleLibrary.box)
                    #endif

                    Text("טיוטות")
                        .font(.title3.bold())
                        .padding(.top, 8)
                    if library.drafts.isEmpty {
                        Text("אין טיוטות")
                            .foregroundStyle(.white.opacity(0.7))
                    } else {
                        ForEach(library.drafts, id: \.sequence.partId) { draft in
                            draftRow(draft)
                        }
                    }
                }
                .padding(20)
            }
            .background(Color.black.ignoresSafeArea())
            .foregroundStyle(.white)
            .navigationTitle("סורק רכיבים")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: UUID.self) { id in
                if let sequence = opened[id] {
                    CaptureFlowView(library: library, sequence: sequence, startsOnMeasure: measureFirst.contains(id))
                } else {
                    Text("הטיוטה לא נמצאה")
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.black.ignoresSafeArea())
                }
            }
            .onAppear { library.reload() }
            .confirmationDialog(
                "למחוק את הטיוטה?",
                isPresented: Binding(
                    get: { pendingDelete != nil },
                    set: { if !$0 { pendingDelete = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("מחק", role: .destructive) {
                    if let pendingDelete {
                        try? library.delete(partId: pendingDelete)
                    }
                    pendingDelete = nil
                }
                Button("ביטול", role: .cancel) { pendingDelete = nil }
            }
        }
    }

    private func draftRow(_ draft: ScanDraft) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(draft.sequence.kind.hebrewName)
                .font(.headline)
            Text(draft.updatedAt.formatted(date: .abbreviated, time: .shortened))
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.7))
            Text(photoCount(draft))
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.7))
            if let measurement = draft.measurement {
                Text("\(MeasureFormat.millimetres(measurement.widthMm)) × \(MeasureFormat.millimetres(measurement.heightMm)) × \(MeasureFormat.millimetres(measurement.depthMm)) מ״מ")
                    .font(.footnote.monospacedDigit())
            }
            HStack(spacing: 12) {
                Button("המשך") {
                    opened[draft.sequence.partId] = draft.sequence
                    path.append(draft.sequence.partId)
                }
                .buttonStyle(.borderedProminent)
                Button("מחק", role: .destructive) {
                    pendingDelete = draft.sequence.partId
                }
                .buttonStyle(.bordered)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    #if DEBUG
    private func debugSampleButton(_ sample: MeasureSample) -> some View {
        Button(sample.labelHe) {
            guard let sequence = try? DebugMeasureSamples.install(sample, store: library.store) else { return }
            library.reload()
            opened[sequence.partId] = sequence
            measureFirst.insert(sequence.partId)
            path.append(sequence.partId)
        }
        .buttonStyle(.bordered)
        .accessibilityLabel(sample.labelHe)
    }
    #endif

    private func photoCount(_ draft: ScanDraft) -> String {
        let count = draft.sequence.steps.compactMap(\.photo).count
        return count == 1 ? "תמונה אחת" : "\(count) תמונות"
    }
}
