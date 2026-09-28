import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { decayGlide, emptyGlide, poseBroken, pushGlide, takeStep } from "./orbitGlide.ts";

describe("trackpad glide", () => {
  it("caps a burst of wheel deltas", () => {
    const glide = emptyGlide();
    for (let i = 0; i < 80; i += 1) pushGlide(glide, 400, -240, "orbit");
    expect(glide.yaw).toBeLessThanOrEqual(0.016);
    expect(glide.yaw).toBeGreaterThan(0);
    expect(glide.pitch).toBeGreaterThanOrEqual(-0.01);
    expect(Number.isFinite(glide.yaw)).toBe(true);
    expect(Number.isFinite(glide.pitch)).toBe(true);
  });

  it("applies only a small step per frame", () => {
    const { step, rest } = takeStep(0.016, 0.008);
    expect(step).toBeCloseTo(0.008);
    expect(rest).toBeCloseTo(0.008);
    expect(takeStep(Number.NaN, 0.008)).toEqual({ step: 0, rest: 0 });
  });

  it("kills the tail quickly", () => {
    const glide = emptyGlide();
    glide.yaw = 0.008;
    for (let i = 0; i < 12; i += 1) decayGlide(glide, 1 / 60);
    expect(Math.abs(glide.yaw)).toBeLessThan(0.001);
  });

  it("flags a broken camera", () => {
    const target = new THREE.Vector3(0, 40, 0);
    const up = new THREE.Vector3(0, 1, 0);
    expect(poseBroken(new THREE.Vector3(Number.NaN, 10, 10), target, up)).toBe(true);
    expect(poseBroken(new THREE.Vector3(80, -40, 200), target, up)).toBe(true);
    expect(poseBroken(new THREE.Vector3(80, 40, 200), target, up)).toBe(false);
  });
});
