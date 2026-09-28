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
- **Browser Back**: Closes one in-app layer at a time: a dialog, the presentation, search or help, a selected part, the carton stage, then explode. It does not walk wizard steps, and the stage is not a Back layer while the wizard is choosing it. A Back press does not add an undo entry. When nothing is left open, Back leaves the site and does not push another history entry.
- **Share links**: A `#d=` link fills omitted parts from the current defaults and drops unknown keys, including `__proto__` and `constructor`. Invalid necks, finishes, colours, and part ids fall back to defaults. Numbers are clamped, label text is limited to 32 characters, and a missing or invalid step stays unset so the wizard does not reopen. The hash waits about two seconds for hydration and about two seconds for supplier packs (about four seconds worst case), then applies what is already loaded and notes any missing part. If the design changes during that wait, the link is skipped. The page ignores input until the hash is applied or skipped, then clears it with `replaceState`.
- **Stage errors**: A crash while drawing the bottle stays inside the stage. Try again remounts the scene and keeps the design. When WebGL is available and the context is not lost, Reset is also offered and asks before discarding the design. Undo or choosing another part clears the error. The library, properties, and export stay usable, and the message follows the language setting.

## 🚀 Roadmap

- **GLB Support**: Implement a loader for non-procedural imported 3D models.
- **LLM Integration**: Connect a Large Language Model behind the chat interpreter for more natural command parsing (falling back to the local regex parser).
- **Image-to-3D Integration**: Add API support to generate non-round parts from user-uploaded photos.
