import PackKit
import Store
import SwiftUI
import UIKit
import UIParts

/// Guided multi-angle capture: live distance, shutter, review, then a draft summary.
struct CaptureFlowView: View {
    @ObservedObject var library: DraftLibrary
    @StateObject private var model = CaptureModel()
    @State private var sequence: CaptureSequence
    @AppStorage("distance.targetCm") private var targetCm = 20.0
    @AppStorage("distance.halfBandCm") private var halfBandCm = 0.5
    @AppStorage("distance.autoCapture") private var autoCapture = false
    @AppStorage("distance.haptic") private var haptic = true
    @State private var showSettings = false
    @State private var saveFailed = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase

    init(library: DraftLibrary, sequence: CaptureSequence) {
        self.library = library
        _sequence = State(initialValue: sequence)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if model.cameraDenied {
                permissionDenied
            } else if let pending = model.pending {
                review(pending)
            } else if sequence.isAtEnd {
                summary
            } else {
                live
            }
        }
        .navigationTitle(sequence.kind.hebrewName)
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
                lidarSupported: model.lidarSupported,
                recordDistance: debugRecordBinding
            )
            .presentationDetents([.medium, .large])
        }
        .alert("שמירה נכשלה", isPresented: $saveFailed) {
            Button("סגור", role: .cancel) {}
        } message: {
            Text("לא ניתן לשמור את הטיוטה במכשיר.")
        }
        .onAppear(perform: appear)
        .onDisappear { model.stop() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.refreshCameraAccess() }
        }
        .onChange(of: targetCm) { _, value in model.setTarget(centimetres: value) }
        .onChange(of: halfBandCm) { _, value in model.setHalfBand(centimetres: value) }
        .onChange(of: autoCapture) { _, value in model.autoCaptureEnabled = value }
        .onChange(of: haptic) { _, value in model.setHapticEnabled(value) }
        .sensoryFeedback(.impact(weight: .light, intensity: 0.55), trigger: model.hapticTick)
        .sensoryFeedback(.impact(weight: .medium, intensity: 0.8), trigger: model.captureHaptic)
        #if DEBUG
        .sheet(item: $model.shareItem) { item in
            ActivityShareSheet(url: item.url)
        }
        #endif
    }

    private var live: some View {
        ZStack {
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
                showsApproximateBadge: model.source?.isApproximate == true,
                debug: model.showDebug ? debugStrip : nil,
                statusText: model.distanceUnavailable ? DistanceText.noDistance : nil,
                dimmed: model.dimmed
            )
            .ignoresSafeArea()
            if model.flash {
                Color.white.opacity(0.85).ignoresSafeArea()
                    .allowsHitTesting(false)
            }
            VStack(spacing: 14) {
                Spacer()
                instruction
                if model.cameraSupported && model.sessionFailed {
                    Button(action: model.retry) {
                        Text("נסו שוב")
                            .font(.body.bold())
                            .padding(.horizontal, 18)
                            .padding(.vertical, 10)
                            .background(.white, in: Capsule())
                            .foregroundStyle(.black)
                    }
                    .accessibilityLabel("נסו שוב")
                }
                #if DEBUG
                if !model.cameraSupported, let angle = sequence.current?.angle {
                    Button("צילום מדומה") {
                        model.fakeShutter(angle: angle)
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityLabel("צילום מדומה")
                }
                #endif
                shutter
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 28)
        }
        .simultaneousGesture(LongPressGesture(minimumDuration: 0.45).onEnded { _ in
            model.showDebug.toggle()
        })
    }

    private var instruction: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let label = sequence.stepLabel {
                Text(label)
                    .font(.headline)
            }
            if let step = sequence.current {
                Text(CaptureGuidance.text(kind: sequence.kind, angle: step.angle))
                    .font(.footnote)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 10) {
                    if step.recommended {
                        Text("מומלץ")
                            .font(.caption.bold())
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(.white.opacity(0.16), in: Capsule())
                    }
                    if !step.required {
                        Button("דלג") { skip() }
                            .buttonStyle(.bordered)
                            .accessibilityLabel("דלג")
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .foregroundStyle(.white)
    }

    private var shutter: some View {
        Button {
            guard let angle = sequence.current?.angle else { return }
            model.shutter(angle: angle)
        } label: {
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

    private var permissionDenied: some View {
        VStack(spacing: 16) {
            Image(systemName: "camera.fill")
                .font(.system(size: 42))
            Text("אין גישה למצלמה. אפשרו גישה בהגדרות כדי לצלם.")
                .font(.title3.bold())
                .multilineTextAlignment(.center)
            Button("פתח הגדרות") {
                guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                UIApplication.shared.open(url)
            }
            .buttonStyle(.borderedProminent)
            .accessibilityLabel("פתח הגדרות")
        }
        .foregroundStyle(.white)
        .padding(28)
    }

    private func review(_ pending: PendingCapture) -> some View {
        VStack(spacing: 16) {
            Image(uiImage: pending.image)
                .resizable()
                .scaledToFit()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            HStack(spacing: 16) {
                Button("שמור") { accept(pending) }
                    .buttonStyle(.borderedProminent)
                Button("צלם שוב") {
                    model.discardPending()
                    syncAngle()
                }
                .buttonStyle(.bordered)
            }
            .padding(.bottom, 20)
        }
        .padding(.horizontal, 16)
        .foregroundStyle(.white)
    }

    private var summary: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("הצילומים")
                    .font(.title3.bold())
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    ForEach(Array(sequence.steps.enumerated()), id: \.offset) { index, step in
                        summaryCell(index: index, step: step)
                    }
                }
                Button("סיום") { finish() }
                    .buttonStyle(.borderedProminent)
                    .disabled(!sequence.isComplete)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 8)
            }
            .padding(20)
        }
        .foregroundStyle(.white)
    }

    private func summaryCell(index: Int, step: CaptureSequence.Step) -> some View {
        VStack(spacing: 8) {
            if let photo = step.photo, let image = storedImage(photo) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(height: 140)
                    .clipped()
            } else {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Color.white.opacity(0.08))
                    .frame(height: 140)
                    .overlay {
                        Text(step.skipped ? "דולג" : "אין תמונה")
                            .font(.footnote)
                    }
            }
            Text(step.angle.hebrew)
                .font(.headline)
            Button(step.photo == nil ? "צלם" : "צלם שוב") {
                retake(index)
            }
            .buttonStyle(.bordered)
        }
        .padding(8)
        .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var debugStrip: DistanceDebugStrip {
        DistanceDebugStrip(
            source: model.source,
            rawMillimetres: model.rawMm,
            filteredMillimetres: model.filteredMm,
            sigmaMillimetres: model.sigmaMm,
            framesPerSecond: model.framesPerSecond,
            rejectedFrames: model.rejectedFrames,
            orientation: model.orientationLabel
        )
    }

    private var debugRecordBinding: Binding<Bool>? {
        #if DEBUG
        Binding(get: { model.recordDistance }, set: { model.setRecording($0) })
        #else
        nil
        #endif
    }

    private func appear() {
        model.setTarget(centimetres: targetCm)
        model.setHalfBand(centimetres: halfBandCm)
        model.autoCaptureEnabled = autoCapture
        model.setHapticEnabled(haptic)
        syncAngle()
        model.refreshCameraAccess()
        #if DEBUG
        model.startSimulationIfNeeded()
        #endif
    }

    private func syncAngle() {
        if model.pending == nil, let angle = sequence.current?.angle {
            model.setCaptureAngle(angle)
        } else {
            model.setCaptureAngle(nil)
        }
    }

    private func accept(_ pending: PendingCapture) {
        var updated = sequence
        guard updated.capture(pending.photo) else { return }
        do {
            try library.save(sequence: updated, images: [pending.photo.fileName: pending.jpeg])
            sequence = updated
            model.discardPending()
            syncAngle()
        } catch {
            saveFailed = true
        }
    }

    private func skip() {
        var updated = sequence
        guard updated.skip() else { return }
        guard commit(updated, images: [:]) else { return }
        syncAngle()
    }

    private func retake(_ index: Int) {
        var updated = sequence
        guard updated.retake(index: index) else { return }
        guard commit(updated, images: [:]) else { return }
        model.discardPending()
        syncAngle()
    }

    private func finish() {
        guard sequence.isComplete else { return }
        guard commit(sequence, images: [:]) else { return }
        dismiss()
    }

    @discardableResult
    private func commit(_ updated: CaptureSequence, images: [String: Data]) -> Bool {
        do {
            try library.save(sequence: updated, images: images)
            sequence = updated
            return true
        } catch {
            saveFailed = true
            return false
        }
    }

    private func storedImage(_ photo: CapturedPhoto) -> UIImage? {
        guard let data = try? library.store.imageData(partId: sequence.partId, fileName: photo.fileName) else { return nil }
        return UIImage(data: data)
    }
}

struct CaptureSettingsSheet: View {
    @Binding var targetCm: Double
    @Binding var halfBandCm: Double
    @Binding var autoCapture: Bool
    @Binding var haptic: Bool
    var source: DistanceSourceInfo?
    var lidarSupported: Bool
    var recordDistance: Binding<Bool>? = nil
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
                    #if DEBUG
                    if let recordDistance {
                        Toggle("הקלט מרחק", isOn: recordDistance)
                    }
                    #endif
                }
                Section("מקור המרחק") {
                    LabeledContent("פעיל") {
                        Text(source?.label ?? "—")
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
}

#if DEBUG
struct ActivityShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
#endif
