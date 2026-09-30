import PackKit
import Store
import SwiftUI
import UIKit

/// Per-part review after "שמור מידות", and when a measured draft is opened.
struct ReviewScreen: View {
    @EnvironmentObject private var outboxManager: OutboxManager
    @ObservedObject var library: DraftLibrary
    let partId: UUID
    var onRemeasure: () -> Void
    var onSummary: () -> Void
    var onPreview: () -> Void

    @State private var draft: ReviewDraft?
    @State private var sequence: CaptureSequence?
    @State private var status: PartReviewStatus = .draft
    @State private var sessionId: UUID?
    @State private var loaded = false
    @State private var editing = false
    @State private var editAxis: MeasureAxis = .height
    @State private var editText = ""
    @State private var neckText = ""
    @State private var priceValue = ""
    @State private var currency = "ILS"
    @State private var moqText = ""
    @State private var tiers: [TierRow] = []
    @State private var picked = Color.gray
    @State private var saveFailed = false
    @State private var sampled = false
    @State private var acceptColor = false
    @State private var fieldBaseline = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let current = pricedDraft {
                    header(current)
                    dimensions(current)
                    finish(current)
                    colour(current)
                    neck(current)
                    price(current)
                    issues(current)
                    actions(current)
                } else {
                    Text("הטיוטה לא נמצאה")
                }
            }
            .padding(20)
        }
        .background(Color.black.ignoresSafeArea())
        .foregroundStyle(.white)
        .navigationTitle("סקירה")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear(perform: load)
        .onDisappear {
            if fieldSnapshot() != fieldBaseline {
                persist(demoteReady: true)
                fieldBaseline = fieldSnapshot()
            }
        }
        .sheet(isPresented: $editing) { editSheet }
        .alert("שמירה נכשלה", isPresented: $saveFailed) {
            Button("סגור", role: .cancel) {}
        } message: {
            Text("לא ניתן לשמור את הטיוטה במכשיר.")
        }
    }

    private var pricedDraft: ReviewDraft? {
        guard let draft else { return nil }
        return withFields(draft)
    }

    private func header(_ current: ReviewDraft) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(current.kind.hebrewName)
                .font(.title2.bold())
            Text(status.hebrew)
                .font(.subheadline.bold())
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(statusColor.opacity(0.25), in: Capsule())
        }
    }

    private var statusColor: Color {
        switch status {
        case .ready: return .green
        case .needsReview: return .yellow
        case .draft: return .white
        }
    }

    private func dimensions(_ current: ReviewDraft) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("מידות")
                .font(.headline)
            dimensionRow("רוחב", key: "widthMm", millimetres: current.dimensions.widthMm, band: current.band(for: "widthMm"))
            dimensionRow("גובה", key: "heightMm", millimetres: current.dimensions.heightMm, band: current.band(for: "heightMm"))
            dimensionRow("עומק", key: "depthMm", millimetres: current.dimensions.depthMm, band: current.band(for: "depthMm"))
            Button("ערוך מידה") {
                editAxis = .height
                editText = MeasureFormat.millimetres(current.dimensions.heightMm)
                editing = true
            }
            .buttonStyle(.bordered)
            Text("עריכת גובה או רוחב משנה את שאר המידות באותו יחס.")
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.7))
        }
    }

    private func dimensionRow(_ title: String, key: String, millimetres: Double, band: ConfidenceBand) -> some View {
        HStack {
            Text("\(title) \(MeasureFormat.millimetres(millimetres)) מ״מ")
                .font(.body.monospacedDigit())
            Spacer()
            Text(MeasureFormat.band(band))
                .font(.caption.bold())
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(MeasureFormatColor.band(band).opacity(0.85), in: Capsule())
                .foregroundStyle(.black)
        }
        .accessibilityLabel("\(title) \(MeasureFormat.band(band))")
    }

    private func finish(_ current: ReviewDraft) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("גימור")
                .font(.headline)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(FinishCatalog.ids, id: \.self) { id in
                        Button(FinishCatalog.hebrewName(id)) {
                            guard var draft else { return }
                            draft.finish = id
                            self.draft = draft
                            persist(demoteReady: true)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(current.finish == id ? Color.accentColor : Color.white.opacity(0.2))
                    }
                }
            }
        }
    }

    private func colour(_ current: ReviewDraft) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("צבע")
                .font(.headline)
            HStack(spacing: 12) {
                Circle()
                    .fill(ReviewColor.color(current.colorHex))
                    .frame(width: 36, height: 36)
                    .overlay(Circle().stroke(Color.white.opacity(0.4), lineWidth: 1))
                Text(current.colorHex)
                    .font(.body.monospaced())
                Spacer()
                ColorPicker("בחירת צבע", selection: $picked, supportsOpacity: false)
                    .labelsHidden()
                    .onChange(of: picked) { _, color in
                        guard acceptColor, loaded, var draft else { return }
                        let hex = ReviewColor.hex(color)
                        guard hex.lowercased() != draft.colorHex.lowercased() else { return }
                        draft.colorHex = hex
                        draft.colorSource = "user"
                        self.draft = draft
                        persist(demoteReady: true)
                    }
            }
        }
    }

    private func neck(_ current: ReviewDraft) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("קוטר צוואר חיצוני")
                .font(.headline)
            TextField("מ״מ", text: $neckText)
                .keyboardType(.decimalPad)
                .textFieldStyle(.roundedBorder)
            Text("לאימות מול הספק")
                .font(.footnote.bold())
                .foregroundStyle(.yellow)
        }
    }

    private func price(_ current: ReviewDraft) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("מחיר (אופציונלי)")
                .font(.headline)
            TextField("מחיר ליחידה", text: $priceValue)
                .keyboardType(.decimalPad)
                .textFieldStyle(.roundedBorder)
            TextField("מטבע", text: $currency)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.characters)
            TextField("כמות הזמנה מינימלית", text: $moqText)
                .keyboardType(.numberPad)
                .textFieldStyle(.roundedBorder)
            ForEach($tiers) { $tier in
                HStack {
                    TextField("כמות", text: $tier.minQty)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                    TextField("מחיר", text: $tier.value)
                        .keyboardType(.decimalPad)
                        .textFieldStyle(.roundedBorder)
                    Button("הסר") {
                        tiers.removeAll { $0.id == tier.id }
                        persist(demoteReady: true)
                    }
                    .buttonStyle(.bordered)
                }
            }
            Button("הוסף מדרגה") {
                tiers.append(TierRow())
            }
            .buttonStyle(.bordered)
        }
    }

    private func issues(_ current: ReviewDraft) -> some View {
        let found = ReviewModel.issues(current)
        return VStack(alignment: .leading, spacing: 6) {
            if !found.isEmpty {
                Text("בדיקה")
                    .font(.headline)
                ForEach(Array(found.enumerated()), id: \.offset) { _, issue in
                    Text(issue.messageHe)
                        .font(.footnote)
                        .foregroundStyle(issue.severity == .error ? Color.red : Color.yellow)
                }
            }
        }
    }

    private func actions(_ current: ReviewDraft) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Button("מדוד שוב") { onRemeasure() }
                .buttonStyle(.bordered)
            Button("תצוגת תלת-ממד") { onPreview() }
                .buttonStyle(.bordered)
            Button("שמור לתיבת יציאה") { saveToOutbox(current) }
                .buttonStyle(.borderedProminent)
                .disabled(ReviewModel.outboxBlocked(current))
            if status != .draft {
                Button("החזר לטיוטה") { markDraft() }
                    .buttonStyle(.bordered)
            }
            Button("סיכום הסשן") { onSummary() }
                .buttonStyle(.bordered)
        }
    }

    private var editSheet: some View {
        NavigationStack {
            Form {
                Picker("ציר", selection: $editAxis) {
                    Text("גובה").tag(MeasureAxis.height)
                    Text("רוחב").tag(MeasureAxis.width)
                }
                TextField("מידה במ״מ", text: $editText)
                    .keyboardType(.decimalPad)
            }
            .navigationTitle("ערוך מידה")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("ביטול") { editing = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("החל") { applyEdit() }
                }
            }
        }
    }

    private func load() {
        guard !loaded else { return }
        guard let stored = library.store.load(partId: partId), let measurement = stored.measurement else { return }
        sequence = stored.sequence
        sessionId = stored.resolvedSessionId
        status = stored.resolvedStatus
        var review = measurement.reviewDraft(kind: stored.sequence.kind)
        if measurement.finish == nil {
            review.finish = FinishCatalog.defaultFinish(for: stored.sequence.kind)
        }
        draft = review
        neckText = review.neckOuterDiameterMm.map { MeasureFormat.millimetres($0) } ?? ""
        picked = ReviewColor.color(review.colorHex)
        if let price = measurement.price {
            priceValue = format(price.value)
            currency = price.currency
            moqText = price.moq.map(String.init) ?? ""
            tiers = (price.tiers ?? []).map { TierRow(minQty: String($0.minQty), value: format($0.value)) }
        }
        loaded = true
        if measurement.finish == nil {
            persist(demoteReady: status == .ready)
        }
        fieldBaseline = fieldSnapshot()
        sampleColorIfNeeded(stored)
        DispatchQueue.main.async { acceptColor = true }
    }

    private func fieldSnapshot() -> String {
        let tiersText = tiers.map { "\($0.minQty)=\($0.value)" }.joined(separator: ";")
        return "\(priceValue)|\(currency)|\(moqText)|\(tiersText)|\(neckText)"
    }

    private func sampleColorIfNeeded(_ stored: ScanDraft) {
        guard !sampled, stored.measurement?.colorSource != "user", stored.measurement?.colorHex == nil else { return }
        sampled = true
        let kind = stored.sequence.kind
        let step = stored.sequence.steps.first { $0.angle == (kind == .box || kind == .label ? .front : .side) && $0.photo != nil }
            ?? stored.sequence.steps.first { $0.photo != nil }
        guard let photo = step?.photo,
              let jpeg = try? library.store.imageData(partId: partId, fileName: photo.fileName) else { return }
        let corners = photo.cardCorners
        DispatchQueue.global(qos: .userInitiated).async {
            let hex = SideColorSampler.dominantHex(jpeg: jpeg, corners: corners)
            DispatchQueue.main.async {
                guard let hex, var draft, draft.colorSource != "user" else { return }
                draft.colorHex = hex
                draft.colorSource = "photo-median"
                self.draft = draft
                picked = ReviewColor.color(hex)
                persist(demoteReady: self.status == .ready)
            }
        }
    }

    private func applyEdit() {
        guard loaded, var draft, let millimetres = ReviewParse.number(editText), millimetres > 0 else {
            editing = false
            return
        }
        draft = ReviewModel.rescale(draft, axis: editAxis, to: millimetres)
        self.draft = draft
        neckText = draft.neckOuterDiameterMm.map { MeasureFormat.millimetres($0) } ?? neckText
        editing = false
        persist(demoteReady: true)
    }

    private func saveToOutbox(_ current: ReviewDraft) {
        guard !ReviewModel.outboxBlocked(current) else { return }
        if let json = ReviewModel.packJSON(current) {
            // Also collect photos if available in draft.scan or draft.measurement
            // The prompt says: photo file URLs.
            // draft.scan has paths. We can construct URLs for them.
            // Wait, we need the file paths on disk.
            var urls: [URL] = []
            if let scan = current.scan {
                if let root = try? Store.ScanFileStore.applicationSupportRoot() {
                    let dir = root.appendingPathComponent(current.partId.uuidString)
                    for step in scan.steps {
                        if let photo = step.photo {
                            urls.append(dir.appendingPathComponent(photo))
                        }
                    }
                }
            }
            
            let item = OutboxItem(packJSON: json, photoURLs: urls, name: current.kind.hebrewName)
            outboxManager.store.add(item)
            outboxManager.processQueue()
        }
        draft = current
        fieldBaseline = fieldSnapshot()
        status = .ready
        persist(status: .ready, demoteReady: false)
    }

    private func markDraft() {
        fieldBaseline = fieldSnapshot()
        status = .draft
        persist(status: .draft, demoteReady: false)
    }

    private func withFields(_ draft: ReviewDraft) -> ReviewDraft {
        let text = neckText.trimmingCharacters(in: .whitespacesAndNewlines)
        let millimetres = text.isEmpty ? nil : ReviewParse.number(text)
        var copy = ReviewModel.setNeck(draft, millimetres: millimetres)
        copy.price = currentPrice()
        return copy
    }

    private func persist(status override: PartReviewStatus? = nil, demoteReady: Bool) {
        guard loaded, let draft, let sequence else { return }
        let current = withFields(draft)
        self.draft = current
        let storedStatus = library.store.load(partId: partId)?.resolvedStatus ?? status
        var next = override ?? storedStatus
        if demoteReady, override == nil, next == .ready {
            next = .needsReview
        }
        status = next
        let base = library.store.load(partId: partId)?.measurement
        let measurement = apply(current, to: base)
        do {
            try library.save(
                sequence: sequence,
                images: [:],
                measurement: measurement,
                sessionId: sessionId ?? partId,
                status: next
            )
        } catch {
            saveFailed = true
        }
    }

    private func apply(_ current: ReviewDraft, to base: DraftMeasurement?) -> DraftMeasurement {
        var measurement = base ?? DraftMeasurement(
            widthMm: current.dimensions.widthMm,
            heightMm: current.dimensions.heightMm,
            depthMm: current.dimensions.depthMm,
            lathe: current.lathe,
            neckOuterDiameterMm: current.neckOuterDiameterMm,
            profile: current.profile,
            measurements: current.measurements,
            scan: current.scan
        )
        measurement.widthMm = current.dimensions.widthMm
        measurement.heightMm = current.dimensions.heightMm
        measurement.depthMm = current.dimensions.depthMm
        measurement.lathe = current.lathe
        measurement.neckOuterDiameterMm = current.neckOuterDiameterMm
        measurement.profile = current.profile
        measurement.measurements = current.measurements
        measurement.scan = current.scan
        measurement.fieldConfidence = current.confidence
        measurement.finish = current.finish
        measurement.finishSource = "user"
        measurement.colorHex = current.colorHex
        measurement.colorSource = current.colorSource
        measurement.price = current.price == nil ? nil : (ReviewModel.storedPrice(current.price, quotedAt: base?.price?.quotedAt) ?? base?.price)
        return measurement
    }

    private func currentPrice() -> ReviewPriceInput? {
        let valueText = priceValue.trimmingCharacters(in: .whitespacesAndNewlines)
        let moq = moqText.trimmingCharacters(in: .whitespacesAndNewlines)
        let rows = tiers.filter { !$0.minQty.isEmpty || !$0.value.isEmpty }
        guard !valueText.isEmpty || !moq.isEmpty || !rows.isEmpty else { return nil }
        return ReviewPriceInput(
            value: ReviewParse.number(valueText),
            currency: currency.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : currency,
            moq: ReviewParse.number(moq),
            tiers: rows.map { ReviewTierInput(minQty: ReviewParse.number($0.minQty), value: ReviewParse.number($0.value)) }
        )
    }

    private func format(_ value: Double) -> String {
        String(format: "%g", locale: Locale(identifier: "en_US_POSIX"), value)
    }
}

