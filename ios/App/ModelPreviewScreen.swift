import SwiftUI
import SceneKit
import PackKit
import Store

struct ModelPreviewScreen: View {
    let draft: ScanDraft
    let measurement: DraftMeasurement
    let onRetake: () -> Void
    
    @State private var shareURLs: [URL] = []
    @State private var showingShare = false
    @State private var scene = SCNScene()
    
    var body: some View {
        VStack(spacing: 0) {
            SceneView(
                scene: scene,
                options: [.allowsCameraControl, .autoenablesDefaultLighting]
            )
            .background(Color(white: 0.15))
            
            VStack(spacing: 16) {
                Text(dimensionsText)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .environment(\.layoutDirection, .rightToLeft)
                
                HStack(spacing: 16) {
                    Button("סרוק שוב") {
                        onRetake()
                    }
                    .buttonStyle(.bordered)
                    
                    Button("טוב, ייצא") {
                        exportModel()
                    }
                    .buttonStyle(.borderedProminent)
                }
                .environment(\.layoutDirection, .rightToLeft)
            }
            .padding()
            .background(Color(white: 0.1))
        }
        .onAppear {
            setupScene()
        }
        .sheet(isPresented: $showingShare, onDismiss: { shareURLs = [] }) {
            if !shareURLs.isEmpty {
                ShareSheet(activityItems: shareURLs)
            }
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
        
        let meshes = MeshBuilder.build(part)
        let root = SCNNode()
        
        for meshPart in meshes {
            let geometry = buildGeometry(from: meshPart.mesh)
            let node = SCNNode(geometry: geometry)
            root.addChildNode(node)
        }
        
        // Frame the object
        let (minVec, maxVec) = root.boundingBox
        let dx = maxVec.x - minVec.x
        let dy = maxVec.y - minVec.y
        let dz = maxVec.z - minVec.z
        let maxDim = max(dx, max(dy, dz))
        let center = SCNVector3((minVec.x + maxVec.x)/2, (minVec.y + maxVec.y)/2, (minVec.z + maxVec.z)/2)
        
        root.position = SCNVector3(-center.x, -center.y, -center.z)
        
        let wrapper = SCNNode()
        wrapper.addChildNode(root)
        scene.rootNode.addChildNode(wrapper)
        
        let cameraNode = SCNNode()
        cameraNode.camera = SCNCamera()
        cameraNode.position = SCNVector3(0, 0, maxDim * 2.5)
        scene.rootNode.addChildNode(cameraNode)
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
        guard let data = measurement.packJSON(kind: draft.sequence.kind),
              let pack = try? JSONDecoder().decode(SupplierPack.self, from: data),
              let part = pack.parts.first else {
            return
        }
        
        do {
            let glbData = try PackKit.exportGLB(part)
            let tempDir = FileManager.default.temporaryDirectory
            let fileName = (part.name.isEmpty || part.name == "draft" ? "part" : part.name)
            
            // Write GLB
            let glbURL = tempDir.appendingPathComponent("\(fileName).glb")
            try glbData.write(to: glbURL)
            
            // Write USDZ
            let usdzURL = tempDir.appendingPathComponent("\(fileName).usdz")
            scene.write(to: usdzURL, delegate: nil)
            
            shareURLs = [glbURL, usdzURL]
            showingShare = true
        } catch {
            print("Export failed: \(error)")
        }
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    var activityItems: [Any]
    
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }
    
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
