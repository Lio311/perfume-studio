# מעבדת הבושם — Perfume Lab

One configurator for a private-label perfume bottle. Pick a shape, cap, pump, collar, label, and box, and they snap together on a real neck standard. The default bottle is the Verescence CARA 50 ml (67.6 × 51 × 43 mm, FEA 15).

The default look is the dark lab: graphite stage, a faint cyan floor grid, one champagne-gold accent, and frosted panels. Hebrew is right to left. A light studio theme is in the top bar.

The top bar switches assemble, explode, dimensions, and compare, and holds undo, redo, share, and PNG export. The library cards show millimetres. The dock is an explode slider plus view presets. A selected part gets corner brackets and live millimetre lines. Chat suggestions stay visible, and each reply has its own undo.

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:4327

```bash
npm test
npm run build
```

## What you can do

- Browse the library by category. The catalog is data: 46 bottles, 50 caps, 50 logos, 12 pumps, 10 collars, and 8 boxes. A new variant is another entry (lathe profile, section, proportions, neck).
- Every finish and colour applies to the selected part immediately. Parts snap by neck: FEA 13, 15, 18, or 20. The collar wraps the neck, the pump sits on it, and the cap covers the collar.
- Logos are procedural monograms, geometric marks, and type. Type a brand name on the label. Hebrew text uses Heebo.
- Search the library, use the arrows in the properties panel, or press Left / Right to cycle the selected slot. E explodes, 0 resets the camera, Escape clears the selection.
- Orbit freely on every axis, zoom, and pan. Explode separates the parts and puts them back.
- Chat accepts Hebrew and English, including `פקק הבא` and `next cap`. The mic button uses the browser speech API (`he-IL` / `en-US`) when the browser provides it.
- Save named designs in this browser, compare up to three, and export a PNG.
- Upload catalog photos or a PDF as a pending part. That stores the files only. It does not build a 3D model.

Randomize in the top bar picks a harmonious look from the catalog. The light studio theme sits next to the default dark graphite and champagne-gold lab.

## Not in this version

- Dropping in a GLB per variant. Specs already carry a `model` field (`procedural` today). A loader can branch on `glb` later.
- A hosted language model. Chat is a local parser. `src/parser/interpreter.ts` is the place to POST an utterance and map the JSON back onto the same commands.
- Turning uploaded photos into geometry.
- Speech recognition in browsers that do not expose it. The button explains that in the chat.
