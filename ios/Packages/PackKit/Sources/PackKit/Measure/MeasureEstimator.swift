import Foundation

public struct MeasureRequest: Sendable {
    public var kind: PartKind
    public var intrinsics: CameraIntrinsics
    public var frame: PixelSize
    public var reference: ScaleReference?
    public var autoScale: ScaleReference?
    public var front: Silhouette?
    public var side: Silhouette?
    /// Replaces the card depth in the parallax model when it is a positive finite reading.
    public var lidarDepthMm: Double?
    /// Glass outline was edited by hand. Forces the confidence band to `check` unless it is already `retake`.
    public var outlineEdited: Bool
    public var capturedAt: String
    public var device: String?

    public init(
        kind: PartKind,
        intrinsics: CameraIntrinsics,
        frame: PixelSize,
        reference: ScaleReference? = nil,
        autoScale: ScaleReference? = nil,
        front: Silhouette? = nil,
        side: Silhouette? = nil,
        lidarDepthMm: Double? = nil,
        outlineEdited: Bool = false,
        capturedAt: String = "2026-09-29T00:00:00Z",
        device: String? = nil
    ) {
        self.kind = kind
        self.intrinsics = intrinsics
        self.frame = frame
        self.reference = reference
        self.autoScale = autoScale
        self.front = front
        self.side = side
        self.lidarDepthMm = lidarDepthMm
        self.outlineEdited = outlineEdited
        self.capturedAt = capturedAt
        self.device = device
    }
}

public struct MeasureResult: Equatable, Sendable {
    public var kind: PartKind
    public var dimensions: Dimensions
    public var profile: LatheProfile?
    /// Schema `lathe` array. Nil for a box or a label.
    public var lathe: [Double]?
    public var neckOuterDiameterMm: Double?
    public var shape: ShapeHint
    public var measurements: [Measurements]
    public var scan: ScanInfo?
    public var confidence: [DimensionConfidence]
    public var issues: [MeasureIssue]
    public var suspect: Bool
    public var saveBlocked: Bool
    public var dimsVerifiedBySupplier: Bool
    public var toleranceMm: Double
    public var scale: ScaleSolution?

    public init(
        kind: PartKind,
        dimensions: Dimensions,
        profile: LatheProfile?,
        lathe: [Double]?,
        neckOuterDiameterMm: Double?,
        shape: ShapeHint,
        measurements: [Measurements],
        scan: ScanInfo?,
        confidence: [DimensionConfidence],
        issues: [MeasureIssue],
        suspect: Bool,
        saveBlocked: Bool,
        dimsVerifiedBySupplier: Bool,
        toleranceMm: Double,
        scale: ScaleSolution?
    ) {
        self.kind = kind
        self.dimensions = dimensions
        self.profile = profile
        self.lathe = lathe
        self.neckOuterDiameterMm = neckOuterDiameterMm
        self.shape = shape
        self.measurements = measurements
        self.scan = scan
        self.confidence = confidence
        self.issues = issues
        self.suspect = suspect
        self.saveBlocked = saveBlocked
        self.dimsVerifiedBySupplier = dimsVerifiedBySupplier
        self.toleranceMm = toleranceMm
        self.scale = scale
    }

    /// Minimal supplier pack holding this part. `PackValidator` checks the dimension ranges.
    public func packJSON() -> Data? {
        let part = partObject()
        let pack: [String: Any] = [
            "id": "measure-draft",
            "name": "measure",
            "createdAt": 0,
            "parts": [part],
        ]
        return try? JSONSerialization.data(withJSONObject: pack, options: [.sortedKeys])
    }

    public func validationIssues() -> [Issue] {
        guard let data = packJSON() else {
            return []
        }
        return PackValidator.issues(inPackJSON: data)
    }

    private func partObject() -> [String: Any] {
        var part: [String: Any] = [
            "id": "measure-draft-part",
            "kind": kind.rawValue,
            "code": "DRAFT",
            "name": "draft",
            "neck": NSNull(),
            "widthMm": dimensions.widthMm,
            "heightMm": dimensions.heightMm,
            "depthMm": dimensions.depthMm,
            "capacityMl": NSNull(),
            "profile": shape.rawValue,
            "color": "#888888",
            "thumb": "",
            "page": 1,
        ]
        if let lathe { part["lathe"] = lathe }
        if !measurements.isEmpty {
            part["measurements"] = measurements.map { item -> [String: Any] in
                var object: [String: Any] = [
                    "key": item.key,
                    "value": item.value,
                    "source": item.source,
                ]
                if let tolerance = item.toleranceMm { object["toleranceMm"] = tolerance }
                return object
            }
        }
        if let scan {
            var object: [String: Any] = [
                "method": scan.method,
                "capturedAt": scan.capturedAt,
                "dimsVerifiedBySupplier": false,
                "toleranceMm": ScaleLimits.toleranceMillimetres,
            ]
            if let device = scan.device { object["device"] = device }
            if let scale = scan.scale { object["scale"] = scale }
            if let reference = scan.referenceObject { object["referenceObject"] = reference }
            if let confidence = scan.confidence { object["confidence"] = confidence }
            part["scan"] = object
        }
        return part
    }
}

