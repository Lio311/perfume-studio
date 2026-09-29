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
