const fs = require('fs');
let content = fs.readFileSync('src/scene/materials.tsx', 'utf-8');
content = content.replace(/<<<<<<< HEAD\n\s*transmission={glassLike \? glassTransmission\(finish, opacity\) : 0}\n=======\n\s*transmission={glassLike \? \(finish === "tinted" \? 1.0 : Math\.max\(0\.01, 1 - actualOpacity\)\) : 0}\n>>>>>>> 81b3d4e.*/, '      transmission={glassLike ? Math.max(0.01, glassTransmission(finish, opacity) ?? 0) : 0}');
content = content.replace(/<<<<<<< HEAD\n\s*opacity={glassLike \? \(effectiveGlassOpacity\(finish, opacity\) \?\? 1\) : 1}\n=======\n\s*opacity={glassLike \? \(finish === "tinted" \? 1.0 : actualOpacity\) : 1}\n>>>>>>> 81b3d4e.*/, '      opacity={glassLike ? (effectiveGlassOpacity(finish, opacity) ?? 1) : 1}');
fs.writeFileSync('src/scene/materials.tsx', content);
