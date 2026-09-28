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

export function sampleProfile(profile: Profile, t: number): number {
  const x = clamp(t, 0, 1);
  const first = profile[0];
  const last = profile[profile.length - 1];
  if (!first || !last) return 1;
  if (x <= first[0]) return first[1];
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i];
    const b = profile[i + 1];
    if (!a || !b) continue;
    if (x >= a[0] && x <= b[0]) {
      const u = (x - a[0]) / (b[0] - a[0] || 1);
      const s = u * u * (3 - 2 * u);
      return a[1] + (b[1] - a[1]) * s;
    }
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

/** Glass lip: the top of the straight finish. Closures seat here, not on the bulb. */
export function neckLipY(
  height: number,
  width: number,
  depth: number,
  profile: ProfileName,
  shoulder: number,
  neckR: number,
  finishMm?: number,
): number {
  let lip = 0;
  const steps = 48;
  for (let i = 0; i <= steps; i += 1) {
    const y = (i / steps) * height;
    const sample = bottleRadii(y, height, width, depth, profile, shoulder, neckR, finishMm);
    if (Math.abs(sample.rx - neckR) < 0.08 && Math.abs(sample.rz - neckR) < 0.08) lip = y;
  }
  return lip;
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
