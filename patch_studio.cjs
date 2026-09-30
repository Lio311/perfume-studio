const fs = require('fs');

let code = fs.readFileSync('src/scene/studio.tsx', 'utf8');

// Increase pixel ratio cap
code = code.replace(
  'const cap = quality === "high" ? 1.75 : 1;',
  'const cap = quality === "high" ? Math.max(window.devicePixelRatio, 2.5) : 1.5;'
);

// Always show floor shadows on light mode
code = code.replace(
  'if (quality !== "high") return null;',
  'if (quality !== "high" && !light) return null;'
);

// Increase contact shadow resolution
code = code.replace(
  'resolution={256}',
  'resolution={1024}'
);

fs.writeFileSync('src/scene/studio.tsx', code);
