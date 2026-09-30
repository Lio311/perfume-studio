# reconstruct — שחזור תלת-ממד ב-Mac / Mac photogrammetry CLI

כלי שורת פקודה ל-MacBook Pro עם Apple silicon. הוא קורא תיקיית תמונות HEIC/JPEG (צילום הקפה מהאייפון, M8), מריץ את `PhotogrammetrySession`, ומכויל את המודל למילימטרים.

Command-line photogrammetry for an Apple silicon Mac. Point it at a folder of HEIC/JPEG photos from the iPhone capture (M8). It runs `PhotogrammetrySession` and rescales the model into millimetres.

יעד הפריסה: macOS 13.0. נדרשים Apple silicon ו-`PhotogrammetrySession.isSupported`. אם התנאים לא מתקיימים, הכלי מדפיס שגיאה בעברית ובאנגלית עם הגרסה שזוהתה ויוצא בקוד 2.

Deployment target: macOS 13.0. Apple silicon and `PhotogrammetrySession.isSupported` are required. Otherwise the tool prints a Hebrew and English error, including the detected version, and exits with code 2.

## התקנה / Install

נדרש Xcode 15 (Swift tools 5.9) או חדש יותר, או Command Line Tools שמגיעים עם אותה גרסה. אין צורך בקובץ `.xcodeproj`.

Xcode 15 (Swift tools 5.9) or newer, or the matching Command Line Tools. No `.xcodeproj` is committed.

```bash
sw_vers
xcodebuild -version
xcode-select -p
```

`sw_vers` מראה את גרסת macOS, למשל `ProductVersion: 14.2.1`. צריך 13 ומעלה, על Apple silicon (M2 ב-MacBook Pro של בעל המאגר).

