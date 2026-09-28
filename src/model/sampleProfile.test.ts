import { describe, expect, it } from "vitest";
import { BOTTLES } from "./bottles.ts";
import { neckRadius } from "./necks.ts";
import { bodyProfiles, capProfiles } from "./profiles.ts";
import { bottleRadii, neckFinishMm, sampleProfile, type Profile } from "./sample.ts";

const profiles: Profile[] = [...Object.values(bodyProfiles), ...Object.values(capProfiles)];

function derivative(profile: Profile, t: number, side: -1 | 1): number {
  const eps = 1e-6;
  const a = side < 0 ? t - eps : t;
  const b = side < 0 ? t : t + eps;
  return (sampleProfile(profile, b) - sampleProfile(profile, a)) / eps;
}

describe("sampleProfile", () => {
  it("preserves every control point, including the endpoints", () => {
    for (const profile of profiles) {
      const first = profile[0];
      const last = profile[profile.length - 1];
      expect(first && last, "profile").toBeTruthy();
      if (!first || !last) continue;
      expect(sampleProfile(profile, first[0])).toBeCloseTo(first[1], 8);
      expect(sampleProfile(profile, last[0])).toBeCloseTo(last[1], 8);
      for (const knot of profile) {
        expect(sampleProfile(profile, knot[0])).toBeCloseTo(knot[1], 8);
      }
    }
  });

  it("keeps a continuous slope at every interior control point", () => {
    for (const profile of profiles) {
      for (let i = 1; i < profile.length - 1; i += 1) {
        const knot = profile[i];
        const prev = profile[i - 1];
        const next = profile[i + 1];
        if (!knot || !prev || !next) continue;
        const gap = Math.min(knot[0] - prev[0], next[0] - knot[0]);
        if (gap < 1e-4) continue;
        const left = derivative(profile, knot[0], -1);
        const right = derivative(profile, knot[0], 1);
        expect(Math.abs(left - right), `${knot[0]}`).toBeLessThan(0.002);
      }
    }
  });

  it("does not flatten a round profile at a knot that is still rising", () => {
    const sphere = bodyProfiles.sphere;
    const rising = sphere[1];
    expect(rising?.[0]).toBeCloseTo(0.22, 5);
    if (!rising) return;
    expect(derivative(sphere, rising[0], 1)).toBeGreaterThan(0.4);
    expect(derivative(sphere, rising[0], -1)).toBeGreaterThan(0.4);
  });

  it("stays inside the neighbouring knots and never goes negative", () => {
    const extra: Profile[] = [
      [
        [0, 0.2],
        [0.2, 0.95],
        [0.35, 0.12],
        [1, 0.8],
      ],
      [
        [0, 0],
        [0.5, 1],
        [1, 0],
      ],
    ];
    for (const profile of [...profiles, ...extra]) {
      for (let i = 0; i < profile.length - 1; i += 1) {
        const a = profile[i];
        const b = profile[i + 1];
        if (!a || !b || b[0] <= a[0]) continue;
        const lo = Math.max(0, Math.min(a[1], b[1]));
        const hi = Math.max(a[1], b[1]);
        for (let step = 0; step <= 32; step += 1) {
          const t = a[0] + ((b[0] - a[0]) * step) / 32;
          const y = sampleProfile(profile, t);
          expect(y).toBeGreaterThanOrEqual(lo - 1e-6);
          expect(y).toBeLessThanOrEqual(hi + 1e-6);
          expect(y).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("keeps catalog lip radii and overall width", () => {
    for (const bottle of BOTTLES) {
      const neckR = neckRadius(bottle.neck);
      const radii = (y: number) =>
        bottleRadii(
          y,
          bottle.heightMm,
          bottle.widthMm,
          bottle.depthMm,
          bottle.profile,
          bottle.shoulder,
          neckR,
          bottle.finishMm,
        );
      const top = radii(bottle.heightMm);
      expect(top.rx, bottle.id).toBe(neckR);
      expect(top.rz, bottle.id).toBe(neckR);
      const finish = bottle.heightMm - neckFinishMm(bottle.heightMm, neckR, bottle.finishMm);
      const atFinish = radii(finish);
      expect(atFinish.rx, bottle.id).toBeCloseTo(neckR, 6);
      let maxR = 0;
      for (let i = 0; i <= 80; i += 1) {
        const sample = radii((i / 80) * bottle.heightMm);
        maxR = Math.max(maxR, sample.rx, sample.rz);
      }
      expect(maxR, bottle.id).toBeLessThanOrEqual(Math.max(bottle.widthMm, bottle.depthMm) / 2 + 1e-6);
    }
  });

  it("follows a circle of the real width and depth up to the shoulder from finishMm", () => {
    const orb = BOTTLES.find((bottle) => bottle.id === "orb-50");
    expect(orb, "orb-50").toBeTruthy();
    expect(orb?.finishMm, "catalog finish").toBeCloseTo(7.35, 2);
    if (!orb || orb.finishMm == null) return;
    const neckR = neckRadius(orb.neck);
    const classicShoulder = shoulderStartMm(orb.heightMm, orb.shoulder, neckR, Math.min(5.5, neckR * 0.85));
    const finishShoulder = shoulderStartMm(orb.heightMm, orb.shoulder, neckR, orb.finishMm);
    expect(classicShoulder, "classic shoulder").toBeCloseTo(48.26, 2);
    expect(finishShoulder, "finish shoulder").toBeCloseTo(46.41, 2);

    expectSphereCircle({
      label: orb.id,
      height: orb.heightMm,
      width: orb.widthMm,
      depth: orb.depthMm,
      shoulder: orb.shoulder,
      neckR,
      finishMm: orb.finishMm,
    });

    const radius = orb.widthMm / 2;
    const circleAt = (y: number) => Math.sqrt(Math.max(0, radius * radius - (y - radius) ** 2));
    const atShoulder = bottleRadii(
      finishShoulder,
      orb.heightMm,
      orb.widthMm,
      orb.depthMm,
      "sphere",
      orb.shoulder,
      neckR,
      orb.finishMm,
    );
    expect(atShoulder.rx, "circle at finish shoulder").toBeCloseTo(circleAt(finishShoulder), 4);
    expect(circleAt(finishShoulder) - circleAt(classicShoulder), "unsquashed shoulder").toBeCloseTo(1.3, 1);

    const syntheticFinish = 8;
    expectSphereCircle({
      label: "synthetic-40x44",
      height: 52,
      width: 40,
      depth: 44,
      shoulder: 0.18,
      neckR: 6.5,
      finishMm: syntheticFinish,
    });
    const oval = bottleRadii(22, 52, 40, 44, "sphere", 0.18, 6.5, syntheticFinish);
    expect(oval.rx).not.toBeCloseTo(oval.rz, 1);
  });
});

function shoulderStartMm(height: number, shoulder: number, neckR: number, finishMm: number): number {
  const straight = neckFinishMm(height, neckR, finishMm);
  const straightStart = height - straight;
  return Math.max(height * 0.35, straightStart - height * shoulder);
}

function expectSphereCircle(spec: {
  label: string;
  height: number;
  width: number;
  depth: number;
  shoulder: number;
  neckR: number;
  finishMm: number;
}): void {
  const shoulderStart = shoulderStartMm(spec.height, spec.shoulder, spec.neckR, spec.finishMm);
  const rxR = spec.width / 2;
  const rzR = spec.depth / 2;
  expect(shoulderStart, `${spec.label} shoulder`).toBeGreaterThan(Math.max(rxR, rzR));
  let maxErr = 0;
  let bodyErr = 0;
  for (let i = 0; i <= 160; i += 1) {
    const y = (i / 160) * shoulderStart;
    const sample = bottleRadii(y, spec.height, spec.width, spec.depth, "sphere", spec.shoulder, spec.neckR, spec.finishMm);
    const heel = y < 2.2 ? 0.9 + 0.1 * (y / 2.2) : 1;
    const rx = Math.sqrt(Math.max(0, rxR * rxR - (y - rxR) ** 2)) * heel;
    const rz = Math.sqrt(Math.max(0, rzR * rzR - (y - rzR) ** 2)) * heel;
    const err = Math.max(Math.abs(sample.rx - rx), Math.abs(sample.rz - rz));
    maxErr = Math.max(maxErr, err);
    if (y >= 2.2) {
      const bare = Math.max(
        Math.abs(sample.rx - rx / heel),
        Math.abs(sample.rz - rz / heel),
      );
      bodyErr = Math.max(bodyErr, bare);
    }
  }
  expect(maxErr, spec.label).toBeLessThan(0.05);
  expect(bodyErr, spec.label).toBeLessThan(0.05);
  const equator = Math.min(rxR, shoulderStart);
  const atEquator = bottleRadii(equator, spec.height, spec.width, spec.depth, "sphere", spec.shoulder, spec.neckR, spec.finishMm);
  expect(atEquator.rx, `${spec.label} width`).toBeCloseTo(rxR, 4);
}