public enum MeasureEstimator {
    public static func estimate(_ request: MeasureRequest) -> MeasureResult {
        let extent = request.front.flatMap(pixelExtent(of:))
        let manual = request.reference.map {
            ScaleSolver.solve(
                reference: $0,
                intrinsics: request.intrinsics,
                frame: request.frame,
                extent: extent,
                lidarDepthMm: request.lidarDepthMm
            )
        }
        let auto = request.autoScale.map {
            ScaleSolver.solve(
                reference: $0,
                intrinsics: request.intrinsics,
                frame: request.frame,
                extent: extent,
                lidarDepthMm: request.lidarDepthMm
            )
        }
        let manualUsable = manual?.isUsable == true
        let chosen = manualUsable ? manual : (auto?.isUsable == true ? auto : manual)
        let measured = chosen.flatMap { measure(request, scale: $0) }
        let size = measured.map { max($0.dimensions.widthMm, $0.dimensions.heightMm, $0.dimensions.depthMm) } ?? 0
        let manualHeight = manualUsable ? measured?.dimensions.heightMm : nil
        let autoHeight = autoPixelHeight(request: request, auto: auto)
        let rule = ScaleRule.evaluate(
            kind: request.kind,
            measuredSizeMm: size,
            hasReferenceObject: manualUsable && isReferenceObject(manual?.source),
            hasTypedDimension: manualUsable && manual?.source == .typed,
            hasAuto: auto?.isUsable == true,
            manualMillimetres: manualHeight,
            autoMillimetres: autoHeight
        )
        var issues = rule.issues
        if let failure = chosen?.issue ?? manual?.issue {
            issues.insert(failure, at: 0)
        }
        let usableScale = manualUsable || (auto?.isUsable == true && !rule.autoRejected)
        let blocked = rule.saveBlocked || (chosen?.issue?.blocksSave == true) || measured == nil || !usableScale
        let quant = quantisation(scale: chosen, intrinsics: request.intrinsics)
        let parallax = measured?.parallaxResidualMm ?? 0
        let scaleIsUsable = usableScale && measured != nil
        let error = MeasureConfidence.model(
            sigmaScaleMm: chosen?.sigmaScaleMm ?? 10,
            sigmaQuantisationMm: quant,
            sigmaParallaxMm: parallax,
            hasScale: scaleIsUsable,
            outlineEdited: request.outlineEdited
        )
        let dimensions = measured?.dimensions ?? Dimensions(widthMm: 0, heightMm: 0, depthMm: 0)
        let keys = confidenceKeys(kind: request.kind, neck: measured?.neckOuterDiameterMm)
        let confidence = keys.map { DimensionConfidence(key: $0, model: error) }
        let worst = confidence.map(\.model.band).min { rank($0) < rank($1) } ?? .retake
        let scan = makeScan(request: request, scale: chosen, band: worst)
        let measurements = makeMeasurements(measured: measured, source: chosen?.measurementSource ?? "estimate")
        let saveBlocked = blocked || issues.contains { $0.blocksSave }
        return MeasureResult(
            kind: request.kind,
            dimensions: dimensions,
            profile: measured?.profile,
            lathe: measured?.lathe,
            neckOuterDiameterMm: measured?.neckOuterDiameterMm,
            shape: measured?.shape ?? .other,
            measurements: measurements,
            scan: scan,
            confidence: confidence,
            issues: issues,
            suspect: rule.suspect,
            saveBlocked: saveBlocked,
            dimsVerifiedBySupplier: false,
            toleranceMm: ScaleLimits.toleranceMillimetres,
            scale: chosen
        )
    }

    private struct MeasuredPart {
        var dimensions: Dimensions
        var profile: LatheProfile?
        var lathe: [Double]?
        var neckOuterDiameterMm: Double?
        var shape: ShapeHint
        var parallaxResidualMm: Double
    }

    private static func measure(_ request: MeasureRequest, scale: ScaleSolution) -> MeasuredPart? {
        guard scale.isUsable, let front = request.front else { return nil }
        if isRound(request.kind) {
            let distance = scale.source == .card ? scale.depthMm : nil
            guard let extraction = ProfileExtractor.extract(
                silhouette: front,
                intrinsics: request.intrinsics,
                distanceMm: distance,
                millimetresPerPixel: scale.mmPerPx
            ) else { return nil }
            let shape = ShapeClassifier.classify(
                radiiMm: extraction.observedRadiiMm,
                rectangleFit: extraction.rectangleFit,
                kind: request.kind
            )
            return MeasuredPart(
                dimensions: DimensionEstimator.roundDimensions(kind: request.kind, extraction: extraction),
                profile: extraction.profile,
                lathe: extraction.profile.normalized,
                neckOuterDiameterMm: extraction.neckOuterDiameterMm,
                shape: shape,
                parallaxResidualMm: extraction.parallaxResidualMm
            )
        }
        let face: PlanarFace?
        if let plane = scale.plane, scale.source == .card {
            face = DimensionEstimator.planarFace(silhouette: front, plane: plane)
        } else {
            face = DimensionEstimator.planarFace(silhouette: front, millimetresPerPixel: scale.mmPerPx)
        }
        guard let face else { return nil }
        let side: PlanarFace?
        if let sideMask = request.side {
            if let plane = scale.plane, scale.source == .card {
                side = DimensionEstimator.planarFace(silhouette: sideMask, plane: plane)
            } else {
                side = DimensionEstimator.planarFace(silhouette: sideMask, millimetresPerPixel: scale.mmPerPx)
            }
        } else {
            side = nil
        }
        let shape = ShapeClassifier.classify(
            radiiMm: [face.widthMm / 2, face.widthMm / 2, face.widthMm / 2, face.widthMm / 2],
            rectangleFit: face.rectangleFit,
            kind: request.kind
        )
        return MeasuredPart(
            dimensions: DimensionEstimator.planarDimensions(kind: request.kind, front: face, side: side),
            profile: nil,
            lathe: nil,
            neckOuterDiameterMm: nil,
            shape: shape,
            parallaxResidualMm: 0
        )
    }

