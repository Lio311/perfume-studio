import Foundation

public struct HostFacts: Equatable, Sendable {
    public var systemName: String
    public var major: Int
    public var minor: Int
    public var patch: Int
    public var isAppleSilicon: Bool
    public var photogrammetrySupported: Bool

    public init(
        systemName: String,
        major: Int,
        minor: Int,
        patch: Int,
        isAppleSilicon: Bool,
        photogrammetrySupported: Bool
    ) {
        self.systemName = systemName
        self.major = major
        self.minor = minor
        self.patch = patch
        self.isAppleSilicon = isAppleSilicon
        self.photogrammetrySupported = photogrammetrySupported
    }

    public var detectedDescription: String {
        let arch = isAppleSilicon ? "arm64" : "x86_64"
        return "\(systemName) \(major).\(minor).\(patch), arch \(arch), PhotogrammetrySession.isSupported=\(photogrammetrySupported)"
    }
}

public enum GateReason: String, Equatable, Sendable {
    case notMacOS
    case operatingSystemTooOld
    case notAppleSilicon
    case photogrammetryUnsupported
}

public struct GateDecision: Equatable, Sendable {
    public var allowed: Bool
    public var reasons: [GateReason]
    public var message: String

    public init(allowed: Bool, reasons: [GateReason], message: String) {
        self.allowed = allowed
        self.reasons = reasons
        self.message = message
    }
}

public enum VersionGate {
    public static let minimumMajor = 13

    public static func evaluate(_ host: HostFacts) -> GateDecision {
        var reasons: [GateReason] = []
        if host.systemName != "macOS" {
            reasons.append(.notMacOS)
        } else {
            if !isAtLeastMinimum(host) {
                reasons.append(.operatingSystemTooOld)
            }
            if !host.isAppleSilicon {
                reasons.append(.notAppleSilicon)
            }
            if !host.photogrammetrySupported {
                reasons.append(.photogrammetryUnsupported)
            }
        }
        if reasons.isEmpty {
            return GateDecision(allowed: true, reasons: [], message: "")
        }
        return GateDecision(allowed: false, reasons: reasons, message: blockedMessage(host, reasons: reasons))
    }

    public static func isAtLeastMinimum(_ host: HostFacts) -> Bool {
        if host.major != minimumMajor {
            return host.major > minimumMajor
        }
        if host.minor != 0 {
            return host.minor > 0
        }
        return host.patch >= 0
    }

    public static func blockedMessage(_ host: HostFacts, reasons: [GateReason]) -> String {
        var lines = [
            "שגיאה: שחזור תלת-ממד דורש macOS 13 או חדש יותר, מעבד Apple silicon, ותמיכה ב-PhotogrammetrySession.",
            "Error: Photogrammetry requires macOS 13 or later, an Apple silicon CPU, and PhotogrammetrySession support.",
        ]
        for reason in reasons {
            switch reason {
            case .notMacOS:
                lines.append("המערכת שזוהתה אינה macOS.")
                lines.append("The detected system is not macOS.")
            case .operatingSystemTooOld:
                lines.append("גרסת macOS נמוכה מ-13.")
                lines.append("The macOS version is older than 13.")
            case .notAppleSilicon:
                lines.append("המעבד אינו Apple silicon.")
                lines.append("The CPU is not Apple silicon.")
            case .photogrammetryUnsupported:
                lines.append("PhotogrammetrySession.isSupported הוא false.")
                lines.append("PhotogrammetrySession.isSupported is false.")
            }
        }
        lines.append("Detected: \(host.detectedDescription)")
        return lines.joined(separator: "\n")
    }
}
