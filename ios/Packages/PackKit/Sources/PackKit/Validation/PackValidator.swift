import CoreFoundation
import Foundation

public struct Issue: Equatable {
    public enum Severity: String, Equatable {
        case error, warning
    }

    public var code: String
    public var path: String
    public var severity: Severity
    public var messageHe: String
    public var messageEn: String
}

/// Inclusive millimetre bounds for one part kind, read from `$defs.DimensionRanges`.
public struct DimensionLimits: Equatable {
    public struct Axis: Equatable {
        public var minimum: Double
        public var maximum: Double
    }

    public var widthMm: Axis
    public var heightMm: Axis
    public var depthMm: Axis
}

public enum PackValidator {
    /// Shekel spellings and `$` become canonical ISO codes. Other text is trimmed and uppercased,
    /// then accepted only when it is an active ISO 4217 code.
    public static func normalizeCurrency(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return nil }
        if trimmed == "$" { return "USD" }
        if trimmed == "\u{20AA}" || trimmed == "\u{05E9}\u{05F4}\u{05D7}" || trimmed == "\u{05E9}\"\u{05D7}" || trimmed == "\u{05E9}\u{05D7}" {
            return "ILS"
        }
        let upper = trimmed.uppercased()
        if upper == "NIS" || upper == "ILS" { return "ILS" }
        return ISO4217.codes.contains(upper) ? upper : nil
    }

    /// A calendar date `YYYY-MM-DD`. A valid date-time is truncated to the date. Invalid input returns nil.
    public static func dateOnlyQuotedAt(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let match = quotedAtPattern.firstMatch(in: trimmed, range: NSRange(trimmed.startIndex..., in: trimmed)),
              match.range.location != NSNotFound else { return nil }
        let day = String(trimmed.prefix(10))
        let numbers = day.split(separator: "-").compactMap { Int($0) }
        guard numbers.count == 3, isRealUTCDate(year: numbers[0], month: numbers[1], day: numbers[2]) else { return nil }
        if trimmed.count == 10 { return day }
        guard validTime(String(trimmed.dropFirst(11))) else { return nil }
        return day
    }

    public static func limits(for kind: PartKind) -> DimensionLimits? {
        DimensionCatalog.limits(for: kind)
    }

    public static func priceIssues(_ price: [String: Any]) -> [Issue] {
        var issues: [Issue] = []
        if positiveNumber(price["value"]) == nil {
            issues.append(make("value", "price_value", .error,
                               "ערך המחיר חייב להיות מספר גדול מ־0.",
                               "The price value must be a number greater than 0."))
        }
        if let raw = price["currency"] as? String {
            if normalizeCurrency(raw) == nil {
                issues.append(make("currency", "price_currency", .error,
                                   "מטבע לא ידוע. המחיר חייב להשתמש בקוד ISO 4217 פעיל.",
                                   "Unknown currency. The price must use an active ISO 4217 code."))
            }
        } else {
            issues.append(make("currency", "price_currency", .error,
                               "חסר מטבע. המחיר חייב לכלול קוד ISO 4217 פעיל.",
                               "Currency is required and must be an active ISO 4217 code."))
        }
        for key in price.keys.sorted() where !priceKeys.contains(key) {
            issues.append(make(key, "price_unknown_field", .error,
                               "השדה \(key) אינו חלק מהמחיר.",
                               "Field \(key) is not part of the price."))
        }
        var moq: Int?
        if let raw = price["moq"], !(raw is NSNull) {
            if let parsed = wholeNumber(raw), parsed >= 1 {
                moq = parsed
            } else {
                issues.append(make("moq", "price_moq", .error,
                                   "כמות הזמנה מינימלית חייבת להיות מספר שלם מ־1 ומעלה.",
                                   "MOQ must be an integer of 1 or more."))
            }
        }
        if let rawTiers = price["tiers"], !(rawTiers is NSNull) {
            if let tiers = rawTiers as? [Any] {
                issues.append(contentsOf: tierIssues(tiers, moq: moq, base: positiveNumber(price["value"])))
            } else {
                issues.append(make("tiers", "price_tiers", .error,
                                   "מדרגות המחיר חייבות להיות מערך.",
                                   "Price tiers must be an array."))
            }
        }
        if let raw = price["quotedAt"], !(raw is NSNull) {
            if let text = raw as? String, dateOnlyQuotedAt(text) != nil {
                // A time component is truncated to the date and is not an error.
            } else {
                issues.append(make("quotedAt", "price_quoted_at", .error,
                                   "תאריך הצעת המחיר חייב להיות תאריך ISO (YYYY-MM-DD).",
                                   "Quote date must be an ISO date (YYYY-MM-DD)."))
            }
        }
        return issues
    }

    public static func issues(inPackJSON data: Data) -> [Issue] {
        issues(inPackJSON: data, catalog: DimensionCatalog.snapshot)
    }

    /// `catalog` is the bundled schema in production. Tests pass a failed snapshot to prove
    /// a missing schema is an error rather than a skipped range check.
    static func issues(inPackJSON data: Data, catalog: DimensionCatalogSnapshot) -> [Issue] {
        guard let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            return [make("", "pack_invalid", .error, "הקובץ אינו חבילת ספק.", "The file is not a supplier pack.")]
        }
        guard let parts = root["parts"] as? [Any] else {
            return [make("parts", "parts_invalid", .error, "רשימת החלקים חסרה.", "The parts list is missing.")]
        }
        var issues: [Issue] = []
        if catalog.failed {
            issues.append(make("$defs.DimensionRanges", "dimension_ranges_unavailable", .error,
                               "לא ניתן לטעון את טווחי המידות מהסכימה, ולכן אי אפשר לאמת מידות.",
                               "Dimension ranges could not be loaded from the schema, so range checks cannot run."))
        }
        for (index, raw) in parts.enumerated() {
            guard let part = raw as? [String: Any] else {
                issues.append(make("parts[\(index)]", "part_invalid", .error, "החלק אינו אובייקט.", "The part is not an object."))
                continue
            }
            let base = "parts[\(index)]"
            let kind = (part["kind"] as? String).flatMap(PartKind.init(rawValue:))
            if kind == nil {
                let shown = part["kind"] as? String ?? ""
                issues.append(make("\(base).kind", "kind_invalid", .error,
                                   "הסוג \(shown) אינו נתמך.",
                                   "Kind \(shown) is not supported."))
            }
            if let neck = part["neck"], !(neck is NSNull) {
                if (neck as? String).flatMap(Neck.init(rawValue:)) == nil {
                    let shown = neck as? String ?? ""
                    issues.append(make("\(base).neck", "neck_invalid", .error,
                                       "הצוואר \(shown) אינו נתמך.",
                                       "Neck \(shown) is not supported."))
                }
            }
            let limits = kind.flatMap { catalog.byKind[$0.rawValue] }
            if let kind, !catalog.failed, limits == nil {
                issues.append(make(base, "dimension_ranges_unavailable", .error,
                                   "אין טווח מידות עבור \(kind.rawValue) בסכימה, ולכן אי אפשר לאמת את המידות.",
                                   "The schema has no dimension range for \(kind.rawValue), so the dimensions cannot be checked."))
            }
            for axis in ["widthMm", "heightMm", "depthMm"] {
                guard let value = finiteNumber(part[axis]), value >= 0 else {
                    issues.append(make("\(base).\(axis)", "dimension_invalid", .error,
                                       "המידה חייבת להיות מספר אי-שלילי.",
                                       "The dimension must be a non-negative number."))
                    continue
                }
                guard let range = limits?.axis(axis) else { continue }
                if value < range.minimum || value > range.maximum {
                    issues.append(make("\(base).\(axis)", "dimension_range", .error,
                                       "המידה חייבת להיות בין \(range.minimum) ל־\(range.maximum) מ״מ.",
                                       "The dimension must be between \(range.minimum) and \(range.maximum) mm."))
                }
            }
            if let color = part["color"] as? String, hex.firstMatch(in: color, range: NSRange(color.startIndex..., in: color)) == nil {
                issues.append(make("\(base).color", "color_invalid", .error,
                                   "הצבע חייב להיות בפורמט #rrggbb.",
                                   "Color must be a #rrggbb hex."))
            }
            if let price = part["price"] as? [String: Any] {
                issues.append(contentsOf: priceIssues(price).map { item in
                    var copy = item
                    copy.path = item.path.isEmpty ? "\(base).price" : "\(base).price.\(item.path)"
                    return copy
                })
            }
        }
        return issues
    }

    private static let priceKeys: Set<String> = ["value", "currency", "moq", "tiers", "quotedAt"]
    private static let hex = try! NSRegularExpression(pattern: "^#[0-9a-fA-F]{6}$")
    private static let quotedAtPattern = try! NSRegularExpression(
        pattern: #"^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$"#
    )

    private static func tierIssues(_ tiers: [Any], moq: Int?, base: Double?) -> [Issue] {
        var issues: [Issue] = []
        var previousQty: Int?
        var previousValue = base
        for (index, raw) in tiers.enumerated() {
            let path = "tiers[\(index)]"
            guard let tier = raw as? [String: Any] else {
                issues.append(make(path, "tier_invalid", .error, "המדרגה אינה תקינה.", "The tier is invalid."))
                continue
            }
            let minQty = wholeNumber(tier["minQty"])
            guard let minQty else {
                issues.append(make("\(path).minQty", "tier_min_qty", .error,
                                   "כמות המדרגה חייבת להיות מספר שלם.",
                                   "Tier quantity must be an integer."))
                continue
            }
            let floor = moq ?? 1
            if minQty <= floor {
                if moq != nil {
                    issues.append(make("\(path).minQty", "tier_not_above_moq", .error,
                                       "כמות המדרגה חייבת להיות גדולה מכמות ההזמנה המינימלית.",
                                       "Tier quantity must be greater than the MOQ."))
                } else {
                    issues.append(make("\(path).minQty", "tier_below_min", .error,
                                       "כמות המדרגה חייבת להיות גדולה מ־1 כשאין כמות הזמנה מינימלית.",
                                       "Tier quantity must be greater than 1 when MOQ is not set."))
                }
                continue
            }
            if let previousQty, minQty <= previousQty {
                issues.append(make("\(path).minQty", "tier_not_ascending", .error,
                                   "כמות המדרגה חייבת לעלות.",
                                   "Tier quantity must ascend strictly."))
                continue
            }
            guard let value = positiveNumber(tier["value"]) else {
                issues.append(make("\(path).value", "tier_value", .error,
                                   "ערך המדרגה חייב להיות מספר גדול מ־0.",
                                   "Tier value must be a number greater than 0."))
                continue
            }
            if let previousValue, value > previousValue {
                issues.append(make("\(path).value", "tier_value_rose", .warning,
                                   "המחיר גבוה מהמחיר הקודם.",
                                   "The value is higher than the previous price."))
            }
            previousQty = minQty
            previousValue = value
        }
        return issues
    }

    private static func make(_ path: String, _ code: String, _ severity: Issue.Severity, _ he: String, _ en: String) -> Issue {
        Issue(code: code, path: path, severity: severity, messageHe: he, messageEn: en)
    }

    private static func finiteNumber(_ raw: Any?) -> Double? {
        guard let number = raw as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let value = number.doubleValue
        return value.isFinite ? value : nil
    }

    private static func wholeNumber(_ raw: Any?) -> Int? {
        guard let value = finiteNumber(raw), value.rounded() == value, value <= Double(Int.max), value >= Double(Int.min) else { return nil }
        return Int(value)
    }

    private static func positiveNumber(_ raw: Any?) -> Double? {
        guard let value = finiteNumber(raw), value > 0 else { return nil }
        return value
    }

    /// A real Gregorian calendar day. `2026-02-30` and `2026-13-45` are rejected.
    private static func isRealUTCDate(year: Int, month: Int, day: Int) -> Bool {
        guard year >= 1, (1...12).contains(month), day >= 1 else { return false }
        let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
        let lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        return day <= lengths[month - 1]
    }

    private static func validTime(_ body: String) -> Bool {
        guard body.count >= 5 else { return false }
        let hour = Int(body.prefix(2)) ?? 99
        let minuteStart = body.index(body.startIndex, offsetBy: 3)
        let minute = Int(body[minuteStart..<body.index(minuteStart, offsetBy: 2)]) ?? 99
        var second = 0
        if body.count > 5, body[body.index(body.startIndex, offsetBy: 5)] == ":" {
            let secondStart = body.index(body.startIndex, offsetBy: 6)
            guard body.distance(from: secondStart, to: body.endIndex) >= 2 else { return false }
            second = Int(body[secondStart..<body.index(secondStart, offsetBy: 2)]) ?? 99
        }
        return hour <= 23 && minute <= 59 && second <= 59
    }
}