private struct TierRow: Identifiable, Equatable {
    let id = UUID()
    var minQty = ""
    var value = ""
}

private enum ReviewParse {
    static func number(_ text: String) -> Double? {
        let cleaned = text
            .replacingOccurrences(of: ",", with: ".")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty, let value = Double(cleaned), value.isFinite else { return nil }
        return value
    }
}

private enum ReviewColor {
    static func color(_ hex: String) -> Color {
        var text = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.hasPrefix("#") { text.removeFirst() }
        guard text.count == 6, let value = UInt32(text, radix: 16) else { return .gray }
        return Color(
            red: Double((value >> 16) & 0xff) / 255,
            green: Double((value >> 8) & 0xff) / 255,
            blue: Double(value & 0xff) / 255
        )
    }

    static func hex(_ color: Color) -> String {
        let resolved = color.resolve(in: EnvironmentValues())
        let r = Int((Double(resolved.red) * 255).rounded())
        let g = Int((Double(resolved.green) * 255).rounded())
        let b = Int((Double(resolved.blue) * 255).rounded())
        return String(format: "#%02X%02X%02X", min(255, max(0, r)), min(255, max(0, g)), min(255, max(0, b)))
    }
}

private enum MeasureFormatColor {
    static func band(_ band: ConfidenceBand) -> Color {
        switch band {
        case .ok: return .green
        case .check: return .yellow
        case .retake: return .red
        }
    }
}
