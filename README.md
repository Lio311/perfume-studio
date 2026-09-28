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
  - Clear glass utilizes a custom shader with a fresnel shell and cool reflection to perform well on software renderers.
  - Decals (logos) are rendered as opaque meshes conforming to the bottle's curved surface to prevent z-fighting or mirrored text.
- **Part Isolation**: Double-clicking a part isolates it on a turntable with dimension leader lines. The camera easing uses a cubic in-out curve but instantly yields to user gestures (scroll/pinch).
- **Packaging Workflow**: The bottle and the carton are handled as separate entities. You can view the box alone, hinge the lid open, or render them side-by-side in a combined shot.
- **Supplier pack import**: A pack over 5 MB is rejected before it is read. The import dialog lists the first 10 problems and then how many more there were. Each part needs a supported kind (an unknown kind is not stored as a box), a neck of null or FEA 13, 15, 17, 18, or 20, millimetres inside the built-in catalog ranges, and a `#rrggbb` colour. `lathe` samples must be between 0 and 1.2. Part ids must be unique and must not reuse a built-in catalog id. When present, `version` must be the integer 2, `source` must be pdf, photo, scan, or manual, and `supplier` must be an object. Keys named `__proto__`, `constructor`, and `prototype` are dropped. `price` is checked by `sanitizeSupplierPrice` in `src/model/price.ts`. A base `value` that is not a finite number above 0, a currency that is not ISO 4217 (shekel spellings are stored as `ILS`), or an `moq` that is not an integer of 1 or more drops the whole price with a warning, and the part still imports. A present `quotedAt` must be an ISO 8601 date or the price is dropped. Each tier is checked in the written order and is not sorted: `minQty` must be an integer, strictly greater than `moq` when `moq` is set (otherwise at least 2), strictly greater than the previous kept tier, and its `value` a finite number above 0. A failing tier is dropped with a warning and the rest of the price is kept. A tier that costs more than the previous price is kept, with a warning. Legacy `qty` is read only when `minQty` is absent; a present non-numeric `minQty` is invalid. The function returns `{ price, issues }` and does not keep the issues in module state. Each issue has `path`, `code`, `severity`, and Hebrew and English messages. The lab shows them as warnings, up to 20 lines and then "+N more". An invalid price is left off the part; the library shows "אין מחיר" / "No price". `mesh` and `scan` stay only as plain objects, and `measurements` as a plain object or an array of them. Warnings are shown in Hebrew or English. Stored packs are checked again on load, and a bad part is dropped with a warning. `supplier`, `version`, and `source` are written back on export. Meshes are not loaded.

## 🚀 Roadmap

- **GLB Support**: Implement a loader for non-procedural imported 3D models.
- **LLM Integration**: Connect a Large Language Model behind the chat interpreter for more natural command parsing (falling back to the local regex parser).
- **Image-to-3D Integration**: Add API support to generate non-round parts from user-uploaded photos.
