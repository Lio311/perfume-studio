import { bottleById, boxById, capById, collarById, logoById, pumpById } from "../model/catalog.ts";
import { computeFit } from "../model/fit.ts";
import { NECKS } from "../model/necks.ts";
import type { Design, Lang } from "../model/types.ts";
import { requestShot } from "../scene/capture.ts";

function row(label: string, value: string): string {
  return `<tr><th>${label}</th><td>${value}</td></tr>`;
}

function esc(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
}

export function downloadSpec(design: Design, lang: Lang): void {
  requestShot((render) => {
    const bottle = bottleById(design.bottle.variantId);
    const cap = capById(design.cap.variantId);
    const pump = pumpById(design.pump.variantId);
    const collar = collarById(design.collar.variantId);
    const logo = logoById(design.label.variantId);
    const box = boxById(design.box.variantId);
    const fit = computeFit(design, false);
    const neck = NECKS[design.bottle.neck];
    const supplier = bottle.supplier;
    const title = lang === "he" ? "מפרט לספק" : "Supplier specification";
    const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${title} · ${esc(design.label.text)}</title>
<style>
  body { margin: 0; font-family: Inter, Heebo, sans-serif; background: #f6f3ee; color: #1b1916; }
  main { max-width: 820px; margin: 32px auto; background: #fff; padding: 32px; }
  h1 { font-weight: 560; font-size: 28px; margin: 0 0 4px; }
  p { color: #6f685e; }
  img { width: 100%; max-height: 420px; object-fit: contain; background: #06070b; border-radius: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; }
  th, td { text-align: start; padding: 8px 6px; border-bottom: 1px solid #eadfce; vertical-align: top; }
  th { width: 34%; color: #6f685e; font-weight: 500; }
</style>
</head>
<body>
<main dir="${lang === "he" ? "rtl" : "ltr"}">
  <h1>${title}</h1>
  <p>${esc(design.label.text)} · ${bottle.capacityMl} ml · ${design.bottle.neck}</p>
  <img alt="" src="${render}" />
  <table>
    ${row(lang === "he" ? "בקבוק" : "Bottle", `${bottle.name[lang]} · ${design.bottle.heightMm.toFixed(1)} × ${design.bottle.widthMm.toFixed(1)} × ${design.bottle.depthMm.toFixed(1)} mm`)}
    ${row(lang === "he" ? "ספק" : "Supplier", supplier ? `${supplier.name}${supplier.ref ? ` · ${supplier.ref}` : ""}` : "—")}
    ${row(lang === "he" ? "צוואר" : "Neck", `${design.bottle.neck} · EN 14849`)}
    ${row(lang === "he" ? "חבק פנימי / חיצוני / גובה" : "Ferrule ID / OD / height", `${neck.ferrule.innerMm} / ${neck.ferrule.outerMm} / ${neck.ferrule.heightMinMm}–${neck.ferrule.heightMaxMm} mm`)}
    ${row(lang === "he" ? "פקק" : "Cap", `${cap.name[lang]} · ${fit.capW.toFixed(1)} × ${fit.capD.toFixed(1)} × ${fit.capH.toFixed(1)} mm · ${design.cap.finish}`)}
    ${row(lang === "he" ? "משאבה" : "Pump", `${pump.name[lang]} · Ø${(fit.actuatorR * 2).toFixed(1)} mm`)}
    ${row(lang === "he" ? "צווארון" : "Collar", `${collar.name[lang]} · Ø${(fit.collarOuter * 2).toFixed(1)} / Ø${(fit.collarInner * 2).toFixed(1)} × ${fit.collarHeight.toFixed(1)} mm`)}
    ${row(lang === "he" ? "סימון" : "Mark", `${logo.name[lang]} · ${esc(design.label.text)}`)}
    ${row(lang === "he" ? "קופסה" : "Box", `${box.name[lang]} · ${fit.boxW.toFixed(1)} × ${fit.boxD.toFixed(1)} × ${fit.boxH.toFixed(1)} mm`)}
    ${row(lang === "he" ? "נוזל" : "Liquid", `${Math.round(design.liquid.fill * 100)}% · ${design.liquid.color}`)}
  </table>
</main>
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "perfume-lab-spec.html";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  });
}
