import { describe, expect, it } from "vitest";
import { glassOpacityThisFrame } from "../scene/materialFade.ts";
import { createDefaultDesign } from "./design.ts";
import {
  bottleGlassSetting,
  clearGlassFade,
  glassDrawTransmission,
  mappedGlassOpacity,
  renderedGlassOpacity,
  usesFlatGlassAlpha,
} from "./materials.ts";

describe("renderedGlassOpacity", () => {
  it("maps every frosted and tinted slider value, including 0, 50, and 100", () => {
    for (const finish of ["frosted", "tinted"] as const) {
      for (const opacity of [0, 0.5, 1] as const) {
        expect(usesFlatGlassAlpha(finish, opacity)).toBe(true);
        expect(renderedGlassOpacity(finish, opacity)).toBeCloseTo(mappedGlassOpacity(opacity));
        expect(glassDrawTransmission(finish, opacity)).toBe(0);
      }
      expect(renderedGlassOpacity(finish, 0)).toBeCloseTo(0.15);
      expect(renderedGlassOpacity(finish, 0.5)).toBeCloseTo(0.575);
      expect(renderedGlassOpacity(finish, 1)).toBeCloseTo(1);
      expect(renderedGlassOpacity(finish, 0)).toBeLessThan(renderedGlassOpacity(finish, 0.5) ?? 0);
      expect(renderedGlassOpacity(finish, 0.5)).toBeLessThan(renderedGlassOpacity(finish, 1) ?? 0);
    }
    expect(usesFlatGlassAlpha("tinted", undefined)).toBe(true);
    expect(renderedGlassOpacity("tinted")).toBeCloseTo(mappedGlassOpacity(0.32));
    expect(renderedGlassOpacity("frosted")).toBeCloseTo(mappedGlassOpacity(0.45));
    expect(glassDrawTransmission("tinted")).toBe(0);
    expect(glassDrawTransmission("frosted")).toBe(0);

    expect(usesFlatGlassAlpha("clear", 0.01)).toBe(false);
    expect(usesFlatGlassAlpha("clear", undefined)).toBe(false);
    expect(renderedGlassOpacity("clear", 0)).toBeCloseTo(0);
    expect(renderedGlassOpacity("clear", 0.5)).toBeCloseTo(0.5);
    expect(renderedGlassOpacity("clear", 1)).toBeCloseTo(1);
    expect(renderedGlassOpacity("clear")).toBeCloseTo(0.14);
    expect(renderedGlassOpacity("gold", 0.4)).toBeNull();
    expect(glassDrawTransmission("clear")).toBeGreaterThan(0);
  });

  it("shows the default Cara 50 on the first mount with a non-zero clear fade", () => {
    const design = createDefaultDesign();
    expect(design.bottle.variantId).toBe("cara-50");
    expect(design.bottle.finish).toBe("clear");
    expect(design.bottle.opacity).toBeUndefined();
    expect(design.bottle.visible).toBe(true);

    const setting = bottleGlassSetting(design.bottle.finish, design.bottle.opacity);
    expect(setting.fade).toBeCloseTo(1);
    expect(setting.fade).toBeGreaterThan(0);
    expect(clearGlassFade(design.bottle.opacity)).toBeCloseTo(1);
    expect(usesFlatGlassAlpha(design.bottle.finish, design.bottle.opacity)).toBe(false);

    // A material that still holds uFade 0 from before the first write must
    // take the design fade, not stay invisible.
    const first = glassOpacityThisFrame(0, setting.fade ?? 0, false);
    expect(first.baseOpacity).toBeCloseTo(1);
    expect(first.target).toBeCloseTo(1);
  });
});
