import Foundation

/// Guided multi-angle capture for one part. A pure value: encode it and the
/// in-progress part survives an app restart.
public struct CaptureSequence: Equatable, Codable, Sendable {
    public struct Step: Equatable, Codable, Sendable {
        public var angle: CaptureAngle
        public var required: Bool
        public var recommended: Bool
        public var photo: CapturedPhoto?
        public var skipped: Bool

        public init(
            angle: CaptureAngle,
            required: Bool,
            recommended: Bool,
            photo: CapturedPhoto? = nil,
            skipped: Bool = false
        ) {
            self.angle = angle
            self.required = required
            self.recommended = recommended
            self.photo = photo
            self.skipped = skipped
        }
    }

    public var partId: UUID
    public var kind: PartKind
    public var steps: [Step]
    public private(set) var index: Int

    public init(partId: UUID = UUID(), kind: PartKind) {
        self.partId = partId
        self.kind = kind
        self.steps = CapturePlan.forKind(kind).steps.map {
            Step(angle: $0.angle, required: $0.required, recommended: $0.recommended)
        }
        self.index = 0
    }

    public var current: Step? {
        guard steps.indices.contains(index) else { return nil }
        return steps[index]
    }

    /// For example `צד 1/2` while a step is current.
    public var stepLabel: String? {
        guard steps.indices.contains(index) else { return nil }
        return "\(steps[index].angle.hebrew) \(index + 1)/\(steps.count)"
    }

    public var isAtEnd: Bool { index >= steps.count }

    /// True once every required step has an accepted photo. Optional steps may still be open.
    public var isComplete: Bool {
        steps.allSatisfy { !$0.required || $0.photo != nil }
    }

    /// Accepts a photo for the current step when the angle matches, then moves on.
    @discardableResult
    public mutating func capture(_ photo: CapturedPhoto) -> Bool {
        guard steps.indices.contains(index), photo.angle == steps[index].angle else { return false }
        steps[index].photo = photo
        steps[index].skipped = false
        advance()
        return true
    }

    /// Skips the current step. Required steps cannot be skipped.
    @discardableResult
    public mutating func skip() -> Bool {
        guard steps.indices.contains(index) else { return false }
        guard !steps[index].required, steps[index].photo == nil else { return false }
        steps[index].skipped = true
        advance()
        return true
    }

    /// Clears one step and makes it current so it can be shot again.
    @discardableResult
    public mutating func retake(angle: CaptureAngle) -> Bool {
        guard let found = steps.firstIndex(where: { $0.angle == angle }) else { return false }
        return retake(index: found)
    }

    @discardableResult
    public mutating func retake(index: Int) -> Bool {
        guard steps.indices.contains(index) else { return false }
        steps[index].photo = nil
        steps[index].skipped = false
        self.index = index
        return true
    }

    public mutating func reset() {
        for cursor in steps.indices {
            steps[cursor].photo = nil
            steps[cursor].skipped = false
        }
        index = 0
    }

    private mutating func advance() {
        if let next = steps.indices.first(where: { $0 > index && steps[$0].photo == nil && !steps[$0].skipped }) {
            index = next
        } else {
            index = steps.count
        }
    }
}
