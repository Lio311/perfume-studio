import { describe, expect, it } from "vitest";
import { createDistanceGuide, DISTANCE_GUIDE_PARAMS } from "./guide.ts";

function gaussian(seed: number) {
  let state = seed >>> 0;
  const unit = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  return () => {
    const u1 = Math.max(unit(), 1e-12);
    const u2 = unit();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
}

describe("stable distance guide", () => {
  it("documents a 700 ms hold and a dwell before the band can change", () => {
    expect(DISTANCE_GUIDE_PARAMS.holdMs).toBe(700);
    expect(DISTANCE_GUIDE_PARAMS.dwellMs).toBeGreaterThan(0);
    expect(DISTANCE_GUIDE_PARAMS.okExitMm).toBeGreaterThan(DISTANCE_GUIDE_PARAMS.okEnterMm);
  });

  it("does not flicker on a noisy sequence that a raw threshold would", () => {
    const noise = gaussian(11);
    const stable = createDistanceGuide();
    const jumpy = createDistanceGuide({
      oneEuro: { minCutoff: 1e6, beta: 0, dCutoff: 1 },
      okEnterMm: 15,
      okExitMm: 15,
      dwellMs: 0,
      uiIntervalMs: 0,
    });
    let stableChanges = 0;
    let jumpyChanges = 0;
    let prevStable = "";
    let prevJumpy = "";
    for (let frame = 0; frame < 90; frame += 1) {
      const sample = { timeMs: frame * 33, distanceMm: 220 + noise() * 8 };
      const a = stable.push(sample);
      const b = jumpy.push(sample);
      if (prevStable && a.band !== prevStable) stableChanges += 1;
      if (prevJumpy && b.band !== prevJumpy) jumpyChanges += 1;
      prevStable = a.band;
      prevJumpy = b.band;
      expect(a.band).not.toBe("lost");
    }
    expect(stableChanges).toBe(0);
    expect(prevStable).toBe("ok");
    expect(jumpyChanges).toBeGreaterThan(0);
  });

  it("ignores a band that alternates every frame", () => {
    const guide = createDistanceGuide();
    const bands: string[] = [];
    for (let frame = 0; frame < 40; frame += 1) {
      const distanceMm = frame % 2 === 0 ? 180 : 270;
      bands.push(guide.push({ timeMs: frame * 33, distanceMm }).band);
    }
    expect(new Set(bands).size).toBe(1);
    expect(bands[0]).toBe("too-close");
  });

  it("changes once, after the dwell, when the card really moves away", () => {
    const guide = createDistanceGuide();
    const bands: string[] = [];
    for (let frame = 0; frame < 12; frame += 1) bands.push(guide.push({ timeMs: frame * 33, distanceMm: 220 }).band);
    const farStart = 12 * 33;
    let switchedAt: number | null = null;
    for (let frame = 12; frame < 40; frame += 1) {
      const timeMs = frame * 33;
      const frameBand = guide.push({ timeMs, distanceMm: 280 }).band;
      bands.push(frameBand);
      if (switchedAt == null && frameBand === "too-far") switchedAt = timeMs;
    }
    expect(bands.filter((band) => band === "ok").length).toBeGreaterThan(0);
    expect(switchedAt).not.toBeNull();
    expect(switchedAt! - farStart).toBeGreaterThanOrEqual(DISTANCE_GUIDE_PARAMS.dwellMs);
    const after = bands.slice(bands.lastIndexOf("too-far"));
    expect(after.every((band) => band === "too-far")).toBe(true);
  });

  it("holds the last good reading for about 700 ms and then drops it", () => {
    const guide = createDistanceGuide();
    let lostAt = 0;
    for (let frame = 0; frame < 8; frame += 1) {
      lostAt = frame * 33;
      guide.push({ timeMs: lostAt, distanceMm: 220 });
    }
    const held = guide.push({ timeMs: lostAt + 400, distanceMm: null });
    expect(held.held).toBe(true);
    expect(held.band).toBe("ok");
    expect(held.hint).toBe("hold");
    expect(held.distanceMm).not.toBeNull();
    const still = guide.push({ timeMs: lostAt + 699, distanceMm: null });
    expect(still.held).toBe(true);
    const dropped = guide.push({ timeMs: lostAt + 700, distanceMm: null });
    expect(dropped.held).toBe(false);
    expect(dropped.band).toBe("lost");
    expect(dropped.distanceMm).toBeNull();
  });

  it("throttles publishes until the interval, and publishes a band change immediately", () => {
    const guide = createDistanceGuide();
    const first = guide.push({ timeMs: 0, distanceMm: 190 });
    expect(first.publish).toBe(true);
    expect(first.band).toBe("too-close");
    const soon = guide.push({ timeMs: 40, distanceMm: 188 });
    expect(soon.publish).toBe(false);
    const later = guide.push({ timeMs: 100, distanceMm: 186 });
    expect(later.publish).toBe(true);
    const guide2 = createDistanceGuide();
    for (let frame = 0; frame < 10; frame += 1) guide2.push({ timeMs: frame * 33, distanceMm: 220 });
    const start = 10 * 33;
    let sawChange = false;
    let last = guide2.push({ timeMs: start, distanceMm: 160 });
    for (let step = 1; step <= 20; step += 1) {
      last = guide2.push({ timeMs: start + step * 33, distanceMm: 160 });
      if (last.band === "too-close" && last.publish) sawChange = true;
    }
    expect(last.band).toBe("too-close");
    expect(sawChange).toBe(true);
  });
});
