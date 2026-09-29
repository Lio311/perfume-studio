import ImageIO
import PackKit
import Store
import SwiftUI
import UIKit

/// Dimensions from the capture that just finished, or from a reopened draft.
struct MeasureScreen: View {
    @ObservedObject var model: MeasureModel
    var sequence: CaptureSequence
    var onRetake: (CaptureAngle) -> Void
    var onClose: () -> Void

    @State private var editing = false
    @State private var editAxis: MeasureAxis = .height
    @State private var editText = ""
    @State private var loupe: SIMD2<Double>?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                referenceSection
                if model.referenceKind.needsPoints {
                    pointSection
                }
                if model.referenceKind == .typed {
                    typedSection
                }
                photoSection
                glassSection
                if let issue = model.cardIssue {
                    cardRejected(issue)
                }
                if let message = model.blockingMessage, message != model.cardIssue?.messageHe {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.yellow)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if model.running {
                    ProgressView("מודד…")
                        .tint(.white)
                } else if model.failed {
                    Text("לא נמצאו תמונות למדידה.")
                }
                resultSection
                if !model.validation.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("בדיקת החבילה")
                            .font(.headline)
                        ForEach(Array(model.validation.enumerated()), id: \.offset) { _, issue in
                            Text(issue.messageHe)
                                .font(.footnote)
                                .foregroundStyle(issue.severity == .error ? Color.red : Color.yellow)
                        }
                    }
                }
                Button("שמור מידות") {
                    if model.save(sequence: sequence) {
                        onClose()
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.displayResult?.saveBlocked != false)
                .accessibilityLabel("שמור מידות")
                Button("חזרה לסיכום") { onClose() }
                    .buttonStyle(.bordered)
            }
            .padding(20)
        }
        .background(Color.black.ignoresSafeArea())
        .foregroundStyle(.white)
        .onAppear { model.load() }
        .onDisappear { model.cancel() }
        .alert("שמירה נכשלה", isPresented: $model.saveFailed) {
            Button("סגור", role: .cancel) {}
        } message: {
            Text("לא ניתן לשמור את המידות במכשיר.")
        }
        .sheet(isPresented: $editing) { editSheet }
        .sensoryFeedback(.success, trigger: model.savedTick)
    }

    private var referenceSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("ייחוס")
                .font(.headline)
            Picker("ייחוס", selection: $model.referenceKind) {
                ForEach(MeasureReferenceKind.allCases) { kind in
                    Text(kind.title).tag(kind)
                }
            }
            .pickerStyle(.menu)
            .onChange(of: model.referenceKind) { _, kind in
                UserDefaults.standard.set(kind.rawValue, forKey: "measure.referenceKind")
                model.referenceChanged()
            }
            if model.referenceKind == .printedCard {
                Text("\(MeasureFormat.millimetres(model.printedWidthMm)) × \(MeasureFormat.millimetres(model.printedHeightMm)) מ״מ מההגדרות")
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.75))
            }
            if model.referenceKind == .coin {
                Picker("מטבע", selection: $model.coinID) {
                    ForEach(CoinTable.coins, id: \.id) { coin in
                        Text(coin.nameHe).tag(coin.id)
                    }
                }
                .onChange(of: model.coinID) { _, id in model.selectCoin(id) }
                TextField("קוטר במ״מ", text: $model.diameterText)
                    .keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
                    .onChange(of: model.diameterText) { _, _ in model.lengthsChanged() }
            }
        }
    }

    private var pointSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(model.referenceKind == .ruler ? "הקישו על שני שנתות" : "הקישו על שני הקצוות")
                .font(.footnote)
            if model.referenceKind != .coin {
                TextField("אורך במ״מ", text: $model.lengthText)
                    .keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
                    .onChange(of: model.lengthText) { _, _ in model.lengthsChanged() }
            }
            if model.points.count == 2 {
                let px = hypot(model.points[1].x - model.points[0].x, model.points[1].y - model.points[0].y)
                Text(pointLabel(px: px))
                    .font(.footnote.monospacedDigit())
                    .environment(\.layoutDirection, .leftToRight)
            }
        }
    }

    private var typedSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker("ציר", selection: $model.typedAxis) {
                Text("גובה").tag(MeasureAxis.height)
                Text("רוחב").tag(MeasureAxis.width)
            }
            .pickerStyle(.segmented)
            .onChange(of: model.typedAxis) { _, _ in model.lengthsChanged() }
            TextField("מידה במ״מ", text: $model.lengthText)
                .keyboardType(.decimalPad)
                .textFieldStyle(.roundedBorder)
                .onChange(of: model.lengthText) { _, _ in model.lengthsChanged() }
        }
    }

    @ViewBuilder
    private var photoSection: some View {
        if let photo = model.primary, let data = model.image(for: photo.photo), let image = MeasureImage.upright(from: data) {
            MeasurePhotoCanvas(
                image: image,
                bufferWidth: photo.photo.pixelWidth,
                bufferHeight: photo.photo.pixelHeight,
                corners: photo.corners ?? [],
                silhouette: workingSilhouette(photo),
                dimensions: model.displayResult?.dimensions,
                confidence: model.displayResult?.confidence ?? [],
                points: model.referenceKind.needsPoints ? model.points : [],
                bands: model.glass ? model.bands : [],
                acceptsPoints: model.referenceKind.needsPoints,
                showHandles: model.glass,
                loupe: $loupe,
                onPoint: { index, point, ended in
                    model.setPoint(index: index, buffer: point, snap: true)
                    loupe = ended ? nil : point
                },
                onBand: { index, isLeft, x in
                    model.moveBand(index: index, left: isLeft, bufferX: x)
                }
            )
            .frame(height: 420)
        }
    }

    private var glassSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle("מצב זכוכית", isOn: Binding(
                get: { model.glass },
                set: { model.setGlass($0) }
            ))
            if model.glass {
                Text("גררו את הידיות בשני צדי כל פס. הפרופיל והמידות מתעדכנים.")
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.75))
                Text("\(model.bands.count * 2) ידיות")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.6))
            } else if model.primary?.needsOutlineReview == true {
                Text("המסכה חלשה. הפעילו מצב זכוכית ועדכנו את קווי המתאר.")
                    .font(.footnote)
                    .foregroundStyle(.yellow)
            }
        }
    }

    private func cardRejected(_ issue: MeasureIssue) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(issue.messageHe)
                .font(.footnote)
                .foregroundStyle(.red)
            Button("צלם שוב") { onRetake(model.primaryAngle) }
                .buttonStyle(.borderedProminent)
                .accessibilityLabel("צלם שוב")
            Text("אפשר גם להחליף ייחוס למעלה.")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.7))
        }
    }

    @ViewBuilder
    private var resultSection: some View {
        if let result = model.displayResult, result.dimensions.heightMm > 0 || result.dimensions.widthMm > 0 {
            VStack(alignment: .leading, spacing: 10) {
                Text(MeasureFormat.triple(result.dimensions))
                    .font(.title3.bold().monospacedDigit())
                confidenceRow(result.confidence)
                Picker("צורה", selection: Binding(
                    get: { model.shape },
                    set: { model.lockShape($0) }
                )) {
                    ForEach([ShapeHint.cylinder, .taper, .dome, .sphere, .cube, .other], id: \.self) { hint in
                        Text(MeasureFormat.shape(hint)).tag(hint)
                    }
                }
                if let neck = result.neckOuterDiameterMm {
                    Text("קוטר צוואר חיצוני \(MeasureFormat.millimetres(neck)) מ״מ")
                        .font(.footnote.monospacedDigit())
                    Text("לאימות מול הספק")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.7))
                }
                #if DEBUG
                if let truth = model.truth {
                    Text("אמת \(MeasureFormat.millimetres(truth.widthMm)) × \(MeasureFormat.millimetres(truth.heightMm)) × \(MeasureFormat.millimetres(truth.depthMm))")
                        .font(.footnote.monospacedDigit())
                    let within = abs(result.dimensions.widthMm - truth.widthMm) <= 5
                        && abs(result.dimensions.heightMm - truth.heightMm) <= 5
                        && abs(result.dimensions.depthMm - truth.depthMm) <= 5
                    Text(within ? "בטווח 5 מ״מ" : "מחוץ לטווח 5 מ״מ")
                        .font(.caption.bold())
                        .foregroundStyle(within ? Color.green : Color.red)
                }
                #endif
                Button("ערוך מידה") {
                    editAxis = .height
                    editText = MeasureFormat.millimetres(result.dimensions.heightMm)
                    editing = true
                }
                .buttonStyle(.bordered)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }

    private func confidenceRow(_ items: [DimensionConfidence]) -> some View {
        HStack(spacing: 8) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                Text("\(MeasureFormat.axisName(item.key)) \(MeasureFormat.band(item.model.band))")
                    .font(.caption.bold())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(MeasureColors.band(item.model.band).opacity(0.85), in: Capsule())
                    .foregroundStyle(.black)
            }
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
                    Button("החל") {
                        if let mm = MeasureParse.millimetres(editText) {
                            model.applyRescale(axis: editAxis, millimetres: mm)
                        }
                        editing = false
                    }
                }
            }
        }
    }

    private func workingSilhouette(_ photo: MeasurePreparedPhoto) -> Silhouette? {
        if model.glass, !model.bands.isEmpty {
            return OutlineHandles.silhouette(from: model.bands, width: photo.photo.pixelWidth, height: photo.photo.pixelHeight)
        }
        return photo.silhouette
    }

    private func pointLabel(px: Double) -> String {
        if let mm = model.knownLengthMm {
            return String(format: "%.0f px · %.1f מ״מ", locale: Locale(identifier: "en_US_POSIX"), px, mm)
        }
        return String(format: "%.0f px", locale: Locale(identifier: "en_US_POSIX"), px)
    }

    private func hypot(_ x: Double, _ y: Double) -> Double {
        (x * x + y * y).squareRoot()
    }
}

