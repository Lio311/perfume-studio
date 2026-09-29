import { BOX_CLOSED_MARK_AZIMUTH } from "../boxCamera.ts";
import { ribbonBandWidth } from "./kit.tsx";
import { tubeMarkBand } from "./tubeMark.tsx";

/** Extra yaw past the band so the ribbon is not on the mark and not on the silhouette. */
export const RIBBON_MARK_GAP = (8 * Math.PI) / 180;

/**
 * Cylinder ribbon yaw. The mark is centred on the closed shot; the ribbon starts
 * just past that band. φ + 90° would put it on the silhouette, so it is not used.
 */
export function cylinderRibbonYaw(radius: number, lidR: number, w: number, d: number): number {
  const band = ribbonBandWidth(w, d);
  const markAngle = tubeMarkBand(radius).angle;
  return BOX_CLOSED_MARK_AZIMUTH + markAngle / 2 + (band / 2) / Math.max(1, lidR) + RIBBON_MARK_GAP;
}

/**
 * A ribbon from `start` to `top`, cut at `seam`.
 * `below` stays on the base. `above.y` is the world start of the piece that belongs to the lid.
 */
export function splitRibbon(start: number, top: number, seam: number): {
  below: { y: number; h: number } | null;
  above: { y: number; h: number } | null;
} {
  if (!(top > start)) return { below: null, above: null };
  const cut = Math.min(Math.max(seam, start), top);
  const belowH = cut - start;
  const aboveH = top - cut;
  return {
    below: belowH > 0.2 ? { y: start, h: belowH } : null,
    above: aboveH > 0.2 ? { y: cut, h: aboveH } : null,
  };
}

/** How far the curved band sits outside each shell. */
export const RIBBON_ON_BASE = 0.3;
export const RIBBON_ON_SLEEVE = 0.35;
export const RIBBON_ON_LID = 0.3;

/** Side facet of an octagon. 90° is the middle of that face, not the 67.5° corner. */
export const FACET_RIBBON_YAW = Math.PI / 2;

/** Flat-to-flat span so a band sits on the facet instead of outside the corners. */
export function facetRibbonDiameter(radius: number, sides: number): number {
  const n = Math.max(3, Math.round(sides));
  return 2 * radius * Math.cos(Math.PI / n);
}

/** Ribbon when one is tied; the small tab only when nothing else is the pull. */
export function closurePull(tied: boolean, pullTab: boolean): "ribbon" | "tab" | null {
  if (tied) return "ribbon";
  if (pullTab) return "tab";
  return null;
}

/** Empty millimetres between pieces, including a start above 0 and a stop short of `height`. */
export function ribbonGaps(pieces: { y: number; h: number }[], height: number): number {
  const sorted = pieces.filter((piece) => piece.h > 0).sort((a, b) => a.y - b.y);
  let cursor = 0;
  let gap = 0;
  for (const piece of sorted) {
    if (piece.y > cursor) gap += piece.y - cursor;
    cursor = Math.max(cursor, piece.y + piece.h);
  }
  if (cursor < height) gap += height - cursor;
  return gap;
}

/** Cylinder lift-off, from the floor. The upper radius is the lid; the lower is the base. */
export function cylinderRibbonLayout(height: number, seam: number, radius: number, lidR: number): {
  below: { y: number; h: number; radius: number; cap: false } | null;
  above: { y: number; h: number; radius: number; cap: true } | null;
} {
  const span = splitRibbon(0, height, seam);
  return {
    below: span.below ? { y: span.below.y, h: span.below.h, radius: radius + RIBBON_ON_BASE, cap: false } : null,
    above: span.above ? { y: span.above.y, h: span.above.h, radius: lidR + RIBBON_ON_LID, cap: true } : null,
  };
}

/** Tube, from the floor: base, then sleeve, then cap. Each piece takes the shell it wraps. */
export function tubeRibbonLayout(height: number, baseH: number, closed: number, radius: number, lidR: number): {
  base: { y: number; h: number; radius: number; cap: false } | null;
  sleeve: { y: number; h: number; radius: number; cap: false } | null;
  cap: { y: number; h: number; radius: number; cap: true } | null;
} {
  const base = splitRibbon(0, height, baseH);
  const upper = splitRibbon(Math.max(0, baseH), height, closed);
  return {
    base: base.below ? { y: base.below.y, h: base.below.h, radius: radius + RIBBON_ON_BASE, cap: false } : null,
    sleeve: upper.below ? { y: upper.below.y, h: upper.below.h, radius: radius + RIBBON_ON_SLEEVE, cap: false } : null,
    cap: upper.above ? { y: upper.above.y, h: upper.above.h, radius: lidR + RIBBON_ON_LID, cap: true } : null,
  };
}

/**
 * Rectangular lift-off. The lid piece uses the lid width; the base piece uses the base width.
 * `start` stays below the shoulder so the lower band is on the walls, not the floor.
 */
export function rectRibbonLayout(height: number, seam: number, baseD: number, lidD: number, start = height * 0.28): {
  below: { y: number; h: number; d: number; cap: false } | null;
  above: { y: number; h: number; d: number; cap: true } | null;
} {
  const span = splitRibbon(start, height, seam);
  return {
    below: span.below ? { y: span.below.y, h: span.below.h, d: baseD, cap: false } : null,
    above: span.above ? { y: span.above.y, h: span.above.h, d: lidD, cap: true } : null,
  };
}
