import Foundation

public enum DetailLevel: String, Equatable, CaseIterable, Sendable {
    case preview, reduced, medium, full, raw
}

public enum SampleOrder: String, Equatable, CaseIterable, Sendable {
    case sequential, unordered
}

public enum FeatureSensitivityLevel: String, Equatable, CaseIterable, Sendable {
    case normal, high
}

public struct ReconstructOptions: Equatable, Sendable {
    public var imagesFolder: URL
    public var outputDirectory: URL
    public var detail: DetailLevel
    public var heightMm: Double?
    public var widthMm: Double?
    public var useCard: Bool
    public var masking: Bool
    public var ordering: SampleOrder
    public var featureSensitivity: FeatureSensitivityLevel
    public var name: String?

    public init(
        imagesFolder: URL,
        outputDirectory: URL,
        detail: DetailLevel = .medium,
        heightMm: Double? = nil,
        widthMm: Double? = nil,
        useCard: Bool = false,
        masking: Bool = true,
        ordering: SampleOrder = .sequential,
        featureSensitivity: FeatureSensitivityLevel = .normal,
        name: String? = nil
    ) {
        self.imagesFolder = imagesFolder
        self.outputDirectory = outputDirectory
        self.detail = detail
        self.heightMm = heightMm
        self.widthMm = widthMm
        self.useCard = useCard
        self.masking = masking
        self.ordering = ordering
        self.featureSensitivity = featureSensitivity
        self.name = name
    }
}

public enum ArgumentParse: Equatable, Error {
    case help
    case invalid(String)
}

public enum ArgumentParser {
    public static func parse(_ args: [String]) -> Result<ReconstructOptions, ArgumentParse> {
        if args.contains("--help") || args.contains("-h") {
            return .failure(.help)
        }
        var folder: String?
        var output: String?
        var detail: DetailLevel = .medium
        var height: Double?
        var width: Double?
        var useCard = false
        var masking = true
        var ordering: SampleOrder = .sequential
        var sensitivity: FeatureSensitivityLevel = .normal
        var name: String?
        var index = 0

        func fail(_ message: String) -> Result<ReconstructOptions, ArgumentParse> {
            .failure(.invalid(message))
        }

        while index < args.count {
            let token = args[index]
            if token == "--card" {
                useCard = true
                index += 1
                continue
            }
            if !token.hasPrefix("-") {
                if folder != nil {
                    return fail(bilingual(
                        "שגיאה: יותר מתיקיית תמונות אחת.",
                        "Error: More than one images folder was given."
                    ))
                }
                folder = token
                index += 1
                continue
            }

            let (flag, inline) = splitFlag(token)
            let takesValue = Self.flagTakesValue(flag)
            if !takesValue && flag != "--card" {
                return fail(bilingual(
                    "שגיאה: דגל לא מוכר \(flag).",
                    "Error: Unknown flag \(flag)."
                ))
            }
            let value: String?
            if let inline {
                if !takesValue {
                    return fail(bilingual(
                        "שגיאה: דגל לא מוכר \(flag).",
                        "Error: Unknown flag \(flag)."
                    ))
                }
                value = inline
                index += 1
            } else if !takesValue {
                value = nil
                index += 1
            } else {
                let next = index + 1
                if next >= args.count || !Self.isValueToken(args[next]) {
                    return fail(bilingual(
                        "שגיאה: חסר ערך עבור \(flag).",
                        "Error: Missing value for \(flag)."
                    ))
                }
                value = args[next]
                index += 2
            }

            switch flag {
            case "-o", "--output":
                guard let value else {
                    return fail(bilingual("שגיאה: חסר ערך עבור -o.", "Error: Missing value for -o."))
                }
                output = value
            case "--detail":
                guard let value, let parsed = DetailLevel(rawValue: value.lowercased()) else {
                    return fail(bilingual(
                        "שגיאה: --detail חייב להיות preview, reduced, medium, full או raw.",
                        "Error: --detail must be preview, reduced, medium, full, or raw."
                    ))
                }
                detail = parsed
            case "--height-mm":
                guard let value, let parsed = positiveMillimetres(value) else {
                    return fail(bilingual(
                        "שגיאה: --height-mm חייב להיות מספר חיובי.",
                        "Error: --height-mm must be a positive number."
                    ))
                }
                height = parsed
            case "--width-mm":
                guard let value, let parsed = positiveMillimetres(value) else {
                    return fail(bilingual(
                        "שגיאה: --width-mm חייב להיות מספר חיובי.",
                        "Error: --width-mm must be a positive number."
                    ))
                }
                width = parsed
            case "--masking":
                guard let value else {
                    return fail(bilingual("שגיאה: חסר ערך עבור --masking.", "Error: Missing value for --masking."))
                }
                switch value.lowercased() {
                case "on": masking = true
                case "off": masking = false
                default:
                    return fail(bilingual(
                        "שגיאה: --masking חייב להיות on או off.",
                        "Error: --masking must be on or off."
                    ))
                }
            case "--ordering":
                guard let value, let parsed = SampleOrder(rawValue: value.lowercased()) else {
                    return fail(bilingual(
                        "שגיאה: --ordering חייב להיות sequential או unordered.",
                        "Error: --ordering must be sequential or unordered."
                    ))
                }
                ordering = parsed
            case "--feature-sensitivity":
                guard let value, let parsed = FeatureSensitivityLevel(rawValue: value.lowercased()) else {
                    return fail(bilingual(
                        "שגיאה: --feature-sensitivity חייב להיות normal או high.",
                        "Error: --feature-sensitivity must be normal or high."
                    ))
                }
                sensitivity = parsed
            case "--name":
                guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    return fail(bilingual("שגיאה: --name ריק.", "Error: --name is empty."))
                }
                name = value
            default:
                return fail(bilingual(
                    "שגיאה: דגל לא מוכר \(flag).",
                    "Error: Unknown flag \(flag)."
                ))
            }
        }

