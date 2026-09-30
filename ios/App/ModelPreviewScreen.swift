import SwiftUI
import SceneKit
import PackKit
import Store

struct ModelPreviewScreen: View {
    let draft: ScanDraft
    let measurement: DraftMeasurement
    let onRetake: () -> Void

    @State private var scene: SCNScene?
    @State private var cameraNode: SCNNode?
    @State private var framedDistance: Float?
    @State private var shareURLs: [URL] = []
    @State private var showingShare = false
    @State private var exportDirectory: URL?
    @State private var exportError: String?
    @State private var exportWarning: String?
    @State private var exporting = false

    var body: some View {
        VStack(spacing: 0) {
            Group {
                if let scene, let cameraNode {
                    SceneView(
                        scene: scene,
                        pointOfView: cameraNode,
                        options: [.allowsCameraControl, .autoenablesDefaultLighting]
                    )
                } else {
                    Color(white: 0.15)
                }
            }
            .background(Color(white: 0.15))

            VStack(spacing: 16) {
                Text(dimensionsText)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .environment(\.layoutDirection, .rightToLeft)

                if exporting {
                    ProgressView("מייצא…")
                        .tint(.white)
                }
                if let exportWarning, !showingShare {
                    Text(exportWarning)
                        .font(.footnote)
                        .foregroundStyle(.yellow)
                        .multilineTextAlignment(.center)
                }

                HStack(spacing: 16) {
                    Button("סרוק שוב") {
                        resetCamera()
                        onRetake()
                    }
                    .buttonStyle(.bordered)

                    Button("טוב, ייצא") {
                        exportModel()
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(exporting || scene == nil)
                }
                .environment(\.layoutDirection, .rightToLeft)
            }
            .padding()
            .background(Color(white: 0.1))
        }
        .onAppear {
            if scene == nil {
                setupScene()
            } else {
                resetCamera()
            }
        }
        .onDisappear {
            if !showingShare { cleanupExports() }
        }
        .sheet(isPresented: $showingShare, onDismiss: cleanupExports) {
            if !shareURLs.isEmpty {
                ShareSheet(activityItems: shareURLs)
            }
        }
        .alert("ייצוא נכשל", isPresented: Binding(
            get: { exportError != nil && shareURLs.isEmpty && !exporting },
            set: { if !$0 { exportError = nil } }
        )) {
            Button("סגור", role: .cancel) { exportError = nil }
        } message: {
            Text(exportError ?? "לא ניתן לייצא את הקובץ. נסו שוב.")
        }
    }

    private var dimensionsText: String {
        "רוחב \(MeasureFormat.millimetres(measurement.widthMm)) מ״מ · גובה \(MeasureFormat.millimetres(measurement.heightMm)) מ״מ · עומק \(MeasureFormat.millimetres(measurement.depthMm)) מ״מ"
    }

    private func setupScene() {
        guard let data = measurement.packJSON(kind: draft.sequence.kind),
              let pack = try? JSONDecoder().decode(SupplierPack.self, from: data),
              let part = pack.parts.first else {
            return
        }

        let built = SCNScene()
        let root = SCNNode()
        for meshPart in MeshBuilder.build(part) {
            let node = SCNNode(geometry: buildGeometry(from: meshPart.mesh))
            root.addChildNode(node)
        }

        let (minVec, maxVec) = root.boundingBox
        let dx = Double(maxVec.x - minVec.x)
        let dy = Double(maxVec.y - minVec.y)
        let dz = Double(maxVec.z - minVec.z)
        let radius = 0.5 * (dx * dx + dy * dy + dz * dz).squareRoot()
        let frame = PreviewFraming.frame(radiusMetres: radius)
        let center = SCNVector3((minVec.x + maxVec.x) / 2, (minVec.y + maxVec.y) / 2, (minVec.z + maxVec.z) / 2)
        root.position = SCNVector3(-center.x, -center.y, -center.z)

        let wrapper = SCNNode()
        wrapper.addChildNode(root)
        built.rootNode.addChildNode(wrapper)

        let camera = SCNNode()
        camera.camera = SCNCamera()
        camera.camera?.fieldOfView = 60
        camera.camera?.zNear = CGFloat(frame.near)
        camera.camera?.zFar = CGFloat(frame.far)
        let distance = Float(frame.distance)
        camera.position = SCNVector3(0, 0, distance)
        built.rootNode.addChildNode(camera)

        cameraNode = camera
        framedDistance = distance
        scene = built
    }

    private func resetCamera() {
        guard let cameraNode, let framedDistance else { return }
        cameraNode.eulerAngles = SCNVector3Zero
        cameraNode.position = SCNVector3(0, 0, framedDistance)
    }

    private func buildGeometry(from mesh: Mesh) -> SCNGeometry {
        let positions = mesh.positions.map { SCNVector3($0.x, $0.y, $0.z) }
        let normals = mesh.normals.map { SCNVector3($0.x, $0.y, $0.z) }
        let uvs = mesh.uvs.map { CGPoint(x: CGFloat($0.x), y: CGFloat($0.y)) }
        let indices = mesh.indices.map { Int32($0) }

        let posSource = SCNGeometrySource(vertices: positions)
        let normSource = SCNGeometrySource(normals: normals)
        let uvSource = SCNGeometrySource(textureCoordinates: uvs)
        let element = SCNGeometryElement(indices: indices, primitiveType: .triangles)
        let geometry = SCNGeometry(sources: [posSource, normSource, uvSource], elements: [element])

        let material = SCNMaterial()
        material.lightingModel = .physicallyBased
        material.diffuse.contents = UIColor(
            red: CGFloat(mesh.material.baseColor.x),
            green: CGFloat(mesh.material.baseColor.y),
            blue: CGFloat(mesh.material.baseColor.z),
            alpha: CGFloat(mesh.material.baseColor.w)
        )
        material.metalness.contents = CGFloat(mesh.material.metallic)
        material.roughness.contents = CGFloat(mesh.material.roughness)
        if mesh.material.alphaMode == .blend {
            material.isDoubleSided = true
            material.blendMode = .alpha
            material.transparencyMode = .dualLayer
        }
        geometry.materials = [material]
        return geometry
    }

    private func exportModel() {
        guard !exporting,
              let data = measurement.packJSON(kind: draft.sequence.kind),
              let pack = try? JSONDecoder().decode(SupplierPack.self, from: data),
              let part = pack.parts.first,
              let scene else {
            exportError = "לא ניתן לייצא את הקובץ. נסו שוב."
            return
        }
        exporting = true
        exportError = nil
        exportWarning = nil
        cleanupExports()
        let fileBase = Self.fileBase(part: part, kind: draft.sequence.kind)
        DispatchQueue.global(qos: .userInitiated).async {
            let result = Self.writeExports(scene: scene, part: part, fileBase: fileBase)
            DispatchQueue.main.async {
                exporting = false
                switch result {
                case let .success(payload):
                    exportDirectory = payload.directory
                    shareURLs = payload.urls
                    showingShare = true
                    exportWarning = payload.warning
                case .failure:
                    exportError = "לא ניתן לייצא את הקובץ. נסו שוב."
                }
            }
        }
    }

    private func cleanupExports() {
        if let exportDirectory {
            try? FileManager.default.removeItem(at: exportDirectory)
            self.exportDirectory = nil
        }
        shareURLs = []
    }

    /// GLB comes from PackKit `exportGLB` (positions already in metres). The file is named after the part.
    private static func fileBase(part: SupplierPart, kind: PartKind) -> String {
        let candidate = (part.name.isEmpty || part.name == "draft") ? kind.hebrewName : part.name
        let forbidden = CharacterSet(charactersIn: "/\\:?%*|\"<>")
        let cleaned = String(candidate.unicodeScalars.map { forbidden.contains($0) ? "-" : Character($0) })
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? kind.rawValue : cleaned
    }

    private struct ExportPayload {
        var directory: URL
        var urls: [URL]
        var warning: String?
    }

    private static func writeExports(scene: SCNScene, part: SupplierPart, fileBase: String) -> Result<ExportPayload, Error> {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("preview-export-\(UUID().uuidString)", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            var urls: [URL] = []
            var warning: String?
            let glbURL = directory.appendingPathComponent("\(fileBase).glb")
            do {
                let glb = try PackKit.exportGLB(part)
                try glb.write(to: glbURL, options: .atomic)
                if let file = nonempty(glbURL) {
                    urls.append(file)
                } else {
                    warning = "לא ניתן לייצא את הקובץ. נסו שוב."
                }
            } catch {
                warning = "לא ניתן לייצא את הקובץ. נסו שוב."
            }

            let usdzURL = directory.appendingPathComponent("\(fileBase).usdz")
            let wrote = scene.write(to: usdzURL, options: nil, delegate: nil, progressHandler: nil)
            if wrote, let file = nonempty(usdzURL) {
                urls.append(file)
            } else {
                try? FileManager.default.removeItem(at: usdzURL)
                warning = "לא ניתן לייצא את הקובץ. נסו שוב."
            }
            guard !urls.isEmpty else {
                try? FileManager.default.removeItem(at: directory)
                return .failure(ExportFailure())
            }
            if urls.count == 2 { warning = nil }
            return .success(ExportPayload(directory: directory, urls: urls, warning: warning))
        } catch {
            try? FileManager.default.removeItem(at: directory)
            return .failure(error)
        }
    }

    private static func nonempty(_ url: URL) -> URL? {
        guard FileManager.default.fileExists(atPath: url.path),
              let size = try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber,
              size.int64Value > 0 else { return nil }
        return url
    }

    private struct ExportFailure: Error {}
}

struct ShareSheet: UIViewControllerRepresentable {
    var activityItems: [Any]

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
        anchor(controller, context: context)
        return controller
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {
        anchor(controller, context: context)
    }

    private func anchor(_ controller: UIActivityViewController, context: Context) {
        guard let popover = controller.popoverPresentationController else { return }
        let host = controller.view.window
            ?? UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first { $0.isKeyWindow }
            ?? context.coordinator.source
        popover.sourceView = host
        popover.sourceRect = CGRect(x: host.bounds.midX, y: host.bounds.midY, width: 1, height: 1)
        popover.permittedArrowDirections = []
    }

    final class Coordinator {
        let source = UIView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
    }
}
