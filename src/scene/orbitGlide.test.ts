import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { clampPolarOffset, decayGlide, emptyGlide, GESTURE_SPEED, MAX_POLAR, MIN_POLAR, PAN_BUFFER_CAP, PAN_SPEED, PAN_STEP, PITCH_BUFFER_CAP, PITCH_STEP, polarAngle, poseBroken, pushGlide, ROTATE_SPEED, takeStep, TRACKPAD_PAN_GAIN, TRACKPAD_PITCH_GAIN, TRACKPAD_YAW_GAIN, YAW_BUFFER_CAP, YAW_STEP } from "./orbitGlide.ts";

describe("trackpad glide", () => {
  it("raises orbit and pan gains by about 18%", () => {
    expect(GESTURE_SPEED).toBeGreaterThanOrEqual(1.15);
    expect(GESTURE_SPEED).toBeLessThanOrEqual(1.2);
    expect(ROTATE_SPEED).toBeCloseTo(0.38 * GESTURE_SPEED, 8);
    expect(PAN_SPEED).toBeCloseTo(0.42 * GESTURE_SPEED, 8);
    expect(TRACKPAD_YAW_GAIN).toBeCloseTo(0.00028 * GESTURE_SPEED, 10);
    expect(TRACKPAD_PITCH_GAIN).toBeCloseTo(0.00018 * GESTURE_SPEED, 10);
    expect(TRACKPAD_PAN_GAIN).toBeCloseTo(0.06 * GESTURE_SPEED, 8);

    const orbit = emptyGlide();
    pushGlide(orbit, 20, -16, "orbit");
    expect(orbit.yaw).toBeCloseTo(20 * TRACKPAD_YAW_GAIN, 10);
    expect(orbit.pitch).toBeCloseTo(-16 * TRACKPAD_PITCH_GAIN, 10);
    expect(orbit.yaw).toBeGreaterThan(20 * 0.00028);
    expect(orbit.pitch).toBeLessThan(-16 * 0.00018);

    const pan = emptyGlide();
    pushGlide(pan, 12, 8, "pan");
    expect(pan.panX).toBeCloseTo(12 * TRACKPAD_PAN_GAIN, 8);
    expect(pan.panY).toBeCloseTo(8 * TRACKPAD_PAN_GAIN, 8);
    expect(pan.panX).toBeGreaterThan(12 * 0.06);

    const pinch = emptyGlide();
    pushGlide(pinch, 0, 20, "pinch");
    expect(pinch.zoom).toBeCloseTo(20 * 0.0004, 8);
  });

  it("scales the glide caps and frame steps so a wheel notch peaks 18% faster", () => {
    expect(YAW_BUFFER_CAP).toBeCloseTo(0.01888, 8);
    expect(PITCH_BUFFER_CAP).toBeCloseTo(0.0118, 8);
    expect(PAN_BUFFER_CAP).toBeCloseTo(7.08, 8);
    expect(YAW_STEP).toBeCloseTo(0.00944, 8);
    expect(PITCH_STEP).toBeCloseTo(0.0059, 8);
    expect(PAN_STEP).toBeCloseTo(1.298, 8);
    expect(YAW_BUFFER_CAP / 0.016).toBeCloseTo(GESTURE_SPEED, 8);
    expect(PITCH_BUFFER_CAP / 0.01).toBeCloseTo(GESTURE_SPEED, 8);
    expect(PAN_BUFFER_CAP / 6).toBeCloseTo(GESTURE_SPEED, 8);
    expect(YAW_STEP / 0.008).toBeCloseTo(GESTURE_SPEED, 8);
    expect(PITCH_STEP / 0.005).toBeCloseTo(GESTURE_SPEED, 8);
    expect(PAN_STEP / 1.1).toBeCloseTo(GESTURE_SPEED, 8);

    const orbit = emptyGlide();
    pushGlide(orbit, 100, -100, "orbit");
    expect(orbit.yaw).toBeCloseTo(YAW_BUFFER_CAP, 8);
    expect(orbit.pitch).toBeCloseTo(-PITCH_BUFFER_CAP, 8);
    const yaw = takeStep(orbit.yaw, YAW_STEP);
    const pitch = takeStep(orbit.pitch, PITCH_STEP);
    expect(yaw.step).toBeCloseTo(YAW_STEP, 8);
    expect(pitch.step).toBeCloseTo(-PITCH_STEP, 8);
    expect(takeStep(orbit.yaw, 0.008).step).toBeCloseTo(0.008, 8);
    expect((yaw.step * 60) / 0.48).toBeCloseTo(GESTURE_SPEED, 5);
    expect((Math.abs(pitch.step) * 60) / 0.3).toBeCloseTo(GESTURE_SPEED, 5);

    const pan = emptyGlide();
    pushGlide(pan, 100, 100, "pan");
    expect(pan.panX).toBeCloseTo(80 * TRACKPAD_PAN_GAIN, 8);
    expect(pan.panX).toBeLessThan(PAN_BUFFER_CAP);
    const panStep = takeStep(pan.panX, PAN_STEP);
    expect(panStep.step / 1.1).toBeCloseTo(GESTURE_SPEED, 5);

    const tail = emptyGlide();
    tail.yaw = YAW_BUFFER_CAP;
    tail.pitch = -PITCH_BUFFER_CAP;
    let frames = 0;
    while ((tail.yaw !== 0 || tail.pitch !== 0) && frames < 20) {
      tail.yaw = takeStep(tail.yaw, YAW_STEP).rest;
      tail.pitch = takeStep(tail.pitch, PITCH_STEP).rest;
      decayGlide(tail, 1 / 60);
      frames += 1;
    }
    expect(frames).toBeLessThanOrEqual(12);
    expect(tail.yaw).toBe(0);
    expect(tail.pitch).toBe(0);
  });

  it("caps a burst of wheel deltas", () => {
    const glide = emptyGlide();
    for (let i = 0; i < 80; i += 1) pushGlide(glide, 400, -240, "orbit");
    expect(glide.yaw).toBeCloseTo(YAW_BUFFER_CAP, 8);
    expect(glide.pitch).toBeCloseTo(-PITCH_BUFFER_CAP, 8);
    expect(Number.isFinite(glide.yaw)).toBe(true);
    expect(Number.isFinite(glide.pitch)).toBe(true);
    const pan = emptyGlide();
    for (let i = 0; i < 80; i += 1) pushGlide(pan, 400, -240, "pan");
    expect(pan.panX).toBeCloseTo(PAN_BUFFER_CAP, 8);
    expect(pan.panY).toBeCloseTo(-PAN_BUFFER_CAP, 8);
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

  it("refuses a top-down or flipped orbit", () => {
    const down = clampPolarOffset(new THREE.Vector3(0, 200, 0), 200);
    const polar = polarAngle(down, new THREE.Vector3(0, 0, 0));
    expect(polar).toBeGreaterThanOrEqual(MIN_POLAR - 1e-4);
    expect(polar).toBeLessThanOrEqual(MAX_POLAR + 1e-4);
    expect(down.y).toBeLessThan(200);
    const under = clampPolarOffset(new THREE.Vector3(0, -80, 10), 80);
    expect(polarAngle(under, new THREE.Vector3(0, 0, 0))).toBeLessThanOrEqual(MAX_POLAR + 1e-4);
    expect(under.y).toBeGreaterThan(0);
  });

  it("flags a broken camera", () => {
    const target = new THREE.Vector3(0, 40, 0);
    const up = new THREE.Vector3(0, 1, 0);
    expect(poseBroken(new THREE.Vector3(Number.NaN, 10, 10), target, up)).toBe(true);
    expect(poseBroken(new THREE.Vector3(80, -40, 200), target, up)).toBe(true);
    expect(poseBroken(new THREE.Vector3(80, 40, 200), target, up)).toBe(false);
  });
});
