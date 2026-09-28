import { describe, expect, it } from "vitest";
import { BOTTLES } from "./bottles.ts";
import { applyVariant, createDefaultDesign } from "./design.ts";
import { computeFit } from "./fit.ts";
import { COLLARS } from "./hardware.ts";
import { neckRadius } from "./necks.ts";
import { bottleRadii, straightNeckMm } from "./sample.ts";

function neckStart(height: number, neckR: number): number {
  return height - straightNeckMm(neckR);
}

describe("collar seat", () => {
  it("keeps every catalog collar on or above the straight neck", () => {
    expect(BOTTLES.length).toBeGreaterThan(0);
    expect(COLLARS.length).toBeGreaterThan(0);
    for (const bottle of BOTTLES) {
      for (const collar of COLLARS) {
        const design = createDefaultDesign();
        applyVariant(design, "bottle", bottle.id);
        applyVariant(design, "collar", collar.id);
        const fit = computeFit(design);
        const start = neckStart(design.bottle.heightMm, neckRadius(design.bottle.neck));
        const lip = bottleRadii(
          start,
          design.bottle.heightMm,
          design.bottle.widthMm,
          design.bottle.depthMm,
          bottle.profile,
          bottle.shoulder,
          fit.neckR,
        );
        expect(lip.rx, bottle.id).toBeCloseTo(fit.neckR, 6);
        expect(fit.collarBottom, `${bottle.id} + ${collar.id}`).toBeGreaterThanOrEqual(start - 1e-6);
      }
    }
  });

  it("seats a 9 mm collar on an FEA20 finish instead of the shoulder", () => {
    const design = createDefaultDesign();
    applyVariant(design, "bottle", "barrel-100");
    applyVariant(design, "collar", "col-thick");
    expect(design.bottle.neck).toBe("FEA20");
    expect(COLLARS.find((collar) => collar.id === "col-thick")?.heightMm).toBe(9);
    const fit = computeFit(design);
    const start = neckStart(design.bottle.heightMm, neckRadius("FEA20"));
    expect(fit.collarHeight).toBe(9);
    expect(fit.collarBottom).toBeCloseTo(start, 6);
    expect(fit.collarBottom + fit.collarHeight).toBeGreaterThan(design.bottle.heightMm);
  });
});
