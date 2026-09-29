import { tx } from "../i18n/copy.ts";
import { bottleById, boxById, capById, collarById, logoById, pumpById, resolvedLabelApplication } from "../model/catalog.ts";
import { computeFit, type Fit } from "../model/fit.ts";
import { FINISHES, renderedGlassOpacity } from "../model/materials.ts";
import { isNeckId, NECKS } from "../model/necks.ts";
import type { Design, Lang } from "../model/types.ts";
import { requestShot } from "../scene/capture.ts";

function row(label: string, value: string): string {
  return `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`;
}

export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function sized(name: string, fit: Fit | null, size: (fit: Fit) => string): string {
  return `${name} · ${fit ? size(fit) : "—"}`;
}

export function buildSpecHtml(design: Design, lang: Lang, render: string): string {
  const bottle = bottleById(design.bottle.variantId);
  const cap = capById(design.cap.variantId);
  const pump = pumpById(design.pump.variantId);
  const collar = collarById(design.collar.variantId);
  const logo = logoById(design.label.variantId);
  const box = boxById(design.box.variantId);
  const neckId = design.bottle.neck;
  const neck = isNeckId(neckId) ? NECKS[neckId] : null;
  const fit = neck ? computeFit(design, false) : null;
  const supplier = bottle.supplier;
  const t = tx(lang);
  const title = lang === "he" ? "מפרט לספק" : "Supplier specification";
  const applicationName = {
    decal: t.logoPrint,
    engrave: t.logoEngrave,
    emboss: t.logoEmboss,
    foil: t.logoFoil,
  }[resolvedLabelApplication(design.label)];
  const supplierLine = supplier ? `${supplier.name}${supplier.ref ? ` · ${supplier.ref}` : ""}` : "—";
  const ferrule = neck
    ? `${neck.ferrule.innerMm} / ${neck.ferrule.outerMm} / ${neck.ferrule.heightMinMm}–${neck.ferrule.heightMaxMm} mm`
    : "—";
  const glassFinish = FINISHES.find((item) => item.id === design.bottle.finish);
  const glassName = glassFinish ? glassFinish.name[lang] : design.bottle.finish;
  const glassOpacity = renderedGlassOpacity(design.bottle.finish, design.bottle.opacity);
  const glass = glassOpacity === null
    ? `${glassName} · ${design.bottle.color}`
    : `${glassName} · ${design.bottle.color} · ${Math.round(glassOpacity * 100)}%`;
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8" />
<title>${esc(title)} · ${esc(design.label.text)}</title>
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
  <h1>${esc(title)}</h1>
  <p>${esc(`${design.label.text} · ${bottle.capacityMl} ml · ${design.bottle.neck}`)}</p>
  <img alt="" src="${esc(render)}" />
  <table>
    ${row(lang === "he" ? "בקבוק" : "Bottle", `${bottle.name[lang]} · ${design.bottle.heightMm.toFixed(1)} × ${design.bottle.widthMm.toFixed(1)} × ${design.bottle.depthMm.toFixed(1)} mm`)}
    ${row(lang === "he" ? "זכוכית" : "Glass", glass)}
    ${row(lang === "he" ? "ספק" : "Supplier", supplierLine)}
    ${row(lang === "he" ? "צוואר" : "Neck", `${design.bottle.neck} · EN 14849`)}
    ${row(lang === "he" ? "חבק פנימי / חיצוני / גובה" : "Ferrule ID / OD / height", ferrule)}
    ${row(lang === "he" ? "פקק" : "Cap", `${sized(cap.name[lang], fit, (part) => `${part.capW.toFixed(1)} × ${part.capD.toFixed(1)} × ${part.capH.toFixed(1)} mm`)} · ${design.cap.finish}`)}
    ${row(lang === "he" ? "משאבה" : "Pump", sized(pump.name[lang], fit, (part) => `Ø${(part.headR * 2).toFixed(1)} mm`))}
    ${row(lang === "he" ? "צווארון" : "Collar", sized(collar.name[lang], fit, (part) => `Ø${(part.collarOuter * 2).toFixed(1)} / Ø${(part.collarInner * 2).toFixed(1)} × ${part.collarHeight.toFixed(1)} mm`))}
    ${row(lang === "he" ? "סימון" : "Mark", `${logo.name[lang]} · ${design.label.text}`)}
    ${row(t.logoApplication, applicationName)}
    ${row(lang === "he" ? "קופסה" : "Box", sized(box.name[lang], fit, (part) => `${part.boxW.toFixed(1)} × ${part.boxD.toFixed(1)} × ${part.boxH.toFixed(1)} mm`))}
    ${row(lang === "he" ? "נוזל" : "Liquid", `${Math.round(design.liquid.fill * 100)}% · ${design.liquid.color}`)}
  </table>
</main>
</body>
</html>`;
}

export function downloadSpec(design: Design, lang: Lang): void {
  requestShot((render) => {
    const html = buildSpecHtml(design, lang, render);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "perfume-lab-spec.html";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  });
}
