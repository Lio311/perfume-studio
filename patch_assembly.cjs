const fs = require('fs');

let logos = fs.readFileSync('src/geometry/logos.ts', 'utf8');
logos = logos.replace(/export function labelInk[\s\S]*?^}/m, `export function labelInk(color: string, application: LogoApplication = "decal", substrate?: string): string {
  if (application === "engrave") {
    const ground = substrate?.trim();
    if (ground) return ground;
    return EMBOSS_SUBSTRATE;
  }
  return color;
}`);
fs.writeFileSync('src/geometry/logos.ts', logos);

let assembly = fs.readFileSync('src/scene/Assembly.tsx', 'utf8');
assembly = assembly.replace(
  'const ground = application === "emboss" || application === "engrave" ? contrastingPlate(design.label.color) : undefined;',
  'const ground = application === "engrave" ? design.bottle.color : undefined;'
);
assembly = assembly.replace(/ink={application === "foil" \? design.label.color : ink}/g, 'ink={ink}');
assembly = assembly.replace(/substrate={application === "foil" \? design.bottle.color : undefined}/g, 'substrate={application === "engrave" ? design.bottle.color : undefined}');
fs.writeFileSync('src/scene/Assembly.tsx', assembly);

