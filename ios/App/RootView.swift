import PackKit
import Store
import SwiftUI

/// Home: pick a part kind, or resume and delete a saved draft. Hebrew, right to left.
private enum ScannerRoute: Hashable {
    case capture(UUID)
    case review(UUID)
    case summary(UUID)
    case preview(UUID)
}

struct RootView: View {
    @StateObject private var library = DraftLibrary()
    @State private var path: [ScannerRoute] = []
    @State private var opened: [UUID: CaptureSequence] = [:]
    @State private var sessionForPart: [UUID: UUID] = [:]
    @State private var pendingDelete: UUID?
    @State private var measureFirst: Set<UUID> = []
    @State private var openMeasureToken = UUID()

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
                            sessionForPart[sequence.partId] = sequence.partId
                            path.append(.capture(sequence.partId))
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
            .navigationDestination(for: ScannerRoute.self) { route in
                switch route {
                case .capture(let id):
                    if let sequence = opened[id] ?? library.store.load(partId: id)?.sequence {
                        CaptureFlowView(
                            library: library,
                            sequence: sequence,
                            sessionId: sessionForPart[id] ?? library.store.load(partId: id)?.resolvedSessionId ?? id,
                            startsOnMeasure: measureFirst.contains(id),
                            openMeasureToken: openMeasureToken,
                            onMeasured: { openReview(id) }
                        )
                    } else {
                        missingDraft
                    }
                case .review(let id):
                    ReviewScreen(
                        library: library,
                        partId: id,
                        onRemeasure: { openMeasure(id) },
                        onSummary: { openSummary(id) },
                        onPreview: { path.append(.preview(id)) }
                    )
                case .summary(let sessionId):
                    SessionSummaryScreen(
                        library: library,
                        sessionId: sessionId,
                        onOpen: { openReview($0) },
                        onAdd: { addPart($0, sessionId: sessionId) },
                        onFinish: { path = [] }
                    )
                case .preview(let id):
                    if let draft = library.store.load(partId: id), let measurement = draft.measurement {
                        ModelPreviewScreen(draft: draft, measurement: measurement, onRetake: { retakeScan(id) })
                    } else {
                        missingDraft
                    }
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
            Text(draft.resolvedStatus.hebrew)
                .font(.footnote.bold())
            HStack(spacing: 12) {
                Button("המשך") {
                    opened[draft.sequence.partId] = draft.sequence
                    sessionForPart[draft.sequence.partId] = draft.resolvedSessionId
                    if draft.measurement != nil {
                        path.append(.review(draft.sequence.partId))
                    } else {
                        path.append(.capture(draft.sequence.partId))
                    }
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
            sessionForPart[sequence.partId] = sequence.partId
            measureFirst.insert(sequence.partId)
            path.append(.capture(sequence.partId))
        }
        .buttonStyle(.bordered)
        .accessibilityLabel(sample.labelHe)
    }
    #endif

    private var missingDraft: some View {
        Text("הטיוטה לא נמצאה")
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.black.ignoresSafeArea())
    }

    private func openReview(_ id: UUID) {
        if case .review(id) = path.last { return }
        if let draft = library.store.load(partId: id) {
            opened[id] = draft.sequence
            sessionForPart[id] = draft.resolvedSessionId
        }
        path.append(.review(id))
    }

    private func openSummary(_ partId: UUID) {
        let sessionId = sessionForPart[partId] ?? library.store.load(partId: partId)?.resolvedSessionId ?? partId
        if case .summary(sessionId) = path.last { return }
        path.append(.summary(sessionId))
    }

    private func openMeasure(_ id: UUID) {
        if let draft = library.store.load(partId: id) {
            opened[id] = draft.sequence
            sessionForPart[id] = draft.resolvedSessionId
        }
        measureFirst.insert(id)
        openMeasureToken = UUID()
        if let index = path.lastIndex(where: { route in
            if case .capture(let part) = route { return part == id }
            return false
        }) {
            path = Array(path.prefix(through: index))
        } else {
            path.append(.capture(id))
        }
    }

    private func addPart(_ kind: PartKind, sessionId: UUID) {
        let sequence = CaptureSequence(kind: kind)
        opened[sequence.partId] = sequence
        sessionForPart[sequence.partId] = sessionId
        measureFirst.remove(sequence.partId)
        path.append(.capture(sequence.partId))
    }

    private func retakeScan(_ id: UUID) {
        guard var sequence = opened[id] ?? library.store.load(partId: id)?.sequence else { return }
        let sessionId = sessionForPart[id] ?? library.store.load(partId: id)?.resolvedSessionId ?? id
        if sequence.retake(index: 0) {
            try? library.save(sequence: sequence, images: [:], clearMeasurement: true, sessionId: sessionId, status: .draft)
        }
        opened[id] = sequence
        sessionForPart[id] = sessionId
        measureFirst.remove(id)
        path = [.capture(id)]
    }

    private func photoCount(_ draft: ScanDraft) -> String {
        let count = draft.sequence.steps.compactMap(\.photo).count
        return count == 1 ? "תמונה אחת" : "\(count) תמונות"
    }
}
