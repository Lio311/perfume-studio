import { describe, expect, it } from "vitest";
import { createDefaultDesign } from "./design.ts";
import {
  clearGlassFade,
  glassDrawTransmission,
  mappedGlassOpacity,
  renderedGlassOpacity,
  usesFlatGlassAlpha,
} from "./materials.ts";

describe("renderedGlassOpacity", () => {
  it("uses the flat-alpha curve only when opacity is below the finish default", () => {
    expect(mappedGlassOpacity(0)).toBeCloseTo(0.15);
    expect(mappedGlassOpacity(0.1)).toBeCloseTo(0.235);
    expect(mappedGlassOpacity(1)).toBeCloseTo(1);
    expect(usesFlatGlassAlpha("tinted", undefined)).toBe(false);
    expect(usesFlatGlassAlpha("tinted", 0.32)).toBe(false);
    expect(usesFlatGlassAlpha("tinted", 0.4)).toBe(false);
    expect(usesFlatGlassAlpha("tinted", 0.31)).toBe(true);
    expect(usesFlatGlassAlpha("frosted", 0.45)).toBe(false);
    expect(usesFlatGlassAlpha("frosted", 0)).toBe(true);
    expect(usesFlatGlassAlpha("clear", 0.01)).toBe(false);

    expect(renderedGlassOpacity("tinted", 0.1)).toBeCloseTo(mappedGlassOpacity(0.1));
    expect(renderedGlassOpacity("frosted", 0)).toBeCloseTo(mappedGlassOpacity(0));
    expect(renderedGlassOpacity("tinted", 0.32)).toBeCloseTo(0.32);
    expect(renderedGlassOpacity("tinted", 0.4)).toBeCloseTo(0.4);
    expect(renderedGlassOpacity("tinted")).toBeCloseTo(0.32);
    expect(renderedGlassOpacity("frosted")).toBeCloseTo(0.45);
    expect(renderedGlassOpacity("clear", 0.4)).toBeCloseTo(0.4);
    expect(renderedGlassOpacity("clear")).toBeCloseTo(0.14);
    expect(renderedGlassOpacity("gold", 0.4)).toBeNull();
  });

  it("keeps refraction unless the slider drops below the default", () => {
    expect(glassDrawTransmission("tinted")).toBeCloseTo(0.55);
    expect(glassDrawTransmission("tinted", 0.32)).toBeCloseTo(0.55);
    expect(glassDrawTransmission("tinted", 0.4)).toBeCloseTo(0.55);
    expect(glassDrawTransmission("tinted", 0.1)).toBe(0);
    expect(glassDrawTransmission("frosted", 0.45)).toBeCloseTo(0.35);
    expect(glassDrawTransmission("frosted", 0.2)).toBe(0);
  });

  it("renders a fresh Cara 50 with non-zero glass opacity", () => {
    const design = createDefaultDesign();
    expect(design.bottle.variantId).toBe("cara-50");
    expect(design.bottle.finish).toBe("clear");
    expect(design.bottle.opacity).toBeUndefined();
    const alpha = renderedGlassOpacity(design.bottle.finish, design.bottle.opacity);
    expect(alpha).toBeGreaterThan(0);
    expect(clearGlassFade(design.bottle.opacity)).toBeCloseTo(1);
    expect(usesFlatGlassAlpha(design.bottle.finish, design.bottle.opacity)).toBe(false);
    // The mesh stays off until a bottle is chosen. That is not an opacity of 0.
    expect(design.bottle.visible).toBe(false);
  });
});