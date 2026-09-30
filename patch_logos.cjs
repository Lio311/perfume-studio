const fs = require('fs');

let copy = fs.readFileSync('src/i18n/copy.ts', 'utf8');
copy = copy.replace('logoPrint: "הדפסה",', 'logoPrint: "הדפסה על הזכוכית",');
copy = copy.replace('logoEmboss: "הטבעה",', 'logoPlaque: "לוחית מתכת",');
copy = copy.replace('logoFoil: "פויל",', 'logoSticker: "מדבקת נייר",');
copy = copy.replace('label: "לוגו",', 'label: "תווית",');
copy = copy.replace('brand: "טקסט על הלוגו",', 'brand: "טקסט על התווית",');
copy = copy.replace('logoApplication: "יישום הלוגו",', 'logoApplication: "גימור לתווית",');

copy = copy.replace('logoPrint: "Print",', 'logoPrint: "Direct Print",');
copy = copy.replace('logoEmboss: "Emboss",', 'logoPlaque: "Metal Plaque",');
copy = copy.replace('logoFoil: "Foil",', 'logoSticker: "Paper Sticker",');
copy = copy.replace('label: "Logo",', 'label: "Label",');
copy = copy.replace('brand: "Logo text",', 'brand: "Label text",');
copy = copy.replace('logoApplication: "Logo application",', 'logoApplication: "Label finish",');
fs.writeFileSync('src/i18n/copy.ts', copy);

let logos = fs.readFileSync('src/geometry/logos.ts', 'utf8');
logos = logos.replace('case "foil":', 'case "plaque":');
logos = logos.replace('case "emboss":', 'case "sticker":');
logos = logos.replace('application === "emboss"', 'application === "plaque"');
fs.writeFileSync('src/geometry/logos.ts', logos);

let inspector = fs.readFileSync('src/ui/Inspector.tsx', 'utf8');
inspector = inspector.replace('["emboss", "logoEmboss"]', '["plaque", "logoPlaque"]');
inspector = inspector.replace('["foil", "logoFoil"]', '["sticker", "logoSticker"]');
inspector = inspector.replace('resolvedLabelApplication(design.label) === "emboss"', 'resolvedLabelApplication(design.label) === "plaque"');
fs.writeFileSync('src/ui/Inspector.tsx', inspector);

let specSheet = fs.readFileSync('src/ui/specSheet.ts', 'utf8');
specSheet = specSheet.replace('emboss: t.logoEmboss', 'plaque: t.logoPlaque');
specSheet = specSheet.replace('foil: t.logoFoil', 'sticker: t.logoSticker');
fs.writeFileSync('src/ui/specSheet.ts', specSheet);

let hydrate = fs.readFileSync('src/store/hydrate.ts', 'utf8');
hydrate = hydrate.replace(/application: "foil"/g, 'application: "plaque"');
fs.writeFileSync('src/store/hydrate.ts', hydrate);

