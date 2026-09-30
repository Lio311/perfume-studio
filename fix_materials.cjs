const fs = require("fs");
let src = fs.readFileSync("src/model/materials.ts", "utf8");

src = src.replace(/  \{ id: "leather".*?\},?\n/, `  { id: "leather", name: { he: "עור", en: "Leather" }, color: "#6b3c32", group: "solid" },\n  { id: "fabric", name: { he: "בד (Sospiro)", en: "Fabric" }, color: "#3d4b68", group: "solid" },\n`);

src = src.replace("export const FINISHES: FinishDef[] = [", "export const FINISHES: FinishDef[] = [\n");

// Add UI_FINISHES
const uiFinishesDef = `\nexport const UI_FINISHES = FINISHES.filter(f => !["gold", "silver", "rose", "matteBlack"].includes(f.id));\n`;
src = src.replace("export const PALETTE = [", uiFinishesDef + "\nexport const PALETTE = [");

fs.writeFileSync("src/model/materials.ts", src);
console.log("Done");