        guard let folder else {
            return fail(bilingual(
                "שגיאה: חסרה תיקיית התמונות.\n\(HelpText.usage)",
                "Error: Missing the images folder.\n\(HelpText.usage)"
            ))
        }
        guard let output else {
            return fail(bilingual(
                "שגיאה: חסר -o <out-dir>.\n\(HelpText.usage)",
                "Error: Missing -o <out-dir>.\n\(HelpText.usage)"
            ))
        }
        if height != nil && width != nil {
            return fail(bilingual(
                "שגיאה: --height-mm וגם --width-mm יחד. בחרו ציר אחד.",
                "Error: Pass either --height-mm or --width-mm, not both."
            ))
        }

        return .success(ReconstructOptions(
            imagesFolder: URL(fileURLWithPath: folder),
            outputDirectory: URL(fileURLWithPath: output),
            detail: detail,
            heightMm: height,
            widthMm: width,
            useCard: useCard,
            masking: masking,
            ordering: ordering,
            featureSensitivity: sensitivity,
            name: name
        ))
    }

    private static func splitFlag(_ token: String) -> (String, String?) {
        guard let eq = token.firstIndex(of: "=") else { return (token, nil) }
        let flag = String(token[..<eq])
        let value = String(token[token.index(after: eq)...])
        return (flag, value)
    }

    private static func flagTakesValue(_ flag: String) -> Bool {
        switch flag {
        case "-o", "--output", "--detail", "--height-mm", "--width-mm", "--masking", "--ordering", "--feature-sensitivity", "--name":
            return true
        default:
            return false
        }
    }

    private static func isValueToken(_ token: String) -> Bool {
        if !token.hasPrefix("-") { return true }
        return Double(token) != nil
    }

    private static func positiveMillimetres(_ raw: String) -> Double? {
        guard let value = Double(raw), value.isFinite, value > 0 else { return nil }
        return value
    }

    private static func bilingual(_ he: String, _ en: String) -> String {
        he + "\n" + en
    }
}

public enum HelpText {
    public static let usage = "reconstruct <images-folder> -o <out-dir> [--detail preview|reduced|medium|full|raw] [--height-mm N | --width-mm N | --card] [--masking on|off] [--ordering sequential|unordered] [--feature-sensitivity normal|high] [--name NAME]"

    public static let text = """
    reconstruct — שחזור תלת-ממד מתמונות / photogrammetry for perfume parts

    \(usage)

    ברירות מחדל / Defaults
      --detail medium
      --masking on
      --ordering sequential
      --feature-sensitivity normal
      השם נלקח מ--name, אחרת partId ב-capture.json, אחרת שם התיקייה.
      The output name comes from --name, otherwise partId in capture.json, otherwise the folder name.

    קנה מידה / Scale
      --height-mm   גובה (ציר Y) במילימטרים / Y extent in millimetres
      --width-mm    המקסימום מבין X ו-Z במילימטרים / max of the X and Z extents
      --card        כרטיס ID-1‏ (85.60 × 53.98 מ"מ) מתנוחות המצלמה ב-macOS 14 ומעלה.
                    ב-macOS 13, או אם הטריאנגולציה נכשלת, נופלים למידה שהוקלדה או ל-capture.json.
                    ID-1 card (85.60 × 53.98 mm) from camera poses on macOS 14+.
                    On macOS 13, or when triangulation fails, fall back to a typed dimension or capture.json.
      בלי דגלים, הגובה מ-capture.json הוא ברירת המחדל. בלי שום ייחוס הפקודה נכשלת:
      מודל בלי קנה מידה אינו שמיש לאריזה.
      With no flags, capture.json height is the default. With no reference at all the command fails:
      an unscaled model is useless for packaging.

    איכות / Quality
      זכוכית שקופה ומתכת מבריקה משוחזרות גרוע. השתמשו בספריי מט, או חזרו למדידת הסיבוב של M3 (M7).
      Clear glass and shiny metal reconstruct badly. Use a matte spray, or fall back to the M3 measured revolve (M7).
      אחרי קנה המידה, אם תיבת הגבול חורגת ממידות M3 שב-capture.json ביותר מ-5 מ"מ בציר שלא שימש לקנה המידה, מוצגת אזהרה.
      After scaling, the CLI warns when the bounding box differs from the capture.json M3 dimensions by more than 5 mm on an axis that was not used for scaling.

    צילום / Capture
      30–50 תמונות, 2–3 טבעות, תאורה אחידה, רקע חלק, והכרטיס על השולחן וגלוי.
      30–50 photos, 2–3 rings, even light, a plain background, the card on the table and visible.
      פחות מ-20 תמונות קריאות: אזהרה. פחות מ-10: כישלון.
      Fewer than 20 readable images: warning. Fewer than 10: failure.

    פלט / Output
      <name>.usdz, <name>-scaled.usdz, <name>.obj, report.json
      <name>.glb נכתב רק כש-PackKit GLBWriter מ-M7a זמין.
      <name>.glb is written only when PackKit GLBWriter from M7a is available.
    """
}
