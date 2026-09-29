import { planeMmFromPixel, type CardPlaneMap } from "./scale.ts";
import type { LatheProfile, ProfileExtraction } from "./profile.ts";
import type { PartKind } from "./shape.ts";
import { rowsOf, type Silhouette } from "./silhouette.ts";

export interface Dimensions {
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

export interface PlanarFace {
  widthMm: number;
  heightMm: number;
  rectangleFit: number;
}

export function roundDimensions(kind: PartKind, extraction: ProfileExtraction): Dimensions {
  const diameter = 2 * extraction.radiusMm;
  void kind;
  return { widthMm: diameter, heightMm: extraction.heightMm, depthMm: diameter };
}

export function planarDimensions(kind: PartKind, front: PlanarFace, side: PlanarFace | null): Dimensions {
  if (kind === "label") return { widthMm: front.widthMm, heightMm: front.heightMm, depthMm: 0 };
  return { widthMm: front.widthMm, heightMm: front.heightMm, depthMm: side?.widthMm ?? front.widthMm };
}

export function planarFaceFromPlane(mask: Silhouette, plane: CardPlaneMap): PlanarFace | null {
  const rows = rowsOf(mask);
  if (rows.length < 2) return null;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const widths: number[] = [];
  for (const row of rows) {
    const y = row.y + 0.5;
    const left = planeMmFromPixel(plane, { x: row.left, y });
    const right = planeMmFromPixel(plane, { x: row.right + 1, y });
    if (!left || !right) continue;
    minX = Math.min(minX, left.x, right.x);
    maxX = Math.max(maxX, left.x, right.x);
    minY = Math.min(minY, left.y, right.y);
    maxY = Math.max(maxY, left.y, right.y);
    widths.push(Math.abs(right.x - left.x));
  }
  if (!Number.isFinite(minX) || !(maxX > minX) || !(maxY > minY)) return null;
  return { widthMm: maxX - minX, heightMm: maxY - minY, rectangleFit: fit(widths) };
}

export function planarFaceFromScale(mask: Silhouette, millimetresPerPixel: number): PlanarFace | null {
  const rows = rowsOf(mask);
  if (rows.length < 2 || !(millimetresPerPixel > 0)) return null;
  const widthPx = rows.reduce((best, row) => Math.max(best, row.right - row.left + 1), 0);
  const heightPx = rows[rows.length - 1].y - rows[0].y + 1;
  const widths = rows.map((row) => row.right - row.left + 1);
  return {
    widthMm: widthPx * millimetresPerPixel,
    heightMm: heightPx * millimetresPerPixel,
    rectangleFit: fit(widths),
  };
}

function fit(widths: number[]): number {
  const maxWidth = widths.reduce((best, value) => Math.max(best, value), 0);
  if (!(maxWidth > 0)) return 0;
  const close = widths.filter((value) => value >= 0.98 * maxWidth).length;
  return close / widths.length;
}

export type { LatheProfile };
