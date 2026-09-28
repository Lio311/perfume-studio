import { describe, expect, it } from "vitest";
import { BOTTLES } from "./bottles.ts";
import { neckRadius } from "./necks.ts";
import { bodyProfiles, capProfiles } from "./profiles.ts";
import { bottleRadii, sampleProfile, straightNeckMm, type Profile } from "./sample.ts";

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
      const top = bottleRadii(bottle.heightMm, bottle.heightMm, bottle.widthMm, bottle.depthMm, bottle.profile, bottle.shoulder, neckR);
      expect(top.rx, bottle.id).toBe(neckR);
      expect(top.rz, bottle.id).toBe(neckR);
      const finish = bottle.heightMm - straightNeckMm(neckR);
      const atFinish = bottleRadii(finish, bottle.heightMm, bottle.widthMm, bottle.depthMm, bottle.profile, bottle.shoulder, neckR);
      expect(atFinish.rx, bottle.id).toBeCloseTo(neckR, 6);
      let maxR = 0;
      for (let i = 0; i <= 80; i += 1) {
        const y = (i / 80) * bottle.heightMm;
        const sample = bottleRadii(y, bottle.heightMm, bottle.widthMm, bottle.depthMm, bottle.profile, bottle.shoulder, neckR);
        maxR = Math.max(maxR, sample.rx, sample.rz);
      }
      expect(maxR, bottle.id).toBeLessThanOrEqual(Math.max(bottle.widthMm, bottle.depthMm) / 2 + 1e-6);
    }
  });
});
