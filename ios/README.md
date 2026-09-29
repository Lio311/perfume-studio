# ios/ — Perfume Studio scanner (iPhone app)

iPhone app for scanning perfume packaging parts (bottle, cap, pump, collar, box): camera, distance guide, capture, dimensions, review, calibration. Exports the shared supplier-pack JSON (`Fixtures/supplier-pack.schema.json`, must stay identical to `schema/supplier-pack.schema.json` at the repo root).

## Build on the Mac
```
cd ios
brew install xcodegen
xcodegen generate
open Scanner.xcodeproj   # pick your team under Signing & Capabilities, run on the iPhone
```

## Logic tests (also on Linux)
```
cd ios/Packages/PackKit && swift test
```

## Distance check

LiDAR is an optional runtime upgrade and is never required: no Info.plist capability and no hard dependency. The distance guide uses the reference card.

Manual check: hold the card still at 20 cm for 10 s and expect steady green, no arrow, and a number that barely moves. Move slowly to 22 cm and expect yellow plus "קרב" without flipping back to "הרחק". Cover the card for half a second and the reading should hold, dimmed, then resume without a jump. Rotate the card 90° and the depth should stay the same. In a Debug build, turn on "הקלט מרחק", record 10 s, and share the CSV.

## Rules
- Branch + PR per task, never push to `main`. Merge only with the owner's approval.
- Pure logic goes in PackKit (Foundation only). iOS frameworks only in CaptureKit, MeasureKit, Store, UIParts.
- Never edit `.pbxproj`; edit `project.yml`.
- Schema changes go to both copies in the same PR (root `schema/` and `ios/Fixtures/`).
- Never touch the web build: no changes to root `package.json`, `vite`/`tsconfig`, `vercel.json` or `src/` from iOS PRs.
