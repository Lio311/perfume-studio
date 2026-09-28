import SwiftUI
import PackKit

/// Debug numbers shown after a long press: source, raw Z, filtered Z, σ over 1 s, and fps.
public struct DistanceDebugStrip: Equatable, Sendable {
    public var source: DistanceSource?
    public var rawMillimetres: Double?
    public var filteredMillimetres: Double?
    public var sigmaMillimetres: Double
    public var framesPerSecond: Double

    public init(
        source: DistanceSource?,
        rawMillimetres: Double?,
        filteredMillimetres: Double?,
        sigmaMillimetres: Double,
        framesPerSecond: Double
    ) {
        self.source = source
        self.rawMillimetres = rawMillimetres
        self.filteredMillimetres = filteredMillimetres
        self.sigmaMillimetres = sigmaMillimetres
        self.framesPerSecond = framesPerSecond
    }

    public var sourceLabel: String {
        switch source {
        case .card: return "כרטיס"
        case .lidar: return "LiDAR"
        case .vio: return "VIO"
        case nil: return "—"
        }
    }
}

/// Colour ring, direction, and distance. The approximate-accuracy badge is only for VIO.
public struct DistanceOverlay: View {
    public var state: DistanceGuide.State?
    public var direction: DistanceGuide.Direction
    public var distanceCm: Double?
    public var showsApproximateBadge: Bool
    public var debug: DistanceDebugStrip?

    public init(
        state: DistanceGuide.State?,
        direction: DistanceGuide.Direction,
        distanceCm: Double?,
        showsApproximateBadge: Bool,
        debug: DistanceDebugStrip? = nil
    ) {
        self.state = state
        self.direction = direction
        self.distanceCm = distanceCm
        self.showsApproximateBadge = showsApproximateBadge
        self.debug = debug
    }

    public var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(ringColor, lineWidth: 10)
                .padding(12)
            VStack(spacing: 10) {
                if let debug {
                    debugPanel(debug)
                    Spacer()
                }
                readout
                if debug != nil { Spacer() }
            }
            .padding(.top, 28)
            .padding(.horizontal, 24)
        }
        .allowsHitTesting(false)
    }

    private var readout: some View {
        VStack(spacing: 8) {
            if direction != .none {
                Image(systemName: direction == .closer ? "arrow.down" : "arrow.up")
                    .font(.system(size: 34, weight: .bold))
                Text(direction.hebrew)
                    .font(.title2.bold())
            }
            if let distanceCm {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(String(format: "%.1f", distanceCm))
                        .font(.system(size: 44, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .environment(\.layoutDirection, .leftToRight)
                    Text(DistanceText.centimeters)
                        .font(.title2)
                }
            }
            if showsApproximateBadge {
                Text(DistanceText.approximateAccuracy)
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(.black.opacity(0.55), in: Capsule())
            }
        }
        .foregroundStyle(.white)
        .shadow(color: .black.opacity(0.65), radius: 6, y: 1)
    }

    private func debugPanel(_ debug: DistanceDebugStrip) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("מקור: \(debug.sourceLabel)")
            Text(millimetres("גולמי", debug.rawMillimetres))
            Text(millimetres("מסונן", debug.filteredMillimetres))
            Text(String(format: "σ: %.2f מ״מ", debug.sigmaMillimetres))
            Text(String(format: "fps: %.0f", debug.framesPerSecond))
        }
        .font(.caption.monospacedDigit())
        .foregroundStyle(.white)
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func millimetres(_ label: String, _ value: Double?) -> String {
        guard let value else { return "\(label): —" }
        return "\(label): \(String(format: "%.1f", value)) מ״מ"
    }

    private var ringColor: Color {
        switch state {
        case .green: return Color(red: 0.18, green: 0.78, blue: 0.35)
        case .yellow: return Color(red: 0.98, green: 0.78, blue: 0.16)
        case .red: return Color(red: 0.92, green: 0.27, blue: 0.23)
        case nil: return Color.white.opacity(0.4)
        }
    }
}
