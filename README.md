# Perfume Lab

A web-based 3D configurator for private-label perfume bottles. Choose a shape, cap, pump, collar, label, and box, and watch them snap together seamlessly based on real neck standards (e.g., FEA 15). The default bottle is the Verescence CARA 50 ml.

## 🛠️ Technology Stack

This project is built using modern web and 3D technologies:

- **React 19**: Drives the UI, wizard, and stateful components.
- **Three.js & React Three Fiber (R3F)**: Powers the 3D rendering, procedural geometry generation, and scene graph.
- **@react-three/drei**: Provides camera controls, environments, and text rendering.
- **Zustand & Immer**: Handles complex global state, including design history (undo/redo) and part selections.
- **Framer Motion**: Adds smooth UI transitions and layout animations.
- **Vite**: Fast development server and production bundler.
- **PDF.js**: Enables client-side parsing of supplier catalogs (PDFs) to automatically extract dimensions and neck sizes, generating parametric 3D parts.
- **Web Speech API**: Powers the voice assistant for hands-free configuration and chat parsing. No cloud API key required.

## ✨ Features

- **Procedural Parts & Snapping**: Parts automatically fit together based on their FEA neck standard (13, 15, 17, 18, or 20).
- **Data-Driven Catalog**: Browse 90+ caps (zamac, surlyn, wood, acrylic, magnetic), 50 logos, pumps, collars, and boxes. Instantly apply finishes (matte, gloss, clear, frosted, tinted glass) and colors.
- **Custom Logos & Branding**: Use procedural monograms, geometric marks, or type a brand name to render directly on the glass.
- **Interactive Camera**: Orbit, zoom, and pan. The camera automatically frames the selected part or the entire assembly. Explode the bottle to see internal parts.
- **Voice & Chat Assistant**: Chat accepts English commands (e.g., "next cap", "matte black bottle").
- **Voice Variants**: 
  - *Sleek minimal*: Matte black UI with floating glass HUD.
  - *Holographic lab*: Scanline shell effects, particle fields, and energy rings.
  - *Cinematic sci-fi*: Animated grid, rim lighting, sound effects, and post-processing glitch scans on part swaps.
- **Save & Compare**: Save design iterations locally in the browser, compare up to three at once, and export a high-resolution PNG.
- **Supplier Catalog Import**: Upload a supplier PDF. The built-in regex extractor reads codes and dimensions, generating parametric 3D models instantly.

## 🧠 Architecture & Design Decisions

- **Single Engine, Multiple Themes**: A single configurator engine drives everything. URL parameters (`?voice=1`) dynamically change the lighting, environment, and post-processing without duplicating the underlying catalog or fit rules.
- **Rendering Quality**: 
  - Clear glass on the high tier is a physical material (transmission, thickness, IOR). The opacity slider and the tint color drive transmission and attenuation. The fallback tier keeps the fresnel shader, and that shader uses the same opacity and tint, with environment-style reflections, so software renderers stay readable.
  - High tier adds highlight-only bloom, soft contact shadows, and a higher pixel ratio. Fallback skips bloom, uses a baked contact shadow, and caps the pixel ratio. Phones start on fallback. Studio light is a procedural softbox environment plus a rim light, with no remote HDRI.
  - Polished metal is high metalness and low roughness. Paper and velvet wraps use resized ambientCG maps. Velvet adds a sheen on top of the cloth map.
- **Approved dependencies**:
  - **GSAP** `3.15.0` drives the paused timeline that tweens one `openAmount`. Installed `package.json` license field: `Standard 'no charge' license: https://gsap.com/standard-license.` The package README says: GreenSock's standard "no charge" license can be viewed at https://gsap.com/standard-license. `gsap-core.js` states: Subject to the terms at https://gsap.com/standard-license.
  - **@react-three/postprocessing** `3.1.3` is the high-tier bloom. Its `package.json` license field is `MIT`, and the bundled `LICENSE` begins `MIT License` / `Copyright (c) 2020 react-spring`.
- **CC0 textures**: ambientCG Paper001 (https://ambientcg.com/view?id=Paper001) and Fabric027 (https://ambientcg.com/view?id=Fabric027), both CC0 1.0. They were resized to 512px on the long side. Fabric027 is a soft cloth scan; the velvet wrap is that map plus a sheen. See `src/assets/textures/LICENSE.txt`.
  - Decals (logos) are rendered as opaque meshes conforming to the bottle's curved surface to prevent z-fighting or mirrored text.
- **Part Isolation**: Double-clicking a part isolates it on a turntable with dimension leader lines. The camera easing uses a cubic in-out curve but instantly yields to user gestures (scroll/pinch).
- **Packaging Workflow**: The bottle and the carton are handled as separate entities. You can view the box alone, hinge the lid open, or render them side-by-side in a combined shot.
- **Unboxing model**: Structure and latch are separate on the existing box part (`src/model/boxFields.ts`). That file is the validator for those fields, kept apart from the supplier-pack price check so the two can rebase independently. A magnet is a latch, not a structure. Each structure is one module, `src/model/closures/<id>.ts`: `hinged-lid` (magnetic closure box, flap over the front), `lift-off` (two-piece / telescope), `sleeve` (tray-and-sleeve), `drawer` (matchbox drawer), and `book` (book style / flip box, side spine). The mesh is `src/scene/closures/build/<id>.tsx`. Both folders load with `import.meta.glob`, so a later structure is a new entry, a builder, and a test, with no edit to a central union. The picker shows five presets: מגנט is hinged-lid plus a magnet, לחיצה is lift-off, הזזה is the tray-and-sleeve, מגירה is the matchbox drawer, and ספר is book style with a magnet latch. Magnet is also valid on book style and on the two-piece box; ribbon and none are the other latches. Lift-off carries a variant: shoulder-neck (default, the inner neck visible between lid and base), telescope-full (the lid is as tall as the base), or telescope-partial, with neck height and lid depth. The matchbox drawer can add a pull ribbon or a thumb notch. Unknown structure ids in a saved design or a share link warn once and become lift-off. A missing structure does the same without a warning. A saved `closure: "magnetic"` migrates to hinged-lid plus magnet. Each movable group maps one `openAmount` (0 to 1) through its own delay, duration, and ease onto rotation or translation, the same single-driver pattern as the Codrops folding-box tutorial. PR-2 tweens that parameter; `openDriver` exposes the per-group values. The insert cavity follows the selected bottle, cap, and pump. Outer millimetres follow the insert plus the walls unless a supplier part fixes them. The hands control stays disabled (“בקרוב” / “Coming soon”).
- **Soundtrack**: Muted by default, and no audio file is bundled. `configureUnboxingTrack(url)` only stores the URL. The unboxing mute button is the user gesture that may call `play()`, and that call is skipped until a URL is set. Setting the URL never starts playback by itself.

## 🚀 Roadmap

- **GLB Support**: Implement a loader for non-procedural imported 3D models.
- **LLM Integration**: Connect a Large Language Model behind the chat interpreter for more natural command parsing (falling back to the local regex parser).
- **Image-to-3D Integration**: Add API support to generate non-round parts from user-uploaded photos.
