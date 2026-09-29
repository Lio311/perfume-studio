import Foundation
import PackKit
import MeasureKit
import Store

enum MeasureReferenceKind: String, CaseIterable, Identifiable {
    case creditCard
    case printedCard
    case coin
    case ruler
    case custom
    case typed

    var id: String { rawValue }

    var title: String {
        switch self {
        case .creditCard: return "כרטיס אשראי"
        case .printedCard: return "כרטיס סריקה מודפס"
        case .coin: return "מטבע"
        case .ruler: return "סרגל"
        case .custom: return "חפץ אחר"
        case .typed: return "הקלדת מידה"
        }
    }

    var needsPoints: Bool {
        switch self {
        case .coin, .ruler, .custom: return true
        case .creditCard, .printedCard, .typed: return false
        }
    }
}

enum MeasureParse {
    static func millimetres(_ text: String) -> Double? {
        let cleaned = text
            .replacingOccurrences(of: ",", with: ".")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value = Double(cleaned), value.isFinite, value > 0 else { return nil }
        return value
    }
}

/// Measure screen state. Masking runs on `MeasurePipeline`; dimensions come from PackKit.
@MainActor
final class MeasureModel: ObservableObject {
    let kind: PartKind
    let partId: UUID
    private let library: DraftLibrary
    private let pipeline = MeasurePipeline()
    private var jpegs: [String: Data] = [:]
    private var heldRescale: (MeasureAxis, Double)?
    private var shapeLocked = false

    @Published var prepared: MeasurePrepared?
    @Published var result: MeasureResult?
    @Published var running = false
    @Published var failed = false
    @Published var referenceKind: MeasureReferenceKind
    @Published var printedWidthMm: Double
    @Published var printedHeightMm: Double
    @Published var coinID: String
    @Published var diameterText: String
    @Published var lengthText: String
    @Published var typedAxis: MeasureAxis
    @Published var points: [SIMD2<Double>] = []
    @Published var glass = false
    @Published var bands: [OutlineBand] = []
    @Published var shape: ShapeHint = .other
    @Published var validation: [Issue] = []
    @Published var savedTick = 0
    @Published var saveFailed = false
    #if DEBUG
    @Published var truth: MeasureSample?
    #endif

    init(
        library: DraftLibrary,
        sequence: CaptureSequence,
        referenceKind: MeasureReferenceKind,
        printedWidthMm: Double,
        printedHeightMm: Double
    ) {
        self.library = library
        self.kind = sequence.kind
        self.partId = sequence.partId
        self.referenceKind = referenceKind
        self.printedWidthMm = printedWidthMm
        self.printedHeightMm = printedHeightMm
        let coin = CoinTable.coins.first
        self.coinID = coin?.id ?? ""
        self.diameterText = coin.map { String(format: "%g", $0.diameterMm) } ?? ""
        self.lengthText = ""
        self.typedAxis = .height
    }

    var primaryAngle: CaptureAngle {
        switch kind {
        case .box, .label: return .front
        case .bottle, .cap, .pump, .collar: return .side
        }
    }

    var primary: MeasurePreparedPhoto? {
        prepared?.photo(for: primaryAngle) ?? prepared?.photos.first
    }

    var displayResult: MeasureResult? {
        guard var result else { return nil }
        result.shape = shape
        return result
    }

    var blockingMessage: String? {
        result?.issues.first { $0.blocksSave }?.messageHe
    }

    var cardIssue: MeasureIssue? {
        guard referenceKind == .creditCard || referenceKind == .printedCard else { return nil }
        return result?.issues.first { $0.code == "card_tilt" || $0.code == "card_too_small" }
    }

    var knownLengthMm: Double? {
        switch referenceKind {
        case .coin: return MeasureParse.millimetres(diameterText)
        case .ruler, .custom, .typed: return MeasureParse.millimetres(lengthText)
        case .creditCard, .printedCard: return nil
        }
    }

