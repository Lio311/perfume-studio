import Foundation

/// Hysteresis guide around a target distance.
/// Green needs three consecutive frames inside 0.8h and stays until the error exceeds 1.2h.
/// Yellow is entered at 18 mm of error and left only past 22 mm. Anything else is red.
public struct DistanceGuide: Equatable {
    public enum State: String, Equatable, Sendable {
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

    public init(targetMm: Double = 200, halfBandMm: Double = 5) {
        self.targetMm = targetMm
        self.halfBandMm = halfBandMm
    }

    public mutating func reset() {
        green = false
        greenStreak = 0
        yellow = false
    }

    public mutating func update(zMm: Double) -> Output {
        let error = zMm - targetMm
        let magnitude = abs(error)
        let enterGreen = magnitudeUm(halfBandMm * 0.8)
        let leaveGreen = magnitudeUm(halfBandMm * 1.2)
        let now = magnitudeUm(magnitude)

        if yellow {
            if now > magnitudeUm(22) { yellow = false }
        } else if now <= magnitudeUm(18) {
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
        let direction: Direction
        if error > 0 {
            direction = .closer
        } else if error < 0 {
            direction = .farther
        } else {
            direction = .none
        }
        return Output(
            state: state,
            direction: direction,
            distanceCm: Self.centimeters(fromMillimetres: zMm),
            enteredGreen: green && !wasGreen,
            errorMm: error
        )
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
