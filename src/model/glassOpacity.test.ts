import { describe, expect, it } from "vitest";
import {
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
    expect(clearGlassFade(undefined)).toBeCloseTo(1);
  });
});
