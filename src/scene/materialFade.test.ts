import { describe, expect, it } from "vitest";
import { clearGlassFade } from "../model/materials.ts";
import { GHOST_FADE, glassOpacityThisFrame, materialOpacityTarget } from "./materialFade.ts";

describe("glassOpacityThisFrame", () => {
  it("follows a later slider value on a reused material instead of the first baseOpacity", () => {
    const first = glassOpacityThisFrame(undefined, 0.32, false);
    expect(first.baseOpacity).toBeCloseTo(0.32);
    expect(first.target).toBeCloseTo(0.32);

    const moved = glassOpacityThisFrame(first.baseOpacity, 0.1, false);
    expect(moved.baseOpacity).toBeCloseTo(0.1);
    expect(moved.target).toBeCloseTo(0.1);

    const fromZero = glassOpacityThisFrame(0, 0.45, false);
    expect(fromZero.baseOpacity).toBeCloseTo(0.45);
    expect(fromZero.target).toBeCloseTo(0.45);
  });

  it("keeps clear-glass uFade on the slider instead of damping it back to 1", () => {
    const fade = clearGlassFade(0.5);
    expect(fade).toBeCloseTo(0.5 / 0.14);
    const frame = glassOpacityThisFrame(1, fade, false);
    expect(frame.target).toBeCloseTo(fade);
    expect(frame.target).not.toBeCloseTo(1);
    const ghosted = glassOpacityThisFrame(frame.baseOpacity, fade, true);
    expect(ghosted.baseOpacity).toBeCloseTo(fade);
    expect(ghosted.target).toBeCloseTo(fade * GHOST_FADE);
  });
});

describe("materialOpacityTarget", () => {
  it("respects a new clear-glass slider value instead of the first snapshot", () => {
    const clearDefaultFade = 0.14 / 0.14;
    let state = materialOpacityTarget({}, clearDefaultFade, clearDefaultFade, false);
    expect(state.target).toBeCloseTo(1);

    const slider = 0.62;
    const userFade = slider / 0.14;
    state = materialOpacityTarget(state, userFade, 1, false);
    expect(state.baseOpacity).toBeCloseTo(userFade);
    expect(state.target).toBeCloseTo(userFade);

    const held = materialOpacityTarget(state, userFade, userFade, false);
    expect(held.baseOpacity).toBeCloseTo(userFade);
    expect(held.target).toBeCloseTo(userFade);
  });

  it("composes the ghost fade with the current slider opacity", () => {
    const userFade = 0.8 / 0.14;
    const idle = materialOpacityTarget({}, userFade, userFade, false);
    const ghosted = materialOpacityTarget(idle, userFade, idle.target, true);
    expect(ghosted.baseOpacity).toBeCloseTo(userFade);
    expect(ghosted.target).toBeCloseTo(userFade * GHOST_FADE);
  });

  it("keeps the original absolute ghost fade for materials that are not slider-driven", () => {
    const snapped = materialOpacityTarget({}, undefined, 0.45, false);
    expect(snapped.target).toBeCloseTo(0.45);
    const animated = materialOpacityTarget(snapped, undefined, 0.2, false);
    expect(animated.baseOpacity).toBeCloseTo(0.45);
    expect(animated.target).toBeCloseTo(0.45);
    const ghosted = materialOpacityTarget(animated, undefined, 0.2, true);
    expect(ghosted.baseOpacity).toBeCloseTo(0.45);
    expect(ghosted.target).toBeCloseTo(GHOST_FADE);
  });

  it("drops a stale glass base when the material is no longer slider-driven", () => {
    const glass = materialOpacityTarget({}, 0.49, 0.49, false);
    const metal = materialOpacityTarget(glass, undefined, 1, false);
    expect(metal.baseOpacity).toBeCloseTo(1);
    expect(metal.target).toBeCloseTo(1);
    const held = materialOpacityTarget(metal, undefined, 1, true);
    expect(held.baseOpacity).toBeCloseTo(1);
    expect(held.target).toBeCloseTo(GHOST_FADE);
  });
});
