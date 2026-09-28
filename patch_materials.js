const fs = require('fs');
let code = fs.readFileSync('src/scene/materials.tsx', 'utf-8');

// Use transmission = 1 - opacity (clamped to 0.01) for all glass
code = code.replace(
  /transmission=\{glassLike \? .* \: 0\}/,
  'transmission={glassLike ? Math.max(0.01, glassTransmission(finish, opacity) ?? 0) : 0}'
);

// Keep opacity=1 for tinted and clear glass, only use alpha for frosted/others if needed.
// Actually, let's just make it 1 for tinted glass.
code = code.replace(
  /opacity=\{glassLike \? .* \: 1\}/,
  'opacity={glassLike ? (finish === "tinted" || finish === "clear" ? 1.0 : (effectiveGlassOpacity(finish, opacity) ?? 1)) : 1}'
);

fs.writeFileSync('src/scene/materials.tsx', code);