private enum MeasureColors {
    static func band(_ band: ConfidenceBand) -> Color {
        switch band {
        case .ok: return .green
        case .check: return .yellow
        case .retake: return .red
        }
    }
}

/// Side (or front) photo with the card, outline, axis, and draggable points.
struct MeasurePhotoCanvas: View {
    var image: UIImage
    var bufferWidth: Int
    var bufferHeight: Int
    var corners: [SIMD2<Double>]
    var silhouette: Silhouette?
    var dimensions: Dimensions?
    var confidence: [DimensionConfidence]
    var points: [SIMD2<Double>]
    var bands: [OutlineBand]
    var acceptsPoints: Bool
    var showHandles: Bool
    @Binding var loupe: SIMD2<Double>?
    var onPoint: (Int, SIMD2<Double>, Bool) -> Void
    var onBand: (Int, Bool, Double) -> Void

    @State private var upright: UIImage?
    @State private var drag: DragTarget?

    private let orientation = VisionImageOrientation.backCameraPortrait

    var body: some View {
        GeometryReader { proxy in
            let rect = fitted(in: proxy.size)
            ZStack {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(width: proxy.size.width, height: proxy.size.height)
                Canvas { context, size in
                    draw(in: &context, size: size)
                }
                if let loupe, let upright {
                    loupeView(upright: upright, buffer: loupe, rect: rect, canvas: proxy.size)
                }
            }
            .contentShape(Rectangle())
            .gesture(dragGesture(in: rect))
            .environment(\.layoutDirection, .leftToRight)
        }
        .onAppear { upright = UprightBitmap.render(image) }
    }