    func load() {
        let draft = library.store.load(partId: partId)
        let photos = draft?.sequence.steps.compactMap(\.photo) ?? []
        var images: [String: Data] = [:]
        for photo in photos {
            if let data = try? library.store.imageData(partId: partId, fileName: photo.fileName) {
                images[photo.fileName] = data
            }
        }
        jpegs = images
        let inputs = photos.compactMap { photo -> MeasurePhotoInput? in
            guard let jpeg = images[photo.fileName] else { return nil }
            return MeasurePhotoInput(jpeg: jpeg, photo: photo)
        }
        guard !inputs.isEmpty else {
            failed = true
            return
        }
        running = true
        failed = false
        pipeline.prepare(inputs) { [weak self] prepared in
            Task { @MainActor in
                guard let self else { return }
                self.running = false
                guard let prepared else { return }
                self.prepared = prepared
                if prepared.photos.contains(where: \.needsOutlineReview) {
                    self.glass = true
                }
                #if DEBUG
                self.truth = Self.matchingSample(prepared.photos.map(\.photo.fileName))
                #endif
                self.rebuildBands()
                self.recompute()
            }
        }
    }

    #if DEBUG
    private static func matchingSample(_ names: [String]) -> MeasureSample? {
        if names.contains("measure-bottle.jpg") { return MeasureSampleLibrary.bottle }
        if names.contains("measure-cap-side.jpg") { return MeasureSampleLibrary.cap }
        if names.contains("measure-box-front.jpg") { return MeasureSampleLibrary.box }
        return nil
    }
    #endif

    func cancel() {
        pipeline.cancel()
    }

    func selectCoin(_ id: String) {
        coinID = id
        if let spec = CoinTable.coin(id: id) {
            diameterText = String(format: "%g", spec.diameterMm)
        }
        heldRescale = nil
        recompute()
    }

    func setPoint(index: Int, buffer: SIMD2<Double>, snap: Bool) {
        var point = buffer
        if snap, let primary {
            point = primary.snap(point)
        }
        if index < points.count {
            points[index] = point
        } else if points.count < 2 {
            points.append(point)
        }
        heldRescale = nil
        recompute()
    }

    func setGlass(_ on: Bool) {
        glass = on
        if on { rebuildBands() }
        heldRescale = nil
        recompute()
    }

    func moveBand(index: Int, left: Bool, bufferX: Double) {
        guard bands.indices.contains(index) else { return }
        if left {
            bands[index].left = min(bufferX, bands[index].right - 1)
        } else {
            bands[index].right = max(bufferX, bands[index].left + 1)
        }
        heldRescale = nil
        recompute()
    }

    func referenceChanged() {
        points = []
        heldRescale = nil
        recompute()
    }

    func lengthsChanged() {
        heldRescale = nil
        recompute()
    }

    func lockShape(_ hint: ShapeHint) {
        shape = hint
        shapeLocked = true
        refreshValidation()
    }

    func applyRescale(axis: MeasureAxis, millimetres: Double) {
        guard let result else { return }
        heldRescale = (axis, millimetres)
        self.result = Rescale.apply(result, axis: axis, to: millimetres)
        refreshValidation()
    }

    @discardableResult
    func save(sequence: CaptureSequence) -> Bool {
        guard let current = displayResult, !current.saveBlocked else { return false }
        let measurement = DraftMeasurement(result: current)
        do {
            try library.save(sequence: sequence, images: [:], measurement: measurement)
            validation = measurement.validationIssues(kind: kind)
            savedTick += 1
            return true
        } catch {
            saveFailed = true
            return false
        }
    }

    func image(for photo: CapturedPhoto) -> Data? {
        jpegs[photo.fileName]
    }

