import { afterEach, describe, expect, it } from "vitest";
import { buildLabelPatch } from "../geometry/sweep.ts";
import { syncRegistry, type SupplierPart } from "../import/registry.ts";
import { bottleById } from "./catalog.ts";
import { applyVariant, createDefaultDesign } from "./design.ts";
import { computeFit } from "./fit.ts";
import { neckRadius } from "./necks.ts";
import { bottleRadii } from "./sample.ts";

function withPlate(bottleId: string, labelId: string) {
  const design = createDefaultDesign();
  applyVariant(design, "bottle", bottleId);
  applyVariant(design, "label", labelId);
  return design;
}

describe("label plate fit", () => {
  it("keeps each plate's own proportions on Cara 50", () => {
    const band = computeFit(withPlate("cara-50", "lg-band-word"));
    const slim = computeFit(withPlate("cara-50", "lg-foil-horizon"));
    const plaque = computeFit(withPlate("cara-50", "lg-foil-word"));
    const tall = computeFit(withPlate("cara-50", "lg-engrave-word"));

    const cara = bottleById("cara-50");
    const shoulderY = cara.heightMm * (1 - cara.shoulder) - 4;
    const bandFace = bottleRadii(band.labelY, cara.heightMm, cara.widthMm, cara.depthMm, cara.profile, cara.shoulder, neckRadius(cara.neck), cara.finishMm);
    const slimFace = bottleRadii(slim.labelY, cara.heightMm, cara.widthMm, cara.depthMm, cara.profile, cara.shoulder, neckRadius(cara.neck), cara.finishMm);
    const bandW = Math.min(cara.widthMm * 0.92, cara.widthMm - 6, bandFace.rx * 1.72);
    const slimW = Math.min(cara.widthMm * 0.78, cara.widthMm - 6, slimFace.rx * 1.72);
    expect(Math.abs(band.labelW - bandW)).toBeLessThan(1.5);
    expect(Math.abs(band.labelH - shoulderY * 0.18)).toBeLessThan(1.5);
    expect(Math.abs(slim.labelW - slimW)).toBeLessThan(1.5);
    expect(Math.abs(slim.labelH - shoulderY * 0.16)).toBeLessThan(1.5);
    expect(band.labelH).toBeLessThan(plaque.labelH * 0.45);
    expect(slim.labelH).toBeLessThan(band.labelH);
    expect(tall.labelH).toBeGreaterThan(plaque.labelH);
    expect(slim.labelW).toBeLessThan(band.labelW);
  });

  it("clamps plate width at 1.72 face radii and matches the drawn patch", () => {
    for (const [bottleId, labelId] of [
      ["cara-50", "lg-band-word"],
      ["cara-50", "lg-foil-diamond"],
      ["orb-50", "lg-foil-word"],
      ["flask-50", "lg-foil-word"],
      ["cone-50", "lg-band-word"],
      ["bell-50", "lg-foil-word"],
      ["step-100", "lg-engrave-chevron"],
    ] as const) {
      const design = withPlate(bottleId, labelId);
      const fit = computeFit(design);
      const bottle = bottleById(bottleId);
      const patch = buildLabelPatch({
        height: bottle.heightMm,
        width: bottle.widthMm,
        depth: bottle.depthMm,
        section: bottle.section,
        softness: bottle.softness,
        faceted: bottle.faceted,
        neckR: fit.neckR,
        profile: bottle.profile,
        shoulder: bottle.shoulder,
        finishMm: bottle.finishMm,
        yCenter: fit.labelY,
        patchH: fit.labelH,
        patchW: fit.labelW,
      });
      patch.computeBoundingBox();
      const bounds = patch.boundingBox;
      expect(bounds, bottleId).toBeTruthy();
      if (!bounds) continue;
      const drawnW = bounds.max.x - bounds.min.x;
      const drawnH = bounds.max.y - bounds.min.y;
      expect(Math.abs(drawnW - fit.labelW), `${bottleId} width`).toBeLessThan(1.25);
      expect(Math.abs(drawnH - fit.labelH), `${bottleId} height`).toBeLessThan(1);
    }
  });

  it("clamps a wide Cara plate at 1.72 face radii", () => {
    const design = withPlate("cara-50", "lg-band-word");
    design.label.scale = 1.6;
    const fit = computeFit(design);
    const bottle = bottleById("cara-50");
    const mid = bottleRadii(
      fit.labelY,
      bottle.heightMm,
      bottle.widthMm,
      bottle.depthMm,
      bottle.profile,
      bottle.shoulder,
      neckRadius(bottle.neck),
      bottle.finishMm,
    );
    expect(fit.labelW).toBeLessThanOrEqual(mid.rx * 1.72 + 0.05);
    expect(fit.labelW).toBeGreaterThan(mid.rx * 1.6);
  });

  it("keeps an oversized plaque inside the shoulder and the bottle width", () => {
    const design = withPlate("cara-50", "lg-foil-word");
    design.label.scale = 1.6;
    const bottle = bottleById("cara-50");
    const shoulderY = design.bottle.heightMm * (1 - bottle.shoulder) - 4;
    const fit = computeFit(design);
    const mid = bottleRadii(
      fit.labelY,
      bottle.heightMm,
      bottle.widthMm,
      bottle.depthMm,
      bottle.profile,
      bottle.shoulder,
      neckRadius(bottle.neck),
      bottle.finishMm,
    );
    expect(fit.labelW).toBeLessThanOrEqual(design.bottle.widthMm - 6 + 0.05);
    expect(fit.labelW).toBeLessThanOrEqual(mid.rx * 1.72 + 0.05);
    expect(fit.labelH).toBeLessThanOrEqual(shoulderY * 0.72 + 0.05);
    expect(fit.labelY + fit.labelH / 2).toBeLessThanOrEqual(shoulderY + 0.05);

    const part: SupplierPart = {
      id: "imp-plaque",
      kind: "label",
      code: "imp-plaque",
      name: "Oversized plaque",
      neck: null,
      widthMm: 160,
      heightMm: 160,
      depthMm: 0,
      capacityMl: null,
      profile: "label",
      color: "#141414",
      thumb: "",
      page: 1,
    };
    syncRegistry([{ id: "supplier", name: "Supplier", createdAt: 1, parts: [part] }]);
    const imported = withPlate("cara-50", "imp-plaque");
    const importedFit = computeFit(imported);
    const importedShoulder = imported.bottle.heightMm * (1 - bottle.shoulder) - 4;
    expect(importedFit.labelW).toBeLessThanOrEqual(imported.bottle.widthMm - 6 + 0.05);
    expect(importedFit.labelH).toBeLessThanOrEqual(importedShoulder * 0.72 + 0.05);
    expect(importedFit.labelH).toBeGreaterThan(importedShoulder * 0.6);
    expect(importedFit.labelY + importedFit.labelH / 2).toBeLessThanOrEqual(importedShoulder + 0.05);
  });
});

afterEach(() => {
  syncRegistry([]);
});
