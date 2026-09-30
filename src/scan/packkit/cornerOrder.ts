import { length2, sub2, type Vec2 } from "./vec.ts";
import type { CardReference } from "./poseMath.ts";

/** Keep the previous long-edge assignment until another edge is clearly longer. */
export const EDGE_HYSTERESIS = 0.92;

/**
 * Puts the reference card's long side (85.60 mm on ID-1) on the longer image edges.
 * Both pairings reproject the four corners, and the wrong one scales Z by about 85.60 / 53.98.
 * The previous frame wins ties so a near-square projection does not swap the long side.
 */
export function alignments(corners: Vec2[], reference: CardReference, previous: Vec2[] | null = null): Vec2[][] {
  if (corners.length !== 4 || !corners.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) return [];
  let cyclic = corners.slice();
  if (signedArea(cyclic) < 0) cyclic = cyclic.slice().reverse();
  if (!(Math.abs(signedArea(cyclic)) > 1e-4)) return [];
  const widthIsLong = reference.widthMm >= reference.heightMm;
  const scored: Array<{ corners: Vec2[]; longLength: number }> = [];
  for (let shift = 0; shift < 4; shift += 1) {
    const turned = [0, 1, 2, 3].map((index) => cyclic[(index + shift) % 4]);
    const longEdge = widthIsLong ? widthLength(turned) : heightLength(turned);
    if (!Number.isFinite(longEdge) || !(longEdge > 1)) continue;
    scored.push({ corners: turned, longLength: longEdge });
  }
  const best = scored.reduce((max, item) => Math.max(max, item.longLength), 0);
  if (!(best > 1)) return [];
  let viable = scored.filter((item) => item.longLength >= best * EDGE_HYSTERESIS);
  const anchor = previous && previous.length === 4 ? previous : corners;
  viable = viable.slice().sort((a, b) => cornerDistance(a.corners, anchor) - cornerDistance(b.corners, anchor));
  return viable.map((item) => item.corners);
}

export function widthLength(corners: Vec2[]): number {
  if (corners.length !== 4) return 0;
  return 0.5 * (length2(sub2(corners[1], corners[0])) + length2(sub2(corners[2], corners[3])));
}

export function heightLength(corners: Vec2[]): number {
  if (corners.length !== 4) return 0;
  return 0.5 * (length2(sub2(corners[2], corners[1])) + length2(sub2(corners[0], corners[3])));
}

export function signedArea(corners: Vec2[]): number {
  if (corners.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < corners.length; index += 1) {
    const next = corners[(index + 1) % corners.length];
    sum += corners[index].x * next.y - next.x * corners[index].y;
  }
  return sum / 2;
}

export function cornerDistance(lhs: Vec2[], rhs: Vec2[]): number {
  if (lhs.length !== rhs.length || lhs.length === 0) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let index = 0; index < lhs.length; index += 1) {
    const dx = lhs[index].x - rhs[index].x;
    const dy = lhs[index].y - rhs[index].y;
    total += dx * dx + dy * dy;
  }
  return total;
}
