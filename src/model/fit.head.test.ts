import { afterEach, describe, expect, it } from "vitest";
import { syncRegistry, type SupplierPart } from "../import/registry.ts";
import { collarById, pumpById } from "./catalog.ts";
import { applyVariant, createDefaultDesign } from "./design.ts";
import { computeFit, crimpHeadRadius } from "./fit.ts";
import { PUMPS } from "./hardware.ts";
import { NECKS } from "./necks.ts";
import { MATTE_BLACK_COLOR, PALETTE, finishById } from "./materials.ts";
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

  it("sizes every stock crimp pump near 0.9 of the default neck, inside the ferrule", () => {
    const crimps = PUMPS.filter((pump) => pump.style === "crimp");
    expect(crimps.map((pump) => pump.id)).toEqual(["pump-crimp", "pump-crimp-short", "pump-crimp-tall"]);
    const neckR = NECKS.FEA15.diameterMm / 2;
    for (const pump of crimps) {
      const design = createDefaultDesign();
      design.pump.variantId = pump.id;
      design.cap.visible = false;
      const fit = computeFit(design, true);
      expect(fit.neckR, pump.id).toBe(neckR);
      expect(fit.headR, pump.id).toBeGreaterThanOrEqual(neckR * 0.85);
      expect(fit.headR, pump.id).toBeLessThanOrEqual(neckR * 0.95);
      expect(fit.headR, pump.id).toBeLessThanOrEqual(fit.collarOuter);
    }
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

function importedPump(id: string, widthMm: number): SupplierPart {
  return {
    id,
    kind: "pump",
    code: id,
    name: id,
    neck: "FEA15",
    widthMm,
    heightMm: 16,
    depthMm: 15,
    capacityMl: null,
    profile: "pump",
    color: "#c4a15a",
    thumb: "",
    page: 1,
  };
}

describe("imported crimp pumps", () => {
  afterEach(() => syncRegistry([]));

  it("falls back to 0.9 of the neck when the supplier gives no width", () => {
    syncRegistry([{ id: "supplier", name: "Supplier", createdAt: 1, parts: [importedPump("imp-plain", 0)] }]);
    const spec = pumpById("imp-plain");
    expect(spec.widthMm).toBeUndefined();
    expect(spec.radiusFactor).toBeUndefined();
    const design = crimpDesign();
    design.pump.variantId = "imp-plain";
    const fit = computeFit(design, true);
    expect(fit.headR).toBeCloseTo(fit.neckR * 0.9);
    expect(fit.headR).toBeGreaterThanOrEqual(fit.neckR * 0.85);
    expect(fit.headR).toBeLessThanOrEqual(fit.neckR * 0.95);
  });

  it("uses a supplier width ahead of the neck fallback", () => {
    syncRegistry([{ id: "supplier", name: "Supplier", createdAt: 1, parts: [importedPump("imp-wide", 12.4)] }]);
    const spec = pumpById("imp-wide");
    expect(spec.widthMm).toBe(12.4);
    expect(spec.radiusFactor).toBeUndefined();
    const design = crimpDesign();
    design.pump.variantId = "imp-wide";
    const fit = computeFit(design, true);
    expect(fit.headR).toBeCloseTo(6.2);
    expect(fit.headR).not.toBeCloseTo(fit.neckR * 0.9);
  });

  function fitForWidth(id: string, widthMm: number) {
    syncRegistry([{ id: "supplier", name: "Supplier", createdAt: 1, parts: [importedPump(id, widthMm)] }]);
    const design = crimpDesign();
    design.pump.variantId = id;
    return computeFit(design, true);
  }

  it("clamps a supplier head above the collar radius", () => {
    const collarOuter = computeFit(crimpDesign(), true).collarOuter;
    const widthMm = (collarOuter + 2) * 2;
    const fit = fitForWidth("imp-over", widthMm);
    expect(widthMm / 2).toBeGreaterThan(fit.collarOuter);
    expect(fit.headR).toBeCloseTo(fit.collarOuter);
    expect(fit.headR).toBeLessThan(widthMm / 2);
  });

  it("keeps a supplier head equal to the collar radius", () => {
    const collarOuter = computeFit(crimpDesign(), true).collarOuter;
    const widthMm = collarOuter * 2;
    const fit = fitForWidth("imp-equal", widthMm);
    expect(fit.headR).toBeCloseTo(fit.collarOuter);
    expect(fit.headR).toBeCloseTo(widthMm / 2);
  });

  it("keeps a supplier head below the collar radius", () => {
    const collarOuter = computeFit(crimpDesign(), true).collarOuter;
    const widthMm = (collarOuter - 1.2) * 2;
    const fit = fitForWidth("imp-under", widthMm);
    expect(widthMm / 2).toBeLessThan(fit.collarOuter);
    expect(fit.headR).toBeCloseTo(widthMm / 2);
  });
});

describe("stock pump heads", () => {
  it("leaves every stock pump head unchanged", () => {
    for (const spec of PUMPS) {
      const design = createDefaultDesign();
      design.pump.variantId = spec.id;
      design.cap.visible = false;
      const fit = computeFit(design, true);
      expect(spec.widthMm, spec.id).toBeUndefined();
      const factor = spec.radiusFactor ?? 0.42;
      const expected = spec.style === "crimp" ? fit.neckR * factor : Math.max(fit.neckR * factor, fit.neckR * 0.42);
      expect(fit.headR, spec.id).toBeCloseTo(expected);
    }
  });
});

describe("matte palette", () => {
  it("uses the matte-black default for the palette swatch", () => {
    expect(MATTE_BLACK_COLOR).toBe("#141414");
    expect(finishById("matteBlack").color).toBe("#141414");
    expect(PALETTE[1]).toBe(MATTE_BLACK_COLOR);
  });
});
