const fs = require('fs');

let tests = fs.readFileSync('src/geometry/logos.test.ts', 'utf8');
tests = tests.replace(/"foil"/g, '"plaque"');
tests = tests.replace(/"emboss"/g, '"sticker"');
fs.writeFileSync('src/geometry/logos.test.ts', tests);

let assembly = fs.readFileSync('src/scene/Assembly.tsx', 'utf8');
assembly = assembly.replace('import { contrastingPlate, labelInk } from "../geometry/logos.ts";', 'import { labelInk } from "../geometry/logos.ts";');
fs.writeFileSync('src/scene/Assembly.tsx', assembly);

let carton = fs.readFileSync('src/scene/cartonMark.tsx', 'utf8');
carton = carton.replace(/"foil"/g, '"plaque"');
carton = carton.replace(/"emboss"/g, '"sticker"');
carton = carton.replace(/application !== "sticker"/g, 'application !== "sticker"');
fs.writeFileSync('src/scene/cartonMark.tsx', carton);

let tube = fs.readFileSync('src/scene/closures/tubeMark.tsx', 'utf8');
tube = tube.replace(/"foil"/g, '"plaque"');
tube = tube.replace(/"emboss"/g, '"sticker"');
fs.writeFileSync('src/scene/closures/tubeMark.tsx', tube);

let lp = fs.readFileSync('src/scene/labelPaint.ts', 'utf8');
lp = lp.replace(/"foil"/g, '"plaque"');
lp = lp.replace(/"emboss"/g, '"sticker"');
fs.writeFileSync('src/scene/labelPaint.ts', lp);
