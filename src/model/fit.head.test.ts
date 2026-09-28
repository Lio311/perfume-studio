import { afterEach, describe, expect, it } from "vitest";
import { collarById, pumpById } from "./catalog.ts";
import { applyVariant, createDefaultDesign } from "./design.ts";
import { computeFit, crimpHeadRadius } from "./fit.ts";
import type { Design } from "./types.ts";

function crimpDesign(): Design {
  const design = createDefaultDesign();
  applyVariant(design, "bottle", "orb-50");
  design.pump.variantId = "pump-crimp";
  design.collar.variantId = "col-crimp";
  design.cap.visible = false;
  return design;
}

describe("crimp button width", () => {
  const pump = pumpById("pump-crimp");
  const collar = collarById("col-crimp");
  const saved = {
    pumpWidth: pump.widthMm,
    pumpFactor: pump.radiusFactor,
    collarFactor: collar.radiusFactor,
  };

  afterEach(() => {
    pump.widthMm = saved.pumpWidth;
    pump.radiusFactor = saved.pumpFactor;
    collar.radiusFactor = saved.collarFactor;
  });

  it("uses the catalog width when the pump defines one", () => {
    pump.widthMm = 12.4;
    pump.radiusFactor = 0.55;
    collar.radiusFactor = 0.8;
    const fit = computeFit(crimpDesign(), true);
    expect(fit.headR).toBeCloseTo(6.2);
    expect(fit.headR).not.toBeCloseTo(fit.neckR * 0.9);
    expect(crimpHeadRadius(fit.neckR, fit.actuatorR, pump, collar)).toBeCloseTo(6.2);
  });

  it("uses a radius factor when the catalog has no width", () => {
    delete pump.widthMm;
    pump.radiusFactor = 0.55;
    collar.radiusFactor = 0.8;
    const fit = computeFit(crimpDesign(), true);
    expect(fit.headR).toBeCloseTo(fit.neckR * 0.55);
    expect(fit.headR).not.toBeCloseTo(fit.neckR * 0.9);
  });

  it("uses a collar radius factor when the pump defines neither", () => {
    delete pump.widthMm;
    delete pump.radiusFactor;
    collar.radiusFactor = 0.7;
    const fit = computeFit(crimpDesign(), true);
    expect(fit.headR).toBeCloseTo(fit.neckR * 0.7);
    expect(fit.headR).not.toBeCloseTo(fit.neckR * 0.9);
  });

  it("falls back to 0.9 of the neck when the catalog has no width or radius factor", () => {
    delete pump.widthMm;
    delete pump.radiusFactor;
    delete collar.radiusFactor;
    const fit = computeFit(crimpDesign(), true);
    expect(fit.headR).toBeCloseTo(Math.max(fit.actuatorR, fit.neckR * 0.9));
    expect(fit.headR).toBeCloseTo(fit.neckR * 0.9);
    expect(crimpHeadRadius(fit.neckR, fit.neckR * 1.1, {}, {})).toBeCloseTo(fit.neckR * 1.1);
  });
});
