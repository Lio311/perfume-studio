import { describe, expect, it } from "vitest";
import { clearGlassFade } from "../model/materials.ts";
import { GHOST_FADE, glassOpacityThisFrame, materialOpacityTarget } from "./materialFade.ts";

describe("glassOpacityThisFrame", () => {
  it("follows a later slider value on a reused material instead of the first baseOpacity", () => {
    const first = glassOpacityThisFrame(0.32, false);
    expect(first.baseOpacity).toBeCloseTo(0.32);
    expect(first.target).toBeCloseTo(0.32);

    const moved = glassOpacityThisFrame(0.1, false);
    expect(moved.baseOpacity).toBeCloseTo(0.1);
    expect(moved.target).toBeCloseTo(0.1);

    const fromZero = glassOpacityThisFrame(0.45, false);
    expect(fromZero.baseOpacity).toBeCloseTo(0.45);
    expect(fromZero.target).toBeCloseTo(0.45);
  });

  it("keeps clear-glass uFade on the slider instead of damping it back to 1", () => {
    const fade = clearGlassFade(0.5);
    expect(fade).toBeCloseTo(0.5 / 0.14);
    const frame = glassOpacityThisFrame(fade, false);
    expect(frame.target).toBeCloseTo(fade);
    expect(frame.target).not.toBeCloseTo(1);
  });

  it("does not ghost a dim glass below the old absolute ghost opacity", () => {
    const tinted = glassOpacityThisFrame(0.42, true);
    expect(tinted.baseOpacity).toBeCloseTo(0.42);
    expect(tinted.target).toBeCloseTo(GHOST_FADE);
    expect(tinted.target).toBeGreaterThan(0.42 * GHOST_FADE);

    const strong = glassOpacityThisFrame(clearGlassFade(0.5), true);
    expect(strong.target).toBeCloseTo(Math.max(GHOST_FADE, clearGlassFade(0.5) * GHOST_FADE));
  });
});

describe("materialOpacityTarget", () => {
  it("keeps the original absolute ghost fade for materials that are not slider-driven", () => {
    const snapped = materialOpacityTarget({}, 0.45, false);
    expect(snapped.target).toBeCloseTo(0.45);
    const animated = materialOpacityTarget(snapped, 0.2, false);
    expect(animated.baseOpacity).toBeCloseTo(0.45);
    expect(animated.target).toBeCloseTo(0.45);
    const ghosted = materialOpacityTarget(animated, 0.2, true);
    expect(ghosted.baseOpacity).toBeCloseTo(0.45);
    expect(ghosted.target).toBeCloseTo(GHOST_FADE);
  });
});