    private func recompute() {
        guard let prepared else { return }
        let photos = prepared.photos.map { item -> MeasureAssemblyPhoto in
            var silhouette = item.silhouette
            if item.photo.angle == primaryAngle, glass, !bands.isEmpty {
                silhouette = OutlineHandles.silhouette(
                    from: bands,
                    width: item.photo.pixelWidth,
                    height: item.photo.pixelHeight
                )
            }
            return MeasureAssemblyPhoto(
                angle: item.photo.angle,
                intrinsics: item.photo.intrinsics,
                pixelWidth: item.photo.pixelWidth,
                pixelHeight: item.photo.pixelHeight,
                silhouette: silhouette,
                cardCorners: item.corners,
                lidarDepthMm: item.photo.distanceSource == .lidar ? item.photo.distanceMm : nil,
                capturedAt: iso(item.photo.capturedAt),
                device: item.photo.deviceModel
            )
        }
        let primaryPhoto = photos.first { $0.angle == primaryAngle } ?? photos.first
        let auto = MeasureAssembly.lidarScale(depthMm: primaryPhoto?.lidarDepthMm, focalX: primaryPhoto?.intrinsics.fx ?? 0)
        var estimated = MeasureAssembly.estimate(MeasureAssemblyRequest(
            kind: kind,
            photos: photos,
            reference: makeReference(primary: primaryPhoto),
            autoScale: auto,
            outlineEdited: glass
        ))
        if let heldRescale {
            estimated = Rescale.apply(estimated, axis: heldRescale.0, to: heldRescale.1)
        }
        if !shapeLocked {
            shape = estimated.shape
        }
        estimated.shape = shape
        result = estimated
        refreshValidation()
    }

    private func makeReference(primary: MeasureAssemblyPhoto?) -> ScaleReference? {
        switch referenceKind {
        case .creditCard:
            guard let corners = primary?.cardCorners, corners.count == 4 else { return nil }
            return .card(corners, size: .id1)
        case .printedCard:
            guard let corners = primary?.cardCorners, corners.count == 4,
                  printedWidthMm > 1, printedHeightMm > 1 else { return nil }
            return .card(corners, size: CardReference(widthMm: printedWidthMm, heightMm: printedHeightMm))
        case .coin:
            guard points.count == 2, let mm = MeasureParse.millimetres(diameterText) else { return nil }
            return .coin(p1: points[0], p2: points[1], diameterMm: mm)
        case .ruler:
            guard points.count == 2, let mm = MeasureParse.millimetres(lengthText) else { return nil }
            return .ruler(p1: points[0], p2: points[1], mm: mm)
        case .custom:
            guard points.count == 2, let mm = MeasureParse.millimetres(lengthText) else { return nil }
            return .custom(p1: points[0], p2: points[1], mm: mm)
        case .typed:
            guard let mm = MeasureParse.millimetres(lengthText) else { return nil }
            return .typedDimension(axis: typedAxis, mm: mm)
        }
    }

    private func rebuildBands() {
        guard let photo = primary, let silhouette = photo.silhouette else {
            bands = []
            return
        }
        bands = OutlineHandles.bands(from: silhouette)
    }

    private func refreshValidation() {
        guard let displayResult else {
            validation = []
            return
        }
        validation = DraftMeasurement(result: displayResult).validationIssues(kind: kind)
    }

    private func iso(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }
}

enum MeasureFormat {
    static func millimetres(_ value: Double) -> String {
        String(format: "%.1f", locale: Locale(identifier: "en_US_POSIX"), value)
    }

    static func triple(_ dimensions: Dimensions) -> String {
        "\(millimetres(dimensions.widthMm)) × \(millimetres(dimensions.heightMm)) × \(millimetres(dimensions.depthMm)) מ״מ"
    }

    static func band(_ band: ConfidenceBand) -> String {
        switch band {
        case .ok: return "תקין"
        case .check: return "לבדיקה"
        case .retake: return "לצלם מחדש"
        }
    }

    static func axisName(_ key: String) -> String {
        switch key {
        case "widthMm": return "רוחב"
        case "heightMm": return "גובה"
        case "depthMm": return "עומק"
        case "neckOuterDiameterMm": return "קוטר צוואר"
        default: return key
        }
    }

    static func shape(_ hint: ShapeHint) -> String {
        switch hint {
        case .cylinder: return "גליל"
        case .taper: return "חרוט"
        case .dome: return "כיפה"
        case .sphere: return "כדור"
        case .cube: return "קובייה"
        case .other: return "אחר"
        }
    }
}
