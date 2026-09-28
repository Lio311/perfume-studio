import { describe, expect, it } from "vitest";
import { buildLabelPatch } from "../geometry/sweep.ts";
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

    expect(band.labelW).toBeCloseTo(43.9, 1);
    expect(band.labelH).toBeCloseTo(9.9, 1);
    expect(slim.labelW).toBeCloseTo(39.8, 1);
    expect(slim.labelH).toBeCloseTo(8.8, 1);
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
      expect(Math.abs(drawnW - fit.labelW), `${bottleId} width`).toBeLessThan(1);
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
});
