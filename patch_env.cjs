const fs = require('fs');
let code = fs.readFileSync('src/scene/studio.tsx', 'utf8');
code = code.replace('const resolution = 256;', 'const resolution = 1024;');
fs.writeFileSync('src/scene/studio.tsx', code);