    private func dragGesture(in rect: CGRect) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                guard rect.contains(value.startLocation) || drag != nil else { return }
                let buffer = bufferPoint(from: value.location, rect: rect)
                if drag == nil {
                    drag = begin(at: value.startLocation, rect: rect, buffer: buffer)
                }
                guard let drag else { return }
                switch drag {
                case let .point(index):
                    onPoint(index, buffer, false)
                    loupe = buffer
                case let .handle(index, isLeft):
                    onBand(index, isLeft, buffer.x)
                    loupe = buffer
                }
            }
            .onEnded { value in
                let buffer = bufferPoint(from: value.location, rect: rect)
                if let drag {
                    if case let .point(index) = drag {
                        onPoint(index, buffer, true)
                    } else if case let .handle(index, isLeft) = drag {
                        onBand(index, isLeft, buffer.x)
                    }
                }
                drag = nil
                loupe = nil
            }
    }

    private func begin(at location: CGPoint, rect: CGRect, buffer: SIMD2<Double>) -> DragTarget? {
        if showHandles, let hit = hitHandle(location, rect: rect) {
            return .handle(hit.0, hit.1)
        }
        if acceptsPoints {
            if let index = hitPoint(location, rect: rect) {
                return .point(index)
            }
            if points.count < 2 {
                onPoint(points.count, buffer, false)
                return .point(points.count)
            }
            if let index = nearestPoint(location, rect: rect) {
                return .point(index)
            }
        }
        return nil
    }

    private func draw(in context: inout GraphicsContext, size: CGSize) {
        let rect = fitted(in: size)
        if corners.count == 4 {
            var path = Path()
            path.move(to: viewPoint(corners[0], rect: rect))
            for corner in corners.dropFirst() {
                path.addLine(to: viewPoint(corner, rect: rect))
            }
            path.closeSubpath()
            context.stroke(path, with: .color(.white), lineWidth: 2)
        }
        if let silhouette, let model = MeasureOverlayGeometry.model(silhouette: silhouette), model.outline.count >= 2 {
            var path = Path()
            path.move(to: viewPoint(model.outline[0], rect: rect))
            for point in model.outline.dropFirst() {
                path.addLine(to: viewPoint(point, rect: rect))
            }
            path.closeSubpath()
            context.stroke(path, with: .color(.cyan), lineWidth: 2)
            stroke(model.axis, color: .white, in: &context, rect: rect)
            stroke(model.width, color: MeasureColors.band(band(for: "widthMm")), in: &context, rect: rect)
            stroke(model.height, color: MeasureColors.band(band(for: "heightMm")), in: &context, rect: rect)
            if let dimensions {
                label(MeasureFormat.millimetres(dimensions.widthMm), at: midpoint(model.width), rect: rect, in: &context)
                label(MeasureFormat.millimetres(dimensions.heightMm), at: midpoint(model.height), rect: rect, in: &context)
            }
        }
        for point in points {
            let center = viewPoint(point, rect: rect)
            let dot = Path(ellipseIn: CGRect(x: center.x - 7, y: center.y - 7, width: 14, height: 14))
            context.fill(dot, with: .color(.orange))
        }
        if showHandles {
            for band in bands {
                for x in [band.left, band.right] {
                    let center = viewPoint(SIMD2(x, band.y), rect: rect)
                    let dot = Path(ellipseIn: CGRect(x: center.x - 8, y: center.y - 8, width: 16, height: 16))
                    context.stroke(dot, with: .color(.yellow), lineWidth: 2)
                }
            }
        }
    }

    private func stroke(_ span: MeasureSpan, color: Color, in context: inout GraphicsContext, rect: CGRect) {
        var path = Path()
        path.move(to: viewPoint(span.start, rect: rect))
        path.addLine(to: viewPoint(span.end, rect: rect))
        context.stroke(path, with: .color(color), lineWidth: 2)
    }

    private func label(_ text: String, at point: SIMD2<Double>, rect: CGRect, in context: inout GraphicsContext) {
        let resolved = context.resolve(Text(text).font(.caption.bold()).foregroundStyle(.white))
        context.draw(resolved, at: viewPoint(point, rect: rect), anchor: .bottom)
    }

    private func midpoint(_ span: MeasureSpan) -> SIMD2<Double> {
        SIMD2((span.start.x + span.end.x) / 2, (span.start.y + span.end.y) / 2)
    }

    private func band(for key: String) -> ConfidenceBand {
        confidence.first { $0.key == key }?.model.band ?? .check
    }

    private func loupeView(upright image: UIImage, buffer: SIMD2<Double>, rect: CGRect, canvas: CGSize) -> some View {
        let up = DisplayImageSpace.uprightPoint(
            fromBuffer: buffer,
            bufferWidth: Double(bufferWidth),
            bufferHeight: Double(bufferHeight),
            orientation: orientation
        )
        let finger = viewPoint(buffer, rect: rect)
        return Loupe(image: image, upright: up)
            .position(x: min(canvas.width - 60, max(60, finger.x)), y: max(60, finger.y - 90))
    }

    private func fitted(in size: CGSize) -> CGRect {
        let pixels = orientedSize
        guard pixels.width > 0, pixels.height > 0, size.width > 0, size.height > 0 else { return .zero }
        let scale = min(size.width / pixels.width, size.height / pixels.height)
        let width = pixels.width * scale
        let height = pixels.height * scale
        return CGRect(x: (size.width - width) / 2, y: (size.height - height) / 2, width: width, height: height)
    }

    private var orientedSize: CGSize {
        let size = DisplayImageSpace.orientedSize(
            bufferWidth: Double(bufferWidth),
            bufferHeight: Double(bufferHeight),
            orientation: orientation
        )
        return CGSize(width: size.width, height: size.height)
    }

    private func viewPoint(_ buffer: SIMD2<Double>, rect: CGRect) -> CGPoint {
        let up = DisplayImageSpace.uprightPoint(
            fromBuffer: buffer,
            bufferWidth: Double(bufferWidth),
            bufferHeight: Double(bufferHeight),
            orientation: orientation
        )
        let size = orientedSize
        guard size.width > 0, size.height > 0 else { return .zero }
        return CGPoint(
            x: rect.minX + up.x / size.width * rect.width,
            y: rect.minY + up.y / size.height * rect.height
        )
    }

    private func bufferPoint(from location: CGPoint, rect: CGRect) -> SIMD2<Double> {
        let size = orientedSize
        guard rect.width > 0, rect.height > 0 else { return .zero }
        let up = SIMD2(
            (location.x - rect.minX) / rect.width * size.width,
            (location.y - rect.minY) / rect.height * size.height
        )
        return DisplayImageSpace.bufferPoint(
            fromUpright: up,
            bufferWidth: Double(bufferWidth),
            bufferHeight: Double(bufferHeight),
            orientation: orientation
        )
    }

    private func hitPoint(_ location: CGPoint, rect: CGRect) -> Int? {
        for (index, point) in points.enumerated() {
            let center = viewPoint(point, rect: rect)
            if hypot(location.x - center.x, location.y - center.y) < 28 { return index }
        }
        return nil
    }

    private func nearestPoint(_ location: CGPoint, rect: CGRect) -> Int? {
        var best: (Int, CGFloat)?
        for (index, point) in points.enumerated() {
            let center = viewPoint(point, rect: rect)
            let distance = hypot(location.x - center.x, location.y - center.y)
            if best == nil || distance < best!.1 { best = (index, distance) }
        }
        return best?.0
    }

    private func hitHandle(_ location: CGPoint, rect: CGRect) -> (Int, Bool)? {
        var best: (Int, Bool, CGFloat)?
        for (index, band) in bands.enumerated() {
            for (isLeft, x) in [(true, band.left), (false, band.right)] {
                let center = viewPoint(SIMD2(x, band.y), rect: rect)
                let distance = hypot(location.x - center.x, location.y - center.y)
                if distance < 28, best == nil || distance < best!.2 {
                    best = (index, isLeft, distance)
                }
            }
        }
        if let best { return (best.0, best.1) }
        return nil
    }
}

