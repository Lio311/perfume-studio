import { finishFromColor, importedMeta, isVariantPart } from "../import/registry.ts";
import { bottleById, boxById, capById, collarById, logoById, pumpById } from "./catalog.ts";
import { isNeckId } from "./necks.ts";
import type { Design, VariantPart } from "./types.ts";

export function createDefaultDesign(): Design {
  const bottle = bottleById("cara-50");
  const cap = capById("cap-cube-tall");
  const box = boxById("box-rigid");
  return {
    bottle: {
      variantId: bottle.id,
      neck: bottle.neck,
      finish: "clear",
      color: "#f3efe6",
      heightMm: bottle.heightMm,
      widthMm: bottle.widthMm,
      depthMm: bottle.depthMm,
      visible: true,
    },
    cap: {
      variantId: cap.id,
      finish: "gold",
      color: "#e6cc98",
      heightMm: 34.5,
      widthMm: 30,
      visible: false,
    },
    label: {
      variantId: "lg-foil-diamond",
      finish: "gold",
      color: "#e6cc98",
      text: "",
      scale: 1,
      visible: false,
    },
    pump: {
      variantId: "pump-crimp",
      finish: "gold",
      color: "#e6cc98",
      visible: false,
    },
    collar: {
      variantId: "col-crimp",
      finish: "gold",
      color: "#e6cc98",
      visible: false,
    },
    box: {
      variantId: box.id,
      finish: "matteBlack",
      color: "#14161c",
      heightMm: 120,
      widthMm: 78,
      depthMm: 68,
      linked: true,
      visible: false,
    },
    liquid: {
      color: "#c98a2b",
      fill: 0.78,
      visible: false,
    },
    step: 0,
  };
}

/** A square overcap on a round neck clips the collar. Swap in a cylinder and keep the finish. */
function seatCap(design: Design): void {
  const bottle = bottleById(design.bottle.variantId);
  const cap = capById(design.cap.variantId);
  const round = bottle.section === "circle" || bottle.section === "oval";
  const block = cap.section === "rect" || cap.section === "squircle" || cap.section === "diamond";
  if (!round || !block) return;
  const finish = design.cap.finish;
  const color = design.cap.color;
  const next = capById("cap-cyl-32");
  design.cap.variantId = next.id;
  design.cap.heightMm = next.heightMm;
  design.cap.widthMm = next.widthMm;
  design.cap.finish = finish;
  design.cap.color = color;
}

function paintImported(design: Design, kind: VariantPart, id: string): void {
  const extra = importedMeta(id);
  if (!extra) return;
  const finish = finishFromColor(extra.color, kind);
  if (kind === "bottle") {
    design.bottle.color = extra.color;
    design.bottle.finish = finish;
  } else if (kind === "cap") {
    design.cap.color = extra.color;
    design.cap.finish = finish;
  } else if (kind === "label") {
    design.label.color = extra.color;
    design.label.finish = finish;
  } else if (kind === "pump") {
    design.pump.color = extra.color;
    design.pump.finish = finish;
  } else if (kind === "collar") {
    design.collar.color = extra.color;
    design.collar.finish = finish;
  } else {
    design.box.color = extra.color;
    design.box.finish = finish;
  }
  if (isNeckId(extra.neck) && kind !== "box" && kind !== "label") design.bottle.neck = extra.neck;
}

export function applyVariant(design: Design, kind: string, id: string): void {
  if (!isVariantPart(kind)) return;
  if (kind === "bottle") {
    const spec = bottleById(id);
    design.bottle.variantId = spec.id;
    if (isNeckId(spec.neck)) design.bottle.neck = spec.neck;
    design.bottle.heightMm = spec.heightMm;
    design.bottle.widthMm = spec.widthMm;
    design.bottle.depthMm = spec.depthMm;
    paintImported(design, kind, spec.id);
    seatCap(design);
    return;
  }
  if (kind === "cap") {
    const spec = capById(id);
    design.cap.variantId = spec.id;
    design.cap.heightMm = spec.heightMm;
    design.cap.widthMm = spec.widthMm;
    paintImported(design, kind, spec.id);
    return;
  }
  if (kind === "label") {
    design.label.variantId = logoById(id).id;
    paintImported(design, kind, id);
    return;
  }
  if (kind === "pump") {
    design.pump.variantId = pumpById(id).id;
    paintImported(design, kind, id);
    return;
  }
  if (kind === "collar") {
    design.collar.variantId = collarById(id).id;
    paintImported(design, kind, id);
    return;
  }
  const box = boxById(id);
  design.box.variantId = box.id;
  const extra = importedMeta(id);
  if (extra) {
    design.box.widthMm = extra.widthMm;
    design.box.heightMm = extra.heightMm;
    design.box.depthMm = extra.depthMm;
    design.box.linked = false;
  } else {
    design.box.linked = true;
  }
  paintImported(design, kind, box.id);
}

