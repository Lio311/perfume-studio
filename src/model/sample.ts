import { bodyProfiles, capProfiles } from "./profiles.ts";
import type { CapProfileName, ProfileName } from "./types.ts";

export type Profile = ReadonlyArray<readonly [number, number]>;

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Fritsch–Carlson monotone cubic tangents.
 * Smoothstep on each segment forced a zero slope at every knot, which put a
 * flat into round silhouettes. These tangents stay C1, match the secant where
 * the data is monotone, and are scaled so a segment cannot leave the range of
 * its two knots.
 */
function monotoneTangents(profile: Profile): number[] {
  const n = profile.length;
  const m = new Array<number>(n).fill(0);
  if (n < 2) return m;
  const secant: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const a = profile[i];
    const b = profile[i + 1];
    const h = (b?.[0] ?? 0) - (a?.[0] ?? 0);
    secant.push(h === 0 ? 0 : ((b?.[1] ?? 0) - (a?.[1] ?? 0)) / h);
  }
  m[0] = secant[0] ?? 0;
  m[n - 1] = secant[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i += 1) {
    const prev = secant[i - 1] ?? 0;
    const next = secant[i] ?? 0;
    m[i] = prev * next <= 0 ? 0 : (prev + next) / 2;
  }
  for (let i = 0; i < n - 1; i += 1) {
    const slope = secant[i] ?? 0;
    if (slope === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    let alpha = (m[i] ?? 0) / slope;
    let beta = (m[i + 1] ?? 0) / slope;
    if (alpha < 0) {
      m[i] = 0;
      alpha = 0;
    }
    if (beta < 0) {
      m[i + 1] = 0;
      beta = 0;
    }
    const sum = alpha * alpha + beta * beta;
    if (sum > 9) {
      const tau = 3 / Math.sqrt(sum);
      m[i] = tau * alpha * slope;
      m[i + 1] = tau * beta * slope;
    }
  }
  return m;
}

function hermite(y0: number, y1: number, m0: number, m1: number, h: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * h * m1;
}

export function sampleProfile(profile: Profile, t: number): number {
  const x = clamp(t, 0, 1);
  const first = profile[0];
  const last = profile[profile.length - 1];
  if (!first || !last) return 1;
  // The sphere knots are a coarse stand-in. The Orb body is the circle of
  // diameter equal to the width, resting on the base.
  if (profile === bodyProfiles.sphere) return orbCircleFactor(x);
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  const tangents = monotoneTangents(profile);
  for (let i = 0; i < profile.length - 1; i += 1) {
    const a = profile[i];
    const b = profile[i + 1];
    if (!a || !b) continue;
    if (x < a[0] || x > b[0]) continue;
    const h = b[0] - a[0];
    if (h <= 0) return a[1];
    const u = (x - a[0]) / h;
    const y = hermite(a[1], b[1], tangents[i] ?? 0, tangents[i + 1] ?? 0, h, u);
    const lo = Math.max(0, Math.min(a[1], b[1]));
    const hi = Math.max(a[1], b[1]);
    return clamp(y, lo, hi);
  }
  return last[1];
}

/** Finish main used for every profile: a short neck, never longer than 5.5 mm. */
export function classicFinishMm(neckR: number): number {
  return Math.min(5.5, neckR * 0.85);
}

/**
 * Straight glass under the lip, from the shoulder slope.
 * The crimp seat has to land on a cylinder. A gentle shoulder only needs that
 * seat. A bulb that is still wide where the shoulder starts (steeper than the
 * orb) needs about one neck radius, or the ferrule closes on the crown.
 * A longer neck than that reads as a gap under the pump.
 */
export function glassFinishMm(
  height: number,
  width: number,
  profile: ProfileName,
  shoulder: number,
  neckR: number,
  crimpMm: number,
): number {
  const classic = classicFinishMm(neckR);
  const straightStart = height - classic;
  const shoulderStart = Math.max(height * 0.35, straightStart - height * shoulder);
  const shoulderLen = Math.max(0.001, straightStart - shoulderStart);
  const end = bodyProfiles[profile][bodyProfiles[profile].length - 1]?.[1] ?? 1;
  const slope = (width / 2 * end - neckR) / shoulderLen;
  const steepBulb = end < 0.85 && slope >= 1.5;
  const seat = steepBulb ? Math.max(crimpMm, neckR * 0.98) : Math.max(classic, crimpMm);
  return Math.min(height * 0.18, seat);
}

/** Length of the straight glass finish. Catalog bottles pass their own `finishMm`. */
export function neckFinishMm(height: number, neckR: number, finishMm?: number): number {
  const classic = classicFinishMm(neckR);
  if (finishMm == null) return classic;
  return Math.min(height * 0.18, Math.max(classic, finishMm));
}

export function bottleRadii(
  y: number,
  height: number,
  width: number,
  depth: number,
  profile: ProfileName,
  shoulder: number,
  neckR: number,
  finishMm?: number,
): { rx: number; rz: number; morph: number } {
  const halfW = width / 2;
  const halfD = depth / 2;
  const straight = neckFinishMm(height, neckR, finishMm);
  const straightStart = height - straight;
  const shoulderStart = Math.max(height * 0.35, straightStart - height * shoulder);
  if (y >= straightStart) return { rx: neckR, rz: neckR, morph: 1 };
  const bodyT = shoulderStart <= 0.001 ? 0 : clamp(y / shoulderStart, 0, 1);
  const factor = sampleProfile(bodyProfiles[profile], Math.min(bodyT, y <= shoulderStart ? bodyT : 1));
  const rxBody = halfW * factor;
  const rzBody = halfD * factor;
  if (y <= shoulderStart) {
    const heel = y < 2.2 ? 0.9 + 0.1 * (y / 2.2) : 1;
    return { rx: rxBody * heel, rz: rzBody * heel, morph: 0 };
  }
  const u = (y - shoulderStart) / (straightStart - shoulderStart || 1);
  const s = u * u * (3 - 2 * u);
  return {
    rx: rxBody + (neckR - rxBody) * s,
    rz: rzBody + (neckR - rzBody) * s,
    morph: s,
  };
}

export function capRadius(t: number, profile: CapProfileName, half: number): number {
  return Math.max(0.8, half * sampleProfile(capProfiles[profile], t));
}

/** Front-view outline for thumbnails, in millimetres, base at y=0. */
export function bottleOutline(
  height: number,
  width: number,
  profile: ProfileName,
  shoulder: number,
  neckR: number,
  steps = 28,
  finishMm?: number,
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const y = (i / steps) * height;
    const { rx } = bottleRadii(y, height, width, width, profile, shoulder, neckR, finishMm);
    pts.push({ x: rx, y });
  }
  return pts;
}

/**
 * Radius factor of a sphere that sits on the base, diameter = width.
 * `t` is y / shoulderStart for Orb 50 (64 × 60 mm, shoulder 0.16, FEA15),
 * which is the span `bottleRadii` uses for that bottle.
 */
function orbCircleFactor(t: number): number {
  const height = 64;
  const shoulder = 0.16;
  const neckR = 7.5;
  const radius = 30;
  const straight = Math.min(5.5, neckR * 0.85);
  const straightStart = height - straight;
  const shoulderStart = Math.max(height * 0.35, straightStart - height * shoulder);
  const y = t * shoulderStart;
  const inside = radius * radius - (y - radius) * (y - radius);
  return Math.sqrt(Math.max(0, inside)) / radius;
}
