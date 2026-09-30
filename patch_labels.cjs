const fs = require('fs');
let code = fs.readFileSync('src/geometry/logos.ts', 'utf8');

code = code.replace(
  'paintLabel(ctx, spec, text, ink, w, h, application === "decal" ? "contrast" : "clear", minStroke);\n  applyLabelRelief(canvas, application, foil);\n  if (application === "emboss") sealEmbossPlate(canvas, ink);',
  `if (application === "sticker") {
    paintLabel(ctx, spec, text, contrastingPlate(ink), w, h, ink, minStroke);
  } else {
    paintLabel(ctx, spec, text, ink, w, h, application === "decal" ? "contrast" : "clear", minStroke);
  }
  applyLabelRelief(canvas, application, foil);
  if (application === "plaque") sealEmbossPlate(canvas, ink);`
);

fs.writeFileSync('src/geometry/logos.ts', code);
