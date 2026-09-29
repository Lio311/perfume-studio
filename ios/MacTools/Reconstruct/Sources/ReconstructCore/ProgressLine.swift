import Foundation

public enum ETAEstimate {
    /// Linear estimate from elapsed time and fraction complete. Nil near 0 and at 1.
    public static func remainingSeconds(elapsed: Double, fraction: Double) -> Double? {
        guard elapsed.isFinite, elapsed > 0, fraction.isFinite, fraction > 0.01, fraction < 1 else { return nil }
        let remaining = elapsed * (1 - fraction) / fraction
        guard remaining.isFinite, remaining >= 0 else { return nil }
        return remaining
    }
}

public enum ProgressLine {
    public static func render(fraction: Double, stage: String, etaSeconds: Double?) -> String {
        let clamped = min(1, max(0, fraction.isFinite ? fraction : 0))
        let percent = Int((clamped * 100).rounded())
        let width = 20
        let filled = min(width, max(0, Int((clamped * Double(width)).rounded())))
        let bar = String(repeating: "#", count: filled) + String(repeating: "-", count: width - filled)
        return "[\(bar)] \(percent)% \(stage) ETA \(formatETA(etaSeconds))"
    }

    public static func formatETA(_ seconds: Double?) -> String {
        guard let seconds, seconds.isFinite, seconds >= 0 else { return "--:--" }
        let total = Int(seconds.rounded())
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        }
        return String(format: "%02d:%02d", minutes, secs)
    }
}
