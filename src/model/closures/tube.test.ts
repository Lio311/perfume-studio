import { describe, expect, it } from "vitest";
import { bottleById } from "../catalog.ts";
import { createDefaultDesign } from "../design.ts";
import { computeFit } from "../fit.ts";
import spec, { tubeBaseHeight, tubeOpenSleeveBottom, tubeSleeveHeight } from "./tube.ts";
import { closureDims } from "./types.ts";

describe("open tube", () => {
  it("keeps a short base and lifts the sleeve clear of the bottle", () => {
    const design = createDefaultDesign();
    const fit = computeFit(design, false);
    const dims = closureDims({ w: fit.boxW, h: fit.boxH, d: fit.boxD, boardMm: fit.boardMm }, spec);
    const base = tubeBaseHeight(dims);
    const bottleH = bottleById(design.bottle.variantId).heightMm;
    const openBottom = tubeOpenSleeveBottom(dims);
    expect(base).toBeGreaterThan(dims.wall);
    expect(base).toBeLessThan(dims.h * 0.3);
    expect(tubeSleeveHeight(dims)).toBeGreaterThan(dims.h * 0.6);
    const glassTop = fit.seatY + bottleH;
    const capTop = fit.seatY + fit.capBottom + fit.capH;
    expect(openBottom).toBeGreaterThan(capTop);
    const visible = Math.min(openBottom, glassTop) - Math.max(base, fit.seatY);
    expect(visible / bottleH).toBeGreaterThan(0.6);
  });
});
