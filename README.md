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

## 🚀 Roadmap

- **GLB Support**: Implement a loader for non-procedural imported 3D models.
- **LLM Integration**: Connect a Large Language Model behind the chat interpreter for more natural command parsing (falling back to the local regex parser).
- **Image-to-3D Integration**: Add API support to generate non-round parts from user-uploaded photos.

## Budget planning

- Before assembly, set a per-unit budget ceiling in ₪ and a perfume volume in ml. A bottle is offered when its nominal fill is within 15% of that volume, or within 2 ml, whichever is wider. Nominal fill is the supplier capacity when present, otherwise a fill token in the id, otherwise the geometric `capacityMl`. The brief can be changed later from the budget meter.
- Library cards and the properties panel show a price. Built-in figures are synthetic multiples of 5 ILS and are labelled מחיר לדוגמה. A typed price is stored in the existing `localStorage` key `perfume-lab-v1`. The meter shows the unit total, what remains, and a clear over-budget state.
- Selecting a part that crosses the ceiling lists the most similar in-budget parts from the built-in catalog and imported packs. Similarity requires the same kind and a compatible FEA neck, then scores 0.40 dimensions, 0.30 shape, 0.20 material, and 0.10 finish. One click swaps a suggestion in.
- At the end of assembly, and from the meter, cheaper swaps are ranked by saving divided by design change. A swap needs at least 5 ₪ saved, similarity of at least 0.55, and a design-change score of at most 0.45. Each row shows the millimetre gap and the price gap.
- `SupplierPart.price` is optional and does not bump the pack version. Old packs import unchanged. Unknown pack fields stay on the JSON. The shape is `{ value: number > 0, currency: ISO 4217, moq?: integer >= 1, tiers?: { minQty: integer >= 1, value: number > 0 }[] sorted by minQty ascending, quotedAt?: ISO 8601 date }`. A string price, a zero, a `qty` tier, or any other break drops that price with a message and the part still imports. `quotedAt`, when present, is shown next to the price. `₪`, `NIS`, and `ש״ח` are stored as `ILS`. Any other currency stays out of the ₪ total until the user enters a shekel rate. The per-unit total uses `value`.
