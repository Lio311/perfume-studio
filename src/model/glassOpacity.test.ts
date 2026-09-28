import { describe, expect, it } from "vitest";
import {
  clearGlassFade,
  DEFAULT_GLASS_OPACITY,
  effectiveGlassDraw,
  glassDrawTransmission,
  mappedGlassOpacity,
  renderedGlassOpacity,
  usesFlatGlassAlpha,
} from "./materials.ts";

describe("renderedGlassOpacity", () => {
  it("maps every frosted and tinted slider value, including 0, 50, and 100", () => {
    for (const finish of ["frosted", "tinted"] as const) {
      for (const opacity of [0, 0.5, 1] as const) {
        expect(usesFlatGlassAlpha(finish)).toBe(true);
        expect(renderedGlassOpacity(finish, opacity)).toBeCloseTo(mappedGlassOpacity(opacity));
        expect(glassDrawTransmission(finish, opacity)).toBe(0);
      }
      expect(renderedGlassOpacity(finish, 0)).toBeCloseTo(0.15);
      expect(renderedGlassOpacity(finish, 0.5)).toBeCloseTo(0.575);
      expect(renderedGlassOpacity(finish, 1)).toBeCloseTo(1);
      expect(renderedGlassOpacity(finish, 0)).toBeLessThan(renderedGlassOpacity(finish, 0.5) ?? 0);
      expect(renderedGlassOpacity(finish, 0.5)).toBeLessThan(renderedGlassOpacity(finish, 1) ?? 0);
    }
    expect(usesFlatGlassAlpha("tinted")).toBe(true);
    expect(renderedGlassOpacity("tinted")).toBeCloseTo(mappedGlassOpacity(DEFAULT_GLASS_OPACITY.tinted));
    expect(renderedGlassOpacity("frosted")).toBeCloseTo(mappedGlassOpacity(DEFAULT_GLASS_OPACITY.frosted));
    expect(glassDrawTransmission("tinted")).toBeCloseTo(0.55);
    expect(glassDrawTransmission("frosted")).toBeCloseTo(0.35);

    expect(usesFlatGlassAlpha("clear")).toBe(false);
    expect(renderedGlassOpacity("clear", 0)).toBeCloseTo(0);
    expect(renderedGlassOpacity("clear", 0.5)).toBeCloseTo(0.5);
    expect(renderedGlassOpacity("clear", 1)).toBeCloseTo(1);
    expect(renderedGlassOpacity("clear")).toBeCloseTo(0.14);
    expect(renderedGlassOpacity("gold", 0.4)).toBeNull();
    expect(glassDrawTransmission("clear")).toBeGreaterThan(0);
    expect(clearGlassFade(undefined)).toBeCloseTo(1);
  });

  it("keeps the untouched frosted and tinted defaults near the previous rendered opacity", () => {
    expect(DEFAULT_GLASS_OPACITY.frosted).toBeCloseTo(0.35);
    expect(DEFAULT_GLASS_OPACITY.tinted).toBeCloseTo(0.2);
    expect(renderedGlassOpacity("frosted")).toBeCloseTo(mappedGlassOpacity(0.35));
    expect(renderedGlassOpacity("tinted")).toBeCloseTo(mappedGlassOpacity(0.2));
    expect(renderedGlassOpacity("frosted")).toBeCloseTo(0.45, 2);
    expect(renderedGlassOpacity("tinted")).toBeCloseTo(0.32);
  });

  it("pins the untouched frosted and tinted draw to the refractive default", () => {
    expect(effectiveGlassDraw("frosted")).toEqual({
      opacity: 0.4475,
      transmission: 0.35,
      roughness: 0.34,
      thickness: 2.8,
      clearcoat: 0.04,
      attenuationDistance: 36,
      depthWrite: false,
    });
    expect(effectiveGlassDraw("tinted")).toEqual({
      opacity: 0.32,
      transmission: 0.55,
      roughness: 0.05,
      thickness: 4.2,
      clearcoat: 1,
      attenuationDistance: 36,
      depthWrite: false,
    });
    expect(effectiveGlassDraw("frosted", 0)).toMatchObject({ opacity: 0.15, transmission: 0, depthWrite: false });
    expect(effectiveGlassDraw("tinted", 0)).toMatchObject({ opacity: 0.15, transmission: 0, depthWrite: false });
    expect(effectiveGlassDraw("frosted", 1)).toMatchObject({ opacity: 1, transmission: 0 });
    expect(effectiveGlassDraw("tinted", 1)).toMatchObject({ opacity: 1, transmission: 0 });
    expect(effectiveGlassDraw("clear")).toBeNull();
  });
});
