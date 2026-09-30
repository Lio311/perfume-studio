const fs = require('fs');
let code = fs.readFileSync('src/scene/materials.tsx', 'utf8');
code = code.replace(
  'transparent',
  'transparent\n        resolution={1024}\n        samples={8}'
);
fs.writeFileSync('src/scene/materials.tsx', code);
