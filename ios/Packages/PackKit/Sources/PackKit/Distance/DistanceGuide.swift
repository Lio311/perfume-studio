import Foundation

/// Hysteresis guide around a target distance.
/// Green needs three consecutive frames inside 0.8h and stays until the error exceeds 1.2h.
/// Yellow is entered at |e| ≤ max(18 mm, 3.6h) and left only past max(22 mm, 4.4h),
/// so a wide half-band (for example 20 mm) cannot jump from green straight to red.
/// Direction changes only after the error has crossed zero by more than half the half-band
/// for three frames, and green never shows an arrow.
/// The displayed centimetre value is rounded to 0.1 cm, updates at most five times a second,
/// and stays put until it has moved by at least 0.2 cm.
public struct DistanceGuide: Equatable {
    public enum State: String, Equatable, Sendable, Codable {
        case green, yellow, red
    }

    public enum Direction: Equatable, Sendable {
        case closer
        case farther
        case none

        public var hebrew: String {
            switch self {
            case .closer: return DistanceText.closer
            case .farther: return DistanceText.farther
            case .none: return ""
            }
        }
    }

    public struct Output: Equatable, Sendable {
        public var state: State
        /// `closer` when the camera is too far (Z > target), `farther` when it is too close.
        public var direction: Direction
        /// Filtered distance in centimetres, rounded to one decimal.
        public var distanceCm: Double
        /// True only on the frame that enters green. Drives the light haptic.
        public var enteredGreen: Bool
        public var errorMm: Double
    }

    public var targetMm: Double
    public var halfBandMm: Double
    private var green = false
    private var greenStreak = 0
    private var yellow = false
    private var shownDirection: Direction = .none
    private var pendingDirection: Direction = .none
    private var pendingFrames = 0
    private var shownCm: Double?
    private var shownAt: TimeInterval?

    public init(targetMm: Double = 200, halfBandMm: Double = 5) {
        self.targetMm = targetMm
        self.halfBandMm = halfBandMm
    }

    public mutating func reset() {
        green = false
        greenStreak = 0
        yellow = false
        shownDirection = .none
        pendingDirection = .none
        pendingFrames = 0
        shownCm = nil
        shownAt = nil
    }

    public mutating func update(zMm: Double, time: TimeInterval = 0) -> Output {
        let error = zMm - targetMm
        let magnitude = abs(error)
        let enterGreen = magnitudeUm(halfBandMm * 0.8)
        let leaveGreen = magnitudeUm(halfBandMm * 1.2)
        let enterYellow = magnitudeUm(Self.yellowEnterMillimetres(halfBandMm: halfBandMm))
        let leaveYellow = magnitudeUm(Self.yellowLeaveMillimetres(halfBandMm: halfBandMm))
        let now = magnitudeUm(magnitude)

        if yellow {
            if now > leaveYellow { yellow = false }
        } else if now <= enterYellow {
            yellow = true
        }

        let wasGreen = green
        if green {
            if now > leaveGreen {
                green = false
                greenStreak = 0
            }
        } else if now <= enterGreen {
            greenStreak += 1
            if greenStreak >= 3 { green = true }
        } else {
            greenStreak = 0
        }

        let state: State = green ? .green : (yellow ? .yellow : .red)
        let direction = advanceDirection(error: error, green: green)
        return Output(
            state: state,
            direction: direction,
            distanceCm: advanceDisplay(zMm: zMm, time: time),
            enteredGreen: green && !wasGreen,
            errorMm: error
        )
    }

    /// Green shows no arrow. Otherwise a new direction has to clear `0.5·h` for three frames.
    private mutating func advanceDirection(error: Double, green: Bool) -> Direction {
        if green {
            shownDirection = .none
            pendingDirection = .none
            pendingFrames = 0
            return .none
        }
        let margin = halfBandMm * DistanceTiming.directionMargin
        let candidate: Direction?
        if error > margin {
            candidate = .closer
        } else if error < -margin {
            candidate = .farther
        } else {
            candidate = nil
        }
        guard let candidate else {
            pendingDirection = shownDirection
            pendingFrames = 0
            return shownDirection
        }
        if candidate == shownDirection {
            pendingDirection = candidate
            pendingFrames = 0
            return shownDirection
        }
        if candidate == pendingDirection {
            pendingFrames += 1
        } else {
            pendingDirection = candidate
            pendingFrames = 1
        }
        if pendingFrames >= DistanceTiming.directionFrames {
            shownDirection = candidate
            pendingFrames = 0
        }
        return shownDirection
    }

    private mutating func advanceDisplay(zMm: Double, time: TimeInterval) -> Double {
        let rounded = Self.centimeters(fromMillimetres: zMm)
        guard let shownCm else {
            self.shownCm = rounded
            shownAt = time
            return rounded
        }
        guard abs(rounded - shownCm) + 1e-9 >= DistanceTiming.displayDeadbandCm else { return shownCm }
        let due: Bool
        if let shownAt, time.isFinite {
            due = time - shownAt + 1e-12 >= DistanceTiming.displayInterval
        } else {
            due = true
        }
        guard due else { return shownCm }
        self.shownCm = rounded
        if time.isFinite { shownAt = time }
        return rounded
    }

    /// |e| at which yellow turns on. `h` is the half-band in millimetres.
    public static func yellowEnterMillimetres(halfBandMm: Double) -> Double {
        max(18, halfBandMm * 3.6)
    }

    /// |e| past which yellow turns off. `h` is the half-band in millimetres.
    public static func yellowLeaveMillimetres(halfBandMm: Double) -> Double {
        max(22, halfBandMm * 4.4)
    }

    public static func centimeters(fromMillimetres zMm: Double) -> Double {
        let centimetres = zMm / 10
        let sign = centimetres < 0 ? -1.0 : 1.0
        return sign * (abs(centimetres) * 10 + 0.5).rounded(.down) / 10
    }

    /// Compare thresholds in whole micrometres so 0.8 × 5 mm stays exactly 4 mm.
    private func magnitudeUm(_ millimetres: Double) -> Int {
        Int((millimetres * 1000).rounded())
    }
}