    private static func autoPixelHeight(request: MeasureRequest, auto: ScaleSolution?) -> Double? {
        guard let auto, auto.isUsable, let front = request.front else { return nil }
        let rows = front.rows()
        guard let first = rows.first, let last = rows.last else { return nil }
        return Double(last.y - first.y + 1) * auto.mmPerPx
    }

    private static func pixelExtent(of silhouette: Silhouette) -> PixelExtent? {
        let rows = silhouette.rows()
        guard let first = rows.first, let last = rows.last else { return nil }
        let width = rows.map { Double($0.right - $0.left + 1) }.max() ?? 0
        return PixelExtent(widthPx: width, heightPx: Double(last.y - first.y + 1))
    }

    private static func isRound(_ kind: PartKind) -> Bool {
        switch kind {
        case .bottle, .cap, .pump, .collar: return true
        case .box, .label: return false
        }
    }

    private static func isReferenceObject(_ source: ScaleSourceKind?) -> Bool {
        switch source {
        case .card, .coin, .ruler, .custom: return true
        default: return false
        }
    }

    private static func quantisation(scale: ScaleSolution?, intrinsics: CameraIntrinsics) -> Double {
        if let depth = scale?.depthMm, intrinsics.fx > 0 { return 0.5 * depth / intrinsics.fx }
        if let mm = scale?.mmPerPx, mm > 0 { return 0.5 * mm }
        return 0
    }

    private static func confidenceKeys(kind: PartKind, neck: Double?) -> [String] {
        var keys = ["widthMm", "heightMm", "depthMm"]
        if isRound(kind), neck != nil { keys.append("neckOuterDiameterMm") }
        return keys
    }

    private static func makeScan(request: MeasureRequest, scale: ScaleSolution?, band: ConfidenceBand) -> ScanInfo? {
        guard let scale else {
            return ScanInfo(
                method: "manual",
                capturedAt: request.capturedAt,
                device: request.device,
                appVersion: nil,
                material: nil,
                scale: nil,
                referenceObject: nil,
                confidence: MeasureConfidence.scanConfidence(.retake),
                neckSuggestion: nil,
                dimsVerifiedBySupplier: false,
                toleranceMm: ScaleLimits.toleranceMillimetres
            )
        }
        let method: String
        if scale.source == .autoObjectCapture {
            method = "object-capture"
        } else if scale.issue == nil, isRound(request.kind) {
            method = "photo-lathe"
        } else if scale.source == .card {
            method = "single-photo"
        } else {
            method = scale.scanMethod
        }
        return ScanInfo(
            method: method,
            capturedAt: request.capturedAt,
            device: request.device,
            appVersion: PackKit.version,
            material: nil,
            scale: scale.scanScale,
            referenceObject: scale.referenceObject,
            confidence: MeasureConfidence.scanConfidence(band),
            neckSuggestion: nil,
            dimsVerifiedBySupplier: false,
            toleranceMm: ScaleLimits.toleranceMillimetres
        )
    }

    private static func makeMeasurements(measured: MeasuredPart?, source: String) -> [Measurements] {
        guard let measured else { return [] }
        let dims = measured.dimensions
        var items = [
            measurement("widthMm", dims.widthMm, source),
            measurement("heightMm", dims.heightMm, source),
            measurement("depthMm", dims.depthMm, source),
        ]
        if abs(dims.widthMm - dims.depthMm) < 1e-6, dims.widthMm > 0 {
            items.append(measurement("diameterMm", dims.widthMm, source))
        }
        if let neck = measured.neckOuterDiameterMm {
            items.append(measurement("neckOuterDiameterMm", neck, source))
        }
        return items
    }

    private static func measurement(_ key: String, _ value: Double, _ source: String) -> Measurements {
        Measurements(key: key, value: value, source: source, toleranceMm: ScaleLimits.toleranceMillimetres)
    }

    private static func rank(_ band: ConfidenceBand) -> Int {
        switch band {
        case .retake: return 0
        case .check: return 1
        case .ok: return 2
        }
    }
}