`sw_vers` prints the macOS version, for example `ProductVersion: 14.2.1`. You need 13 or later on Apple silicon (the owner's MacBook Pro is an M2).

## בנייה / Build

```bash
cd ios/MacTools/Reconstruct
swift build -c release
```

הבינארי: `.build/release/reconstruct`. אפשר גם לפתוח את `Package.swift` ב-Xcode.

The binary is `.build/release/reconstruct`. You can also open `Package.swift` in Xcode.

בדיקות הלוגיקה (רצות גם על Linux, בלי RealityKit):

Logic tests (they also run on Linux, without RealityKit):

```bash
cd ios/MacTools/Reconstruct
swift test
```

## הרצה אחרי AirDrop מהאייפון / Run after AirDrop from the iPhone

העבירו את תיקיית הצילום למחשב, למשל אל `~/Desktop/Capture`. אם התיקייה מכילה `capture.json`, המידות שבו הן ברירת המחדל לקנה המידה.

AirDrop the capture folder to the Mac, for example `~/Desktop/Capture`. A `capture.json` in that folder supplies the default scale.

```bash
cd ios/MacTools/Reconstruct
swift build -c release
.build/release/reconstruct ~/Desktop/Capture -o ~/Desktop/CaptureOut
```

דוגמה עם פירוט נמוך יותר וגובה מפורש:

A shorter preview run with an explicit height:

```bash
.build/release/reconstruct ~/Desktop/Capture -o ~/Desktop/CaptureOut \
  --detail preview \
  --height-mm 120 \
  --name bottle-01
```

```text
reconstruct <images-folder> -o <out-dir> [--detail preview|reduced|medium|full|raw] [--height-mm N | --width-mm N | --card] [--masking on|off] [--ordering sequential|unordered] [--feature-sensitivity normal|high] [--name NAME]
```

ברירות מחדל: `--detail medium`, `--masking on`, `--ordering sequential`, `--feature-sensitivity normal`.

Defaults: `--detail medium`, `--masking on`, `--ordering sequential`, `--feature-sensitivity normal`.

Ctrl-C מבטל את הסשן ומחזיר קוד 130.

Ctrl-C cancels the session and returns exit code 130.

בזמן הריצה מופיע פס התקדמות: אחוזים, שלב, וזמן משוער. פחות מ-20 תמונות קריאות זו אזהרה. פחות מ-10, קובץ תמונה לא קריא, או כשל של הסשן, זו שגיאה.

A live progress bar shows percent, stage, and ETA. Fewer than 20 readable images warns. Fewer than 10, an unreadable image, or a session failure is an error.

### פלט / Output

- `<name>.usdz` — המודל הגולמי מ-Object Capture / the raw Object Capture model
- `<name>-scaled.usdz` — אחרי קנה מידה אחיד, הבסיס על y=0, והמרכז על X/Z / uniformly scaled, base on y=0, centred on X/Z
- `<name>.obj` — פורמט ביניים אוניברסלי דרך ModelIO / interim universal mesh via ModelIO
- `<name>.glb` — רק כש-PackKit `GLBWriter` מ-M7a מופעל / only when PackKit `GLBWriter` from M7a is enabled
- `report.json` — תיבת גבול לפני ואחרי, מקדם קנה המידה, הייחוס, הפירוט, מספר התמונות, משך הזמן, אזהרות

השם הוא `--name`, אחרת `partId` מ-`capture.json`, אחרת שם התיקייה.

The name is `--name`, otherwise `partId` from `capture.json`, otherwise the folder name.

`boundingBoxMmBefore` הוא התיבה של המודל הגולמי ביחידות שלו (לקנה המידה של Object Capture אין משמעות של מילימטרים). `boundingBoxMmAfter` הוא אותה תיבה במילימטרים אחרי הכיול.

`boundingBoxMmBefore` is the raw model box in photogrammetry units (those units are not millimetres). `boundingBoxMmAfter` is that box in millimetres after scaling.

## קנה מידה / Scale

הפלט של הפוטוגרמטריה אינו במילימטרים אמיתיים. הכלי מכויל באופן אחיד:

Photogrammetry output is not in true millimetres. The tool scales uniformly:

- `--height-mm` — היקף ציר Y / the Y extent
- `--width-mm` — המקסימום מבין היקפי X ו-Z / the larger of the X and Z extents
- בלי דגל — הגובה מ-`capture.json`, ואם אין גובה אז הרוחב / with no flag, `capture.json` height, then width
- `--card` — ב-macOS 14 ומעלה נבקש `.poses` ונשחזר את כרטיס ה-ID-1‏ (85.60 × 53.98 מ"מ) מפינות הכרטיס. ב-macOS 13, או אם השחזור נכשל, נופלים למידה שהוקלדה. בלי שום ייחוס הפקודה נכשלת: מודל בלי קנה מידה אינו שמיש לאריזה.

`--card` on macOS 14+ requests `.poses` and triangulates the ID-1 card (85.60 × 53.98 mm) from the corners in `capture.json`. On macOS 13, or when that fails, it falls back to a typed dimension. With no reference at all the command fails.

המתמטיקה יושבת ב-`ReconstructCore` (Foundation בלבד) ונבדקת ב-`swift test` גם על Linux.

The math lives in `ReconstructCore` (Foundation only) and is covered by `swift test` on Linux too.

## capture.json

האייפון (M8) יכתוב את הקובץ לצד התמונות. המפענח סובלני: מפתחות לא מוכרים מתעלמים, שדה פגום מדולג עם אזהרה, ו-JSON שבור נכשל.

The iPhone (M8) should write this file next to the photos. The decoder is tolerant: unknown keys are ignored, a bad field is skipped with a warning, and broken JSON fails.

מפתחות צפויים:

Expected keys:

| מפתח / Key | משמעות / Meaning |
| --- | --- |
| `partId` (גם `partID`, `id`) | מזהה החלק / part id |
| `kind` | סוג החלק, למשל `bottle`, `cap`, `pump`, `collar`, `box` |
| `heightMm`, `widthMm`, `depthMm` | מידות M3 במילימטרים. אפשר גם בתוך `dimensionsMm` או `dimensions` |
| `photos[]` | תמונה אחת לכל קובץ שבו נראה הכרטיס |
| `photos[].file` (גם `filename`, `name`) | שם הקובץ בתיקייה |
| `photos[].cardCorners` | ארבע פינות: שמאל-למעלה, ימין-למעלה, ימין-למטה, שמאל-למטה. כל פינה היא `{"x","y"}` או `[x,y]`. מקור התמונה שמאל-למעלה. ערכים בטווח 0...1 הם מנורמלים ודורשים `imageWidth`/`imageHeight` |
| `photos[].intrinsics` | אופציונלי. `{"fx","fy","cx","cy"}` או מטריצה 3×3 בשורות. ב-macOS 14 ה-pose מספק intrinsics כשהם קיימים |
| `photos[].imageWidth`, `photos[].imageHeight` | גודל התמונה בפיקסלים, נדרש לפינות מנורמלות |

```json
{
  "partId": "bottle-01",
  "kind": "bottle",
  "dimensionsMm": { "widthMm": 48, "heightMm": 120, "depthMm": 48 },
  "photos": [
    {
      "filename": "IMG_0001.HEIC",
      "imageWidth": 4032,
      "imageHeight": 3024,
      "cardCorners": [
        { "x": 120, "y": 900 },
        { "x": 640, "y": 910 },
        { "x": 630, "y": 1220 },
        { "x": 110, "y": 1210 }
      ]
    }
  ]
}
```

סדר הפינות חשוב לכרטיס: הצלע הארוכה מכוילת ל-85.60 מ"מ והקצרה ל-53.98 מ"מ. אם שתי ההערכות חלוקות ביותר מ-15%, הטריאנגולציה נכשלת ויש נפילה למידה שהוקלדה.

Corner order matters. The long edge is matched to 85.60 mm and the short edge to 53.98 mm. If the two scale estimates disagree by more than 15%, triangulation fails and the typed dimension is used.

## איכות / Quality

זכוכית שקופה ומתכת מבריקה משוחזרות גרוע. השתמשו בספריי מט, או חזרו למדידת הסיבוב של M3 (M7).

Clear glass and shiny metal reconstruct badly. Use a matte spray, or fall back to the M3 measured revolve (M7).

צילום: 30–50 תמונות, 2–3 טבעות, תאורה אחידה, רקע חלק, והכרטיס על השולחן וגלוי. `--masking on` מסיר את הרקע מהמודל; הכרטיס עדיין נקרא מהתמונות ומה-`capture.json`.

Capture: 30–50 photos, 2–3 rings, even light, a plain background, the card on the table and visible. `--masking on` removes the background from the mesh; the card is still read from the photos and from `capture.json`.

אחרי הכיול, אם תיבת הגבול חורגת ממידות ה-M3 שב-`capture.json` ביותר מ-5 מ"מ בציר שלא שימש לקנה המידה, נוספת אזהרה ל-`report.json`.

After scaling, if the bounding box differs from the `capture.json` M3 dimensions by more than 5 mm on an axis that was not used for scaling, a warning is added to `report.json`.

אותן הערות מופיעות גם ב-`reconstruct --help`.

The same notes are in `reconstruct --help`.

## בדיקת עשן לפני שיש צילום מהאייפון / Smoke test before the iPhone capture exists

אפשר להריץ `--help` על כל מכונה. שחזור אמיתי דורש את ה-Mac.

`--help` works on any machine. A real reconstruction needs the Mac.

לאפל יש מאמר שמסביר איך לצלם ערכת בדיקה: [Capturing photographs for RealityKit Object Capture](https://developer.apple.com/documentation/realitykit/capturing-photographs-for-realitykit-object-capture). שימו 30 תמונות או יותר בתיקייה והריצו פירוט `preview` כדי לוודא שהכלי עולה לפני צילום האריזה:

Apple's article explains how to shoot a practice set: [Capturing photographs for RealityKit Object Capture](https://developer.apple.com/documentation/realitykit/capturing-photographs-for-realitykit-object-capture). Put 30 or more photos in a folder and run `preview` detail to check the tool before the packaging capture exists:

```bash
sw_vers
cd ios/MacTools/Reconstruct
swift build -c release
.build/release/reconstruct ~/Samples/ObjectCapture -o ~/Samples/ObjectCaptureOut \
  --detail preview \
  --height-mm 100
```

`--detail preview` הוא הריצה הקצרה. `medium` או `full` הם הריצה שאיתה אורזים.

`--detail preview` is the short run. Use `medium` or `full` for a model you will package.

## GLB אחרי M7a / GLB after M7a

חילוץ הרשת יושב מאחורי הפרוטוקול `GLBEncoding` ב-`ReconstructCore`. ModelIO מייצר `ExtractedMesh` (מיקומים, נורמלים, UV, אינדקסים, וטקסטורת צבע ב-PNG). `GLBDraft` ממפה את זה לצורה המוסכמת של PackKit:

Mesh extraction sits behind the `GLBEncoding` protocol in `ReconstructCore`. ModelIO produces `ExtractedMesh` (positions, normals, UVs, indices, and a base-colour PNG). `GLBDraft` maps that to the agreed PackKit shape:

```swift
public struct GLBMesh {
    public var positions: [SIMD3<Float>]
    public var normals: [SIMD3<Float>]
    public var uvs: [SIMD2<Float>]
    public var indices: [UInt32]
    public var material: GLBMaterial
}
public struct GLBMaterial {
    public var baseColor: SIMD4<Float>
    public var metallic: Float
    public var roughness: Float
    public var alphaBlend: Bool
    public var baseColorTexturePNG: Data?
}
public enum GLBWriter {
    public static func write(meshes: [GLBMesh], generator: String) throws -> Data
}
```

המתאם `PackKitGLBEncoder` כבר בעץ, אבל הוא מקומפל רק כש-`enablePackKitGLB` ב-`Package.swift` הוא `true`. אז נוספת תלות הנתיב `../../Packages/PackKit` ודגל הקומפילציה `PACKKIT_GLB`. ברירת המחדל היא `false`, כדי שהחבילה תיבנה לפני ש-`GLBWriter` נמצא ב-main. עד אז נכתבים USDZ,‏ OBJ ו-`report.json`, והכלי מדפיס ש-GLB מחכה ל-M7a.

`PackKitGLBEncoder` is already in the tree, and it compiles only when `enablePackKitGLB` in `Package.swift` is `true`. That adds the path dependency `../../Packages/PackKit` and the `PACKKIT_GLB` compilation flag. The default is `false`, so this package builds before `GLBWriter` is on main. Until then the CLI writes USDZ, OBJ, and `report.json`, and prints that GLB is waiting on M7a.

אחרי המיזוג של M7a: להפוך את `enablePackKitGLB` ל-`true`, לבנות מחדש `swift build -c release`, ולהריץ שוב. לא צריך לשנות את חילוץ ה-ModelIO.

After M7a merges: set `enablePackKitGLB` to `true`, rebuild with `swift build -c release`, and run again. The ModelIO extraction does not need to change.