struct DimensionCatalogSnapshot: Equatable {
    var byKind: [String: DimensionLimits]
    var failed: Bool
}

enum DimensionCatalog {
    static let snapshot: DimensionCatalogSnapshot = loadBundled()

    static func limits(for kind: PartKind) -> DimensionLimits? {
        snapshot.byKind[kind.rawValue]
    }

    static func parse(_ data: Data) -> DimensionCatalogSnapshot {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let defs = root["$defs"] as? [String: Any],
              let block = defs["DimensionRanges"] as? [String: Any],
              let properties = block["properties"] as? [String: Any],
              !properties.isEmpty else {
            return DimensionCatalogSnapshot(byKind: [:], failed: true)
        }
        var loaded: [String: DimensionLimits] = [:]
        for (kind, raw) in properties {
            guard let object = raw as? [String: Any],
                  let axes = object["properties"] as? [String: Any],
                  let width = axis(axes["widthMm"]),
                  let height = axis(axes["heightMm"]),
                  let depth = axis(axes["depthMm"]) else { continue }
            loaded[kind] = DimensionLimits(widthMm: width, heightMm: height, depthMm: depth)
        }
        if loaded.isEmpty {
            return DimensionCatalogSnapshot(byKind: [:], failed: true)
        }
        return DimensionCatalogSnapshot(byKind: loaded, failed: false)
    }

    private static func loadBundled() -> DimensionCatalogSnapshot {
        guard let url = Bundle.module.url(forResource: "supplier-pack.schema", withExtension: "json"),
              let data = try? Data(contentsOf: url) else {
            return DimensionCatalogSnapshot(byKind: [:], failed: true)
        }
        return parse(data)
    }

    private static func axis(_ raw: Any?) -> DimensionLimits.Axis? {
        guard let object = raw as? [String: Any],
              let minimum = (object["minimum"] as? NSNumber)?.doubleValue,
              let maximum = (object["maximum"] as? NSNumber)?.doubleValue else { return nil }
        return DimensionLimits.Axis(minimum: minimum, maximum: maximum)
    }
}

private extension DimensionLimits {
    func axis(_ name: String) -> Axis? {
        switch name {
        case "widthMm": return widthMm
        case "heightMm": return heightMm
        case "depthMm": return depthMm
        default: return nil
        }
    }
}
