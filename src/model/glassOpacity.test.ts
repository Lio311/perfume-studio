import { describe, expect, it } from "vitest";
import {
  clearGlassFade,
  DEFAULT_GLASS_OPACITY,
  effectiveGlassDraw,
  glassDrawTransmission,
  mappedGlassOpacity,
  renderedGlassOpacity,
  tintedGlassColor,
  usesFlatGlassAlpha,
} from "./materials.ts";

describe("renderedGlassOpacity", () => {
  it("maps every frosted and tinted slider value, including 0, 50, and 100", () => {
    for (const finish of ["frosted", "tinted"] as const) {
      for (const opacity of [0, 0.5, 1] as const) {
        expect(usesFlatGlassAlpha(finish)).toBe(true);
        expect(renderedGlassOpacity(finish, opacity)).toBeCloseTo(mappedGlassOpacity(opacity));
        const s0 = DEFAULT_GLASS_OPACITY[finish];
        const base = glassDrawTransmission(finish);
        const expected = Math.min(1, Math.max(0, (base * (1 - opacity)) / (1 - s0)));
        expect(glassDrawTransmission(finish, opacity)).toBeCloseTo(expected);
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
      envMapIntensity: 1.7,
      transparent: true,
      depthWrite: false,
    });
    expect(effectiveGlassDraw("tinted")).toEqual({
      opacity: 0.32,
      transmission: 0.55,
      roughness: 0.05,
      thickness: 4.2,
      clearcoat: 1,
      attenuationDistance: 36,
      envMapIntensity: 1.7,
      transparent: true,
      depthWrite: false,
    });
    expect(effectiveGlassDraw("frosted", 0)).toMatchObject({ opacity: 0.15, depthWrite: false });
    expect(effectiveGlassDraw("tinted", 0)).toMatchObject({ opacity: 0.15, depthWrite: false });
    expect(effectiveGlassDraw("frosted", 0)!.transmission).toBeGreaterThan(0.35);
    expect(effectiveGlassDraw("tinted", 0)!.transmission).toBeGreaterThan(0.55);
    expect(effectiveGlassDraw("frosted", 0)!.transmission).toBeLessThanOrEqual(1);
    expect(effectiveGlassDraw("tinted", 0)!.transmission).toBeLessThanOrEqual(1);
    expect(effectiveGlassDraw("frosted", 1)).toMatchObject({
      opacity: 1,
      transmission: 0,
      transparent: true,
      depthWrite: false,
      envMapIntensity: 1.7,
    });
    expect(effectiveGlassDraw("tinted", 1)).toMatchObject({
      opacity: 1,
      transmission: 0,
      transparent: true,
      depthWrite: false,
    });
    expect(effectiveGlassDraw("tinted", 1)!.envMapIntensity).toBeLessThan(1.7);
    expect(effectiveGlassDraw("clear")).toBeNull();
  });

  it("draws the same glass when the slider is untouched or parked on the default", () => {
    for (const finish of ["frosted", "tinted"] as const) {
      const untouched = effectiveGlassDraw(finish);
      const parked = effectiveGlassDraw(finish, DEFAULT_GLASS_OPACITY[finish]);
      expect(untouched).not.toBeNull();
      expect(parked).not.toBeNull();
      expect(Math.abs(parked!.opacity - untouched!.opacity)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(parked!.transmission - untouched!.transmission)).toBeLessThanOrEqual(0.01);
      expect(parked!.depthWrite).toBe(false);
      expect(untouched!.depthWrite).toBe(false);
      expect(parked!.transmission).toBeCloseTo(glassDrawTransmission(finish), 5);
    }
  });

  it("approaches opaque along the slider without a mode switch", () => {
    for (const finish of ["frosted", "tinted"] as const) {
      const samples = [0, 0.35, 0.7, 0.8, 0.95, 0.99, 1] as const;
      let previous = -1;
      for (const slider of samples) {
        const draw = effectiveGlassDraw(finish, slider);
        expect(draw).not.toBeNull();
        expect(draw!.transparent).toBe(true);
        expect(draw!.depthWrite).toBe(false);
        expect(draw!.opacity).toBeGreaterThan(previous);
        previous = draw!.opacity;
      }
      const near = effectiveGlassDraw(finish, 0.99)!;
      const full = effectiveGlassDraw(finish, 1)!;
      expect(full.opacity - near.opacity).toBeCloseTo(0.85 * 0.01, 5);
      expect(full.transparent).toBe(near.transparent);
      expect(full.depthWrite).toBe(near.depthWrite);
    }
    expect(effectiveGlassDraw("tinted", 0.8)!.opacity).toBeLessThan(0.9);
  });

  it("darkens tinted glass toward opaque without shifting its hue", () => {
    const source = "#6e857c";
    expect(tintedGlassColor(source)).toBe(source);
    expect(tintedGlassColor(source, 0.2)).toBe(source);
    expect(tintedGlassColor(source, 0)).toBe(source);
    const mid = tintedGlassColor(source, 0.7);
    const end = tintedGlassColor(source, 1);
    const parse = (hex: string) => {
      const value = Number.parseInt(hex.slice(1), 16);
      return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    };
    const [sr, sg, sb] = parse(source);
    const [mr, mg, mb] = parse(mid);
    const [er, eg, eb] = parse(end);
    expect(eg).toBeGreaterThan(eb);
    expect(eb).toBeGreaterThan(er);
    expect(mg).toBeGreaterThan(mb);
    expect(mb).toBeGreaterThan(mr);
    expect(er).toBeLessThan(mr);
    expect(mr).toBeLessThan(sr);
    expect(eg).toBeLessThan(mg);
    expect(mg).toBeLessThan(sg);
    expect(eb).toBeLessThan(mb);
    expect(mb).toBeLessThan(sb);
    expect(er / sr).toBeCloseTo(eg / sg, 1);
    expect(eg / sg).toBeCloseTo(eb / sb, 1);
  });
});
