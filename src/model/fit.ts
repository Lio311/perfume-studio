import { labelPatchExtent } from "../geometry/sweep.ts";
import { bottleById, boxById, capById, collarById, logoById, pumpById } from "./catalog.ts";
import { NECKS, neckRadius } from "./necks.ts";
import { bottleRadii } from "./sample.ts";
import type { Design, PartKey } from "./types.ts";

export interface Fit {
  neckR: number;
  bottleH: number;
  bottleW: number;
  bottleD: number;
  shoulder: number;
  collarBottom: number;
  collarHeight: number;
  collarTop: number;
  collarInner: number;
  collarOuter: number;
  collarFlare: number;
  pumpBase: number;
  actuatorH: number;
  actuatorR: number;
  nozzle: number;
  capBottom: number;
  capH: number;
  capW: number;
  capD: number;
  labelW: number;
  labelH: number;
  labelY: number;
  labelZ: number;
  boxW: number;
  boxH: number;
  boxD: number;
  boxX: number;
  boxZ: number;
  anchors: Record<PartKey, [number, number, number]>;
  explode: Record<PartKey, [number, number, number]>;
}

export function computeFit(design: Design, exploded = false): Fit {
  const bottle = bottleById(design.bottle.variantId);
  const cap = capById(design.cap.variantId);
  const collar = collarById(design.collar.variantId);
  const pump = pumpById(design.pump.variantId);
  const logo = logoById(design.label.variantId);
  const box = boxById(design.box.variantId);
  const neck = NECKS[design.bottle.neck];
  const neckR = neckRadius(design.bottle.neck);
  const bottleH = design.bottle.heightMm;
  const bottleW = design.bottle.widthMm;
  const bottleD = design.bottle.depthMm;

  const ferrule = neck.ferrule;
  const stockFerrule = collar.tags.includes("crimp") && collar.tags.includes("standard");
  const collarInner = ferrule.innerMm / 2;
  const collarOuter = stockFerrule ? ferrule.outerMm / 2 : Math.max(ferrule.outerMm / 2, collarInner + collar.wallMm);
  const collarHeight = stockFerrule
    ? Math.min(ferrule.heightMaxMm, Math.max(ferrule.heightMinMm, collar.heightMm))
    : collar.heightMm;
  const collarBottom = bottleH - Math.min(collarHeight * 0.72, neck.crimpMm * 0.85);
  const collarTop = collarBottom + collarHeight;

  const capH = design.cap.heightMm;
  const capW = Math.max(design.cap.widthMm, (collarOuter + cap.overhangMm) * 2);
  const capD = Math.max(cap.depthMm * (capW / cap.widthMm), (collarOuter + cap.overhangMm) * 2);
  const capBottom = collarTop - 0.45;

  const fullActuator = pump.actuatorHeightMm;
  const actuatorH =
    exploded || !design.cap.visible ? fullActuator : Math.min(fullActuator, Math.max(7, capH - 3.2));
  const actuatorR = Math.max(neckR * pump.radiusFactor, neckR * 0.42);
  const nozzle =
    exploded || !design.cap.visible ? pump.nozzleMm : Math.min(pump.nozzleMm, Math.max(2.2, capW / 2 - actuatorR - 0.4));
  const pumpBase = collarTop - 0.3;

  const shoulderY = bottleH * (1 - bottle.shoulder) - 4;
  const fractions: Record<typeof logo.plate, [number, number]> = {
    plaque: [0.62, 0.42],
    tall: [0.4, 0.62],
    circle: [0.46, 0.46],
    diamond: [0.5, 0.56],
    band: [0.92, 0.18],
    arch: [0.58, 0.5],
    square: [0.48, 0.48],
    slim: [0.78, 0.16],
  };
  const squareMark = logo.mark === "diamond" || logo.mark === "seal" || logo.mark === "crest" || logo.plate === "diamond" || logo.plate === "circle" || logo.plate === "square";
  const [baseW, baseH] = squareMark ? [0.5, 0.56] : fractions[logo.plate];
  const labelY = Math.max(12, shoulderY * 0.46);
  const face = bottleRadii(labelY, bottleH, bottleW, bottleD, bottle.profile, bottle.shoulder, neckR);
  const desiredW = logo.widthMm ? Math.min(bottleW - 2, logo.widthMm) : bottleW * baseW * design.label.scale;
  const desiredH = logo.heightMm ?? shoulderY * baseH * design.label.scale;
  const extent = labelPatchExtent({
    height: bottleH,
    width: bottleW,
    depth: bottleD,
    section: bottle.section,
    softness: bottle.softness,
    faceted: bottle.faceted,
    neckR,
    profile: bottle.profile,
    shoulder: bottle.shoulder,
    yCenter: labelY,
    patchH: desiredH,
    patchW: desiredW,
  });
  const labelW = extent.width;
  const labelH = extent.height;
  const labelZ = face.rz + 0.45;

  const contentH = bottleH + Math.max(0, capBottom + capH - bottleH);
  const contentW = Math.max(bottleW, capW);
  const contentD = Math.max(bottleD, capD);
  const boxW = design.box.linked ? contentW + box.padMm * 2 : design.box.widthMm;
  const boxD = design.box.linked ? contentD + box.padMm * 2 : design.box.depthMm;
  const boxH = design.box.linked ? contentH + box.liftMm : design.box.heightMm;
  // Home camera is normalize(0.78, 0.22, 1). These axes are that view's
  // screen-right and floor-back, so the carton sits beside the glass and further away.
  const side = 140;
  const back = 340;
  const boxX = 0.789 * side - 0.615 * back;
  const boxZ = -0.615 * side - 0.789 * back;

  const anchors: Record<PartKey, [number, number, number]> = {
    bottle: [0, bottleH * 0.42, 0],
    liquid: [0, bottleH * 0.32, bottleD * 0.15],
    label: [0, labelY, labelZ],
    collar: [0, (collarBottom + collarTop) / 2, 0],
    pump: [0, pumpBase + actuatorH * 0.5, 0],
    cap: [0, capBottom + capH * 0.45, 0],
    box: [boxX, boxH * 0.45, boxZ],
  };

  // Each part clears the one it covers: gap plus the height of the part inside it.
  const sep = (height: number) => Math.max(18, height * 0.42);
  const collarLift = sep(collarHeight);
  const pumpLift = collarLift + sep(Math.max(12, fullActuator * 0.5));
  const capLift = pumpLift + fullActuator + sep(Math.min(capH, 40));
  const explode: Record<PartKey, [number, number, number]> = {
    box: [-18, 0, -28],
    cap: [0, capLift, 0],
    pump: [0, pumpLift, 0],
    collar: [0, collarLift, 0],
    label: [0, 0, Math.max(28, labelH * 0.85)],
    bottle: [0, 0, 0],
    liquid: [0, 0, 0],
  };

  return {
    neckR,
    bottleH,
    bottleW,
    bottleD,
    shoulder: bottle.shoulder,
    collarBottom,
    collarHeight,
    collarTop,
    collarInner,
    collarOuter,
    collarFlare: collar.flareMm,
    pumpBase,
    actuatorH,
    actuatorR,
    nozzle,
    capBottom,
    capH,
    capW,
    capD,
    labelW,
    labelH,
    labelY,
    labelZ,
    boxW,
    boxH,
    boxD,
    boxX,
    boxZ,
    anchors,
    explode,
  };
}
