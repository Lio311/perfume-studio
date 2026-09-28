import SwiftUI
import PackKit
import UIParts

struct CaptureScreen: View {
    @StateObject private var model = CaptureModel()
    @AppStorage("distance.targetCm") private var targetCm = 20.0
    @AppStorage("distance.halfBandCm") private var halfBandCm = 0.5
    @AppStorage("distance.autoCapture") private var autoCapture = false
    @AppStorage("distance.haptic") private var haptic = true
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                if model.cameraSupported {
                    CameraPreview(session: model.capture)
                        .ignoresSafeArea()
                } else {
                    unavailable
                }
                DistanceOverlay(
                    state: model.guide?.state,
                    direction: model.guide?.direction ?? DistanceGuide.Direction.none,
                    distanceCm: model.guide?.distanceCm,
                    showsApproximateBadge: model.source == .vio,
                    debug: model.showDebug ? debugStrip : nil
                )
                .ignoresSafeArea()
                if model.flash {
                    Color.white.opacity(0.85).ignoresSafeArea()
                        .allowsHitTesting(false)
                }
                if model.cameraSupported && model.sessionFailed {
                    Text("המצלמה נעצרה. נסו שוב.")
                        .font(.footnote)
                        .foregroundStyle(.white)
                        .padding(10)
                        .background(.black.opacity(0.55), in: Capsule())
                }
                VStack {
                    Spacer()
                    shutter
                }
                .padding(.bottom, 28)
            }
            .simultaneousGesture(LongPressGesture(minimumDuration: 0.45).onEnded { _ in
                model.showDebug.toggle()
            })
            .navigationTitle("סורק רכיבים")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSettings = true } label: {
                        Image(systemName: "gearshape")
                    }
                    .accessibilityLabel("הגדרות")
                }
            }
            .sheet(isPresented: $showSettings) {
                CaptureSettingsSheet(
                    targetCm: $targetCm,
                    halfBandCm: $halfBandCm,
                    autoCapture: $autoCapture,
                    haptic: $haptic,
                    source: model.source,
                    lidarSupported: model.lidarSupported
                )
                .presentationDetents([.medium, .large])
            }
        }
        .onAppear(perform: applySettingsAndStart)
        .onChange(of: targetCm) { _, value in model.setTarget(centimetres: value) }
        .onChange(of: halfBandCm) { _, value in model.setHalfBand(centimetres: value) }
        .onChange(of: autoCapture) { _, value in model.autoCaptureEnabled = value }
        .onChange(of: haptic) { _, value in model.setHapticEnabled(value) }
        .sensoryFeedback(.impact(weight: .light, intensity: 0.55), trigger: model.hapticTick)
    }

    private var shutter: some View {
        Button(action: model.shutter) {
            Circle()
                .strokeBorder(.white, lineWidth: 4)
                .background(Circle().fill(.white.opacity(0.92)).padding(6))
                .frame(width: 74, height: 74)
        }
        .accessibilityLabel("צילום")
    }

    private var unavailable: some View {
        VStack(spacing: 18) {
            Image(systemName: "camera.fill")
                .font(.system(size: 42))
                .foregroundStyle(.white.opacity(0.85))
            Text(DistanceText.cameraDeviceOnly)
                .font(.title3.bold())
                .multilineTextAlignment(.center)
                .foregroundStyle(.white)
            #if DEBUG
            VStack(spacing: 8) {
                Text("סימולציה")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.8))
                Slider(value: $model.simulatedCentimetres, in: 10...40, step: 0.1)
                Text(String(format: "%.1f %@", model.simulatedCentimetres, DistanceText.centimeters))
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(.white)
                    .environment(\.layoutDirection, .leftToRight)
            }
            .padding(.horizontal, 28)
            #endif
        }
        .padding()
    }

    private var debugStrip: DistanceDebugStrip {
        DistanceDebugStrip(
            source: model.source,
            rawMillimetres: model.rawMm,
            filteredMillimetres: model.filteredMm,
            sigmaMillimetres: model.sigmaMm,
            framesPerSecond: model.framesPerSecond
        )
    }

    private func applySettingsAndStart() {
        model.setTarget(centimetres: targetCm)
        model.setHalfBand(centimetres: halfBandCm)
        model.autoCaptureEnabled = autoCapture
        model.setHapticEnabled(haptic)
        model.start()
        #if DEBUG
        model.startSimulationIfNeeded()
        #endif
    }
}

struct CaptureSettingsSheet: View {
    @Binding var targetCm: Double
    @Binding var halfBandCm: Double
    @Binding var autoCapture: Bool
    @Binding var haptic: Bool
    var source: DistanceSource?
    var lidarSupported: Bool
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("מרחק") {
                    LabeledContent("מרחק יעד") {
                        Text(String(format: "%.1f %@", targetCm, DistanceText.centimeters))
                            .monospacedDigit()
                    }
                    Slider(value: $targetCm, in: 10...40, step: 0.1)
                    LabeledContent("חצי פס") {
                        Text(String(format: "%.1f %@", halfBandCm, DistanceText.centimeters))
                            .monospacedDigit()
                    }
                    Slider(value: $halfBandCm, in: 0.1...2, step: 0.1)
                    Toggle("צילום אוטומטי", isOn: $autoCapture)
                    Toggle("רטט בכניסה לירוק", isOn: $haptic)
                }
                Section("מקור המרחק") {
                    LabeledContent("פעיל") {
                        Text(sourceLabel)
                    }
                    Text(lidarSupported ? DistanceText.lidarAvailable : DistanceText.lidarUnavailable)
                }
            }
            .navigationTitle("הגדרות")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("סגור") { dismiss() }
                }
            }
        }
    }

    private var sourceLabel: String {
        switch source {
        case .card: return "כרטיס"
        case .lidar: return "LiDAR"
        case .vio: return "VIO"
        case nil: return "—"
        }
    }
}
