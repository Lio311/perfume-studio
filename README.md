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

Three voice variants share this lab. Switch them in the top bar, or open them directly:

- [Sleek minimal](http://127.0.0.1:4327/?voice=1) — matte black, hairline gold and white, a floating glass HUD. Hold the mic (or Space). Hebrew speech-to-text shows live, and the assistant speaks a short Hebrew confirmation.
- [Holographic lab](http://127.0.0.1:4327/?voice=2) — scanline shell on the selected part, a particle field, energy rings, bloom, and a soft depth of field. Say «מעבדה» or “Lab”, then the command. Tour narrates each part as the bottle opens.
- [Cinematic sci-fi](http://127.0.0.1:4327/?voice=3) — a slow camera drift, rim light, a reflective animated grid, mono readouts, and a short scan when a part swaps. Hover ticks, an explode whoosh, an assemble snap, and glass, metal, and wood sounds, plus a lab hum with mute.

Speech uses the browser Web Speech API (`he-IL` and `en-US`) and Web Audio. No API key.

```bash
npm test
npm run build
```

## What you can do

- Browse the library by category. The catalog is data: bottles (including Verescence Cara, Coverpla Bazille, and Stoelzle Cube, Cubique, and Linton), 94 caps grouped into zamac, surlyn, wood, acrylic, magnetic, sculptural, and minimal, 50 logos, 12 pumps, 10 collars, and 8 boxes. A new variant is another entry (lathe profile, section, proportions, neck).
- Every finish and colour applies to the selected part immediately. Parts snap by neck: FEA 13, 15, 17, 18, or 20. Ferrule inner diameter, outer diameter, and height follow EN 14849. The collar wraps the neck, the pump sits on it, and the cap covers the collar.
- Logos are procedural monograms, geometric marks, and type. Type a brand name on the label. Hebrew text uses Heebo.
- Search the library, use the arrows in the properties panel, or press Left / Right to cycle the selected slot. E explodes, 0 resets the camera, Escape returns to the full view.
- Orbit freely on every axis, zoom, and pan. Explode separates the parts and puts them back.
- Chat accepts Hebrew and English, including `פקק הבא` and `next cap`. Voice variants 1 and 2 speak the reply. Variant 3 keeps a secondary mic in the chat.
- Save named designs in this browser, compare up to three, and export a PNG.
- Upload catalog photos or a PDF as a pending part. That stores the files only. It does not build a 3D model.

Randomize in the top bar picks a harmonious look from the catalog. The light studio theme sits next to the default dark graphite and champagne-gold lab.

## Decisions

- One configurator. `?voice=1`, `?voice=2`, and `?voice=3` change the dark look and the voice behaviour. They do not fork the catalog, the fit rules, or the chat parser. With no query, the lab opens on variant 1.
- Voice colour skins apply only while the theme is dark. The light studio toggle still replaces the stage and the panels.
- The camera fits the assembly to about 63% of the stage height, and never past 92% of the open area above the dock, so the leader labels stay in the side gutters. It refits when the explode amount, the viewport, or the look changes. The lab opens slightly apart (25%): parts are only cracked open. The explode mode and “תפרק” go to 100%, and the cap, pump, and collar keep large vertical gaps there. The offset eases in, so 25% and 100% do not look the same.
- The dark stage uses a studio environment of lightformers, ACES at exposure 1.18, a warm key, a gold rim, and a front fill. Clear glass is a fresnel shell with a bright rim and a thin center, so the warm liquid stays visible; thickness and IOR stay on the frosted and tinted finishes. The liquid is a warm colour with its own glow. Metal finishes are fully metallic. The rigid box is a textured matte carton with a gold band. High quality adds a floor reflector and a contact shadow. If that reflector presents a black frame, the stage drops it and keeps a polished disc. Medium drops the reflector, the contact shadow, and the extra pixel ratio so a laptop can stay smooth. The toggle sits in the top bar. Dragging the orbit still wins until you release, then a pending refit can run. Variant 3 plays one entrance along that same framing, from further back into the three-quarter view, and then leaves the camera alone.
- Leader labels sit in the left and right gutters of the stage, with a line back to each part. The selected part's millimetre readout is a separate chip in that gutter, not a second label on the glass.
- Double-click a part, or use בודד חלק, to isolate it on a turntable with its own dimension lines. The breadcrumb הרכבה › part, or Escape, brings the assembly back. Ctrl or Cmd K opens a search of parts and actions. P starts a full-screen turntable for a presentation, with a PNG export. The explode slider is also a timeline: רצף plays the parts off in order, each with a small turn. A spec card on the selected part lists material, millimetres, neck, an estimated weight, and a placeholder MOQ. Clear glass stays a fresnel shell, with a soft caustic band, because real transmission goes opaque on the software renderer. Depth of field is left off for the same reason. Contact shadows stay on the high quality setting.
- The bottle and the carton are separate products. The lab opens on the bottle: glass, cap, collar, pump, and logo only. קופסה switches to the carton alone, framed on its own, with dimensions, finish, colour, window or insert, and the brand on the front. הצג יחד is the optional combined shot, off by default, and the carton stays behind the glass. Clicking a part eases the camera onto that part’s bounds in about 700ms and keeps the orbit around the new target. Double-click, Escape, or חזרה לתצוגה מלאה returns to the full view. רשת draws the parts as a gold blueprint over the floor grid and a faint back wall, with dimension lines. The floor disc fades out radially. The home view is a three-quarter from the front, with the label toward the camera.
- The mic, the holographic orb, and the cinematic sound controls sit in the bottom dock so they do not cover the bottle.
- Postprocessing is skipped when the canvas is not WebGL2. If the cinematic grade still presents a black frame, or the effect chain throws, the lab drops the composer and keeps the lit scene. Part swaps in variant 3 use the CSS scan, not a WebGL glitch pass.
- Variant 2 keeps a light scan and a thin particle field so the bottle stays the subject. Its waveform sits in the dock beside the orb, not across the controls. Variant 3’s floor is the shared reflector plus a moving grid.
- `vite build` writes `dist/` with relative asset paths (`base: './'`), so the folder can be hosted from any static path. A zip of that folder is the portable copy.
- Cubique 100 ml is not in the catalog. The research table published the square size and not the height.
- Speech recognition and spoken replies need a browser that exposes the Web Speech API, a microphone, and a click or key before audio can start. There is no cloud speech service and no API key.

## What's next

- A GLB loader on the existing `model` field, when a part should stop being procedural.
- An LLM behind `src/parser/interpreter.ts`. The local parser stays the fallback.
- Photo-to-3D for the pending uploads. Today those files are stored only.
- A Hebrew speech voice is only as good as the voices the browser has installed.

## Not in this version

- Dropping in a GLB per variant. Specs already carry a `model` field (`procedural` today). A loader can branch on `glb` later.
- A hosted language model. Chat is a local parser. `src/parser/interpreter.ts` is the place to POST an utterance and map the JSON back onto the same commands.
- Turning uploaded photos into geometry.
- Speech recognition in browsers that do not expose it. The button explains that in the chat.