private enum DragTarget {
    case point(Int)
    case handle(Int, Bool)
}

private struct Loupe: View {
    var image: UIImage
    var upright: SIMD2<Double>

    var body: some View {
        let crop = crop()
        ZStack {
            if let crop {
                Image(decorative: crop, scale: 1)
                    .resizable()
                    .interpolation(.none)
                    .frame(width: 116, height: 116)
            } else {
                Circle().fill(Color.black)
                    .frame(width: 116, height: 116)
            }
            Circle().stroke(.white, lineWidth: 2).frame(width: 116, height: 116)
            Path { path in
                path.move(to: CGPoint(x: 58, y: 46))
                path.addLine(to: CGPoint(x: 58, y: 70))
                path.move(to: CGPoint(x: 46, y: 58))
                path.addLine(to: CGPoint(x: 70, y: 58))
            }
            .stroke(.yellow, lineWidth: 1)
        }
        .clipShape(Circle())
        .shadow(radius: 6)
        .allowsHitTesting(false)
    }

    private func crop() -> CGImage? {
        guard let cg = image.cgImage else { return nil }
        let side = min(56, CGFloat(cg.width), CGFloat(cg.height))
        guard side >= 8 else { return nil }
        var origin = CGRect(
            x: CGFloat(upright.x) - side / 2,
            y: CGFloat(upright.y) - side / 2,
            width: side,
            height: side
        )
        origin.origin.x = min(max(0, origin.origin.x), CGFloat(cg.width) - side)
        origin.origin.y = min(max(0, origin.origin.y), CGFloat(cg.height) - side)
        return cg.cropping(to: origin.integral)
    }
}

enum MeasureImage {
    /// Saved-image pixels, shown upright. Orientation stays `.right` even when the file has no EXIF.
    static func upright(from data: Data) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: false,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
                ?? CGImageSourceCreateImageAtIndex(source, 0, nil) else { return nil }
        return UIImage(cgImage: image, scale: 1, orientation: .right)
    }
}

private enum UprightBitmap {
    static func render(_ image: UIImage) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let size = CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }
}