export interface Look {
  id: string;
  name: { he: string; en: string };
  bottleFinish: Design["bottle"]["finish"];
  bottleColor: string;
  capFinish: Design["cap"]["finish"];
  capColor: string;
  collarFinish: Design["collar"]["finish"];
  collarColor: string;
  pumpFinish: Design["pump"]["finish"];
  pumpColor: string;
  labelFinish: Design["label"]["finish"];
  labelColor: string;
  boxFinish: Design["box"]["finish"];
  boxColor: string;
  liquid: string;
}

export const LOOKS: Look[] = [
  { id: "atelier", name: { he: "אטלייה", en: "Atelier" }, bottleFinish: "clear", bottleColor: "#f3efe6", capFinish: "matteBlack", capColor: "#141414", collarFinish: "gold", collarColor: "#e6cc98", pumpFinish: "silver", pumpColor: "#d5d8de", labelFinish: "gold", labelColor: "#e6cc98", boxFinish: "matteBlack", boxColor: "#1a1b1e", liquid: "#e2a24a" },
  { id: "blush", name: { he: "סומק", en: "Blush" }, bottleFinish: "frosted", bottleColor: "#f7e7ea", capFinish: "rose", capColor: "#e4b7ae", collarFinish: "rose", collarColor: "#e4b7ae", pumpFinish: "rose", pumpColor: "#e4b7ae", labelFinish: "rose", labelColor: "#e4b7ae", boxFinish: "leather", boxColor: "#6b3c32", liquid: "#f3c9d6" },
  { id: "noir", name: { he: "נואר", en: "Noir" }, bottleFinish: "tinted", bottleColor: "#2a2c2b", capFinish: "gold", capColor: "#e6cc98", collarFinish: "gold", collarColor: "#e6cc98", pumpFinish: "gold", pumpColor: "#e6cc98", labelFinish: "gold", labelColor: "#e6cc98", boxFinish: "matteBlack", boxColor: "#101010", liquid: "#7a1f2c" },
  { id: "sage", name: { he: "מרווה", en: "Sage" }, bottleFinish: "tinted", bottleColor: "#8d9a84", capFinish: "wood", capColor: "#8a5a3a", collarFinish: "gold", collarColor: "#c9a36a", pumpFinish: "gold", pumpColor: "#c9a36a", labelFinish: "gold", labelColor: "#c9a36a", boxFinish: "wood", boxColor: "#6d4c34", liquid: "#d8efe4" },
  { id: "ice", name: { he: "קרח", en: "Ice" }, bottleFinish: "clear", bottleColor: "#f7f8f8", capFinish: "silver", capColor: "#e6e8ec", collarFinish: "silver", collarColor: "#d5d8de", pumpFinish: "silver", pumpColor: "#d5d8de", labelFinish: "silver", labelColor: "#d5d8de", boxFinish: "silver", boxColor: "#c5c8ce", liquid: "#f7f1e4" },
  { id: "ink", name: { he: "דיו", en: "Ink" }, bottleFinish: "tinted", bottleColor: "#1d3344", capFinish: "matteBlack", capColor: "#121416", collarFinish: "silver", collarColor: "#c5c8ce", pumpFinish: "silver", pumpColor: "#c5c8ce", labelFinish: "silver", labelColor: "#d5d8de", boxFinish: "leather", boxColor: "#243044", liquid: "#1d3344" },
];

export function applyLook(design: Design, look: Look): void {
  design.bottle.finish = look.bottleFinish;
  design.bottle.color = look.bottleColor;
  design.cap.finish = look.capFinish;
  design.cap.color = look.capColor;
  design.collar.finish = look.collarFinish;
  design.collar.color = look.collarColor;
  design.pump.finish = look.pumpFinish;
  design.pump.color = look.pumpColor;
  design.label.finish = look.labelFinish;
  design.label.color = look.labelColor;
  design.box.finish = look.boxFinish;
  design.box.color = look.boxColor;
  design.liquid.color = look.liquid;
}

export function estimateMl(design: Design): number {
  const spec = bottleById(design.bottle.variantId);
  const same =
    Math.abs(design.bottle.heightMm - spec.heightMm) < 0.6 &&
    Math.abs(design.bottle.widthMm - spec.widthMm) < 0.6 &&
    Math.abs(design.bottle.depthMm - spec.depthMm) < 0.6;
  if (same && spec.supplier?.capacityMl) return spec.supplier.capacityMl;
  if (same) return spec.capacityMl;
  const scale =
    (design.bottle.heightMm / spec.heightMm) *
    (design.bottle.widthMm / spec.widthMm) *
    (design.bottle.depthMm / spec.depthMm);
  return Math.max(5, Math.round((spec.capacityMl * scale) / 5) * 5);
}
