import ARKit
import SceneKit
import SwiftUI
import CaptureKit

/// Camera background for the live AR session. The capture object keeps the frame delegate.
struct CameraPreview: UIViewRepresentable {
    let session: CardCaptureSession

    func makeUIView(context: Context) -> ARSCNView {
        let view = ARSCNView(frame: .zero)
        view.scene = SCNScene()
        session.attach(view)
        return view
    }

    func updateUIView(_ uiView: ARSCNView, context: Context) {
        session.attach(uiView)
    }
}
