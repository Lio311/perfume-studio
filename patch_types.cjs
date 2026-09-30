const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;

      // Only replace `"foil"` if it's used as a LogoApplication
      if (content.includes('application === "foil"')) {
        content = content.replace(/application === "foil"/g, 'application === "plaque"');
        changed = true;
      }
      if (content.includes('application === "emboss"')) {
        content = content.replace(/application === "emboss"/g, 'application === "sticker"');
        changed = true;
      }
      if (content.includes('application !== "emboss"')) {
        content = content.replace(/application !== "emboss"/g, 'application !== "sticker"');
        changed = true;
      }
      
      // Specifically fix src/model/logos.ts which creates logo templates using "foil" and "emboss"
      if (fullPath.endsWith('src/model/logos.ts')) {
        content = content.replace(/"foil"/g, '"plaque"');
        content = content.replace(/"emboss"/g, '"sticker"');
        changed = true;
      }
      
      if (fullPath.endsWith('src/scene/labelPaint.test.ts')) {
        content = content.replace(/"foil"/g, '"plaque"');
        content = content.replace(/"emboss"/g, '"sticker"');
        changed = true;
      }
      if (fullPath.endsWith('src/model/share.test.ts')) {
        content = content.replace(/"foil"/g, '"plaque"');
        content = content.replace(/"emboss"/g, '"sticker"');
        changed = true;
      }
      if (fullPath.endsWith('src/store/hydrate.test.ts')) {
        content = content.replace(/"foil"/g, '"plaque"');
        content = content.replace(/"emboss"/g, '"sticker"');
        changed = true;
      }
      
      if (fullPath.endsWith('src/ui/Inspector.tsx')) {
        content = content.replace(/readonly \[LogoApplication, "logoPrint" \| "logoEngrave" \| "logoEmboss" \| "logoFoil"\]/g, 
          'readonly [LogoApplication, "logoPrint" | "logoEngrave" | "logoPlaque" | "logoSticker"]');
        changed = true;
      }

      if (changed) {
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}

processDir('src');
