import type { CameraIntrinsics } from "./poseMath.ts";
import { fitLine, median, resample } from "./measureMath.ts";
import { flatEndDepthMm, correctedRadius, radiusAboutAxis, radiusFromTangents } from "./parallax.ts";
import { type MaskRow, rowsOf, type Silhouette } from "./silhouette.ts";

export const LATHE_SAMPLES = 42;
export const LATHE_MIN = 0.04;
export const LATHE_MAX = 1.2;

export interface LatheProfile {
  radiiMm: number[];
  heightMm: number;
  axisTiltDegrees: number;
  normalized: number[];
}

export interface ProfileExtraction {
  profile: LatheProfile;
  radiusMm: number;
  heightMm: number;
  neckOuterDiameterMm: number;
  apparentRadiusMm: number;
  iteratedRadiusMm: number;
  rectangleFit: number;
  observedRadiiMm: number[];
  parallaxResidualMm: number;
}

export function extractProfile(
  mask: Silhouette,
  intrinsics: CameraIntrinsics,
  distanceMm: number | null,
  millimetresPerPixel: number | null,
): ProfileExtraction | null {
  const rows = rowsOf(mask);
  if (rows.length < 2 || !(intrinsics.fx > 0) || !(intrinsics.fy > 0)) return null;
  if (distanceMm != null && distanceMm > 1) return extractGeometric(rows, intrinsics, distanceMm);
  if (millimetresPerPixel == null || !(millimetresPerPixel > 0)) return null;
  return extractScaled(rows, millimetresPerPixel);
}

function extractGeometric(rows: MaskRow[], intrinsics: CameraIntrinsics, distanceMm: number): ProfileExtraction | null {
  const firstPass = measure(rows, intrinsics, distanceMm, null);
  if (!firstPass) return null;
  const measured = measure(rows, intrinsics, distanceMm, firstPass.axis);
  if (!measured) return null;
  const radius = measured.radius;
  const depth = flatEndDepthMm(distanceMm, radius);
  if (!(depth > 1)) return null;
  const pixelHeight = rows[rows.length - 1].y - rows[0].y + 1;
  const height = (pixelHeight * depth) / intrinsics.fy;
  if (!Number.isFinite(height) || !(height > 0)) return null;
  const iterated = correctedRadius(measured.apparent, distanceMm);
  const built = makeProfile(measured.radii, height, measured.tiltDegrees);
  return {
    profile: built.profile,
    radiusMm: radius,
    heightMm: height,
    neckOuterDiameterMm: neckDiameter(built.profile.radiiMm),
    apparentRadiusMm: measured.apparent,
    iteratedRadiusMm: iterated,
    rectangleFit: rectangleFit(measured.radii),
    observedRadiiMm: built.observed,
    parallaxResidualMm: Math.abs(2 * radius - 2 * iterated),
  };
}

interface Pass {
  radius: number;
  apparent: number;
  radii: number[];
  tiltDegrees: number;
  axis: { x: number; z: number };
}

function measure(
  rows: MaskRow[],
  intrinsics: CameraIntrinsics,
  distanceMm: number,
  axis: { x: number; z: number } | null,
): Pass | null {
  const pixelWidths = rejectSpikes(rows.map((row) => row.right - row.left + 1));
  let seedIndex = 0;
  for (let index = 1; index < pixelWidths.length; index += 1) {
    if (pixelWidths[index] > pixelWidths[seedIndex]) seedIndex = index;
  }
  const widest = rows[seedIndex];
  const leftEdge = widest.left;
  const rightEdge = widest.right + 1;
  const seedRadius = radiusFromTangents(leftEdge, rightEdge, intrinsics, distanceMm);
  if (seedRadius == null) return null;
  const thetaLeft = Math.atan((leftEdge - intrinsics.cx) / intrinsics.fx);
  const thetaRight = Math.atan((rightEdge - intrinsics.cx) / intrinsics.fx);
  const theta = (thetaLeft + thetaRight) / 2;
  const axisZ = distanceMm - seedRadius;
  const axisX = axisZ * Math.tan(theta);
  const usedAxis = axis ?? { x: axisX, z: axisZ };
  const radii: number[] = [];
  const centres: Array<{ v: number; u: number }> = [];
  for (const row of rows) {
    const left = row.left;
    const right = row.right + 1;
    const radius = radiusAboutAxis(left, right, intrinsics, usedAxis.x, usedAxis.z) ?? 0;
    radii.push(radius);
    centres.push({ v: row.y, u: 0.5 * (left + right) });
  }
  const cleaned = rejectSpikes(radii);
  const fitted = fitAxis(centres);
  const maxRadius = cleaned.reduce((best, value) => Math.max(best, value), 0);
  if (!(maxRadius > 0)) return null;
  const xLeft = ((leftEdge - intrinsics.cx) * distanceMm) / intrinsics.fx;
  const xRight = ((rightEdge - intrinsics.cx) * distanceMm) / intrinsics.fx;
  const apparent = 0.5 * Math.abs(xRight - xLeft);
  let bestIndex = 0;
  for (let index = 1; index < cleaned.length; index += 1) {
    if (cleaned[index] > cleaned[bestIndex]) bestIndex = index;
  }
  const best = rows[bestIndex];
  const bestLeft = best.left;
  const bestRight = best.right + 1;
  const bestTheta = 0.5 * (
    Math.atan((bestLeft - intrinsics.cx) / intrinsics.fx) + Math.atan((bestRight - intrinsics.cx) / intrinsics.fx)
  );
  return {
    radius: maxRadius,
    apparent,
    radii: cleaned,
    tiltDegrees: fitted,
    axis: { x: (distanceMm - maxRadius) * Math.tan(bestTheta), z: distanceMm - maxRadius },
  };
}

function extractScaled(rows: MaskRow[], millimetresPerPixel: number): ProfileExtraction | null {
  let radii = rows.map((row) => (row.right - row.left + 1) * 0.5 * millimetresPerPixel);
  radii = rejectSpikes(radii);
  const radius = radii.reduce((best, value) => Math.max(best, value), 0);
  if (!(radius > 0)) return null;
  const height = (rows[rows.length - 1].y - rows[0].y + 1) * millimetresPerPixel;
  const centres = rows.map((row) => ({ v: row.y, u: 0.5 * (row.left + row.right) }));
  const built = makeProfile(radii, height, fitAxis(centres));
  return {
    profile: built.profile,
    radiusMm: radius,
    heightMm: height,
    neckOuterDiameterMm: neckDiameter(built.profile.radiiMm),
    apparentRadiusMm: radius,
    iteratedRadiusMm: radius,
    rectangleFit: rectangleFit(radii),
    observedRadiiMm: built.observed,
    parallaxResidualMm: 0,
  };
}

function makeProfile(radiiTopToBottom: number[], heightMm: number, axisTiltDegrees: number): { profile: LatheProfile; observed: number[] } {
  const smoothed = smooth(radiiTopToBottom);
  const observed = resample(smoothed.slice().reverse(), LATHE_SAMPLES);
  const values = smoothed.slice();
  const maxRadius = values.reduce((best, value) => Math.max(best, value), 0);
  const allowance = Math.floor(values.length * 0.08);
  if (maxRadius > 0 && allowance > 0) {
    let top = 0;
    while (top < allowance && values[top] < 0.92 * maxRadius) top += 1;
    let bottom = values.length - 1;
    while (bottom > values.length - 1 - allowance && values[bottom] < 0.92 * maxRadius) bottom -= 1;
    if (top > 0 && top < values.length) {
      const fill = values[top];
      for (let index = 0; index < top; index += 1) values[index] = fill;
    }
    if (bottom < values.length - 1 && bottom >= 0) {
      const fill = values[bottom];
      for (let index = bottom + 1; index < values.length; index += 1) values[index] = fill;
    }
  }
  const baseToTop = resample(values.slice().reverse(), LATHE_SAMPLES);
  const widest = baseToTop.reduce((best, value) => Math.max(best, value), 0);
  const normalized = baseToTop.map((sample) => {
    const unit = widest > 1e-9 ? sample / widest : 0;
    return Math.min(LATHE_MAX, Math.max(LATHE_MIN, unit));
  });
  return {
    profile: { radiiMm: baseToTop, heightMm, axisTiltDegrees, normalized },
    observed,
  };
}

function neckDiameter(baseToTop: number[]): number {
  if (!baseToTop.length) return 0;
  const count = Math.max(1, Math.floor(baseToTop.length / 10));
  return 2 * median(baseToTop.slice(baseToTop.length - count));
}

function rectangleFit(radii: number[]): number {
  const maxRadius = radii.reduce((best, value) => Math.max(best, value), 0);
  if (!(maxRadius > 0)) return 0;
  const close = radii.filter((value) => value >= 0.98 * maxRadius).length;
  return close / radii.length;
}

function fitAxis(centres: Array<{ v: number; u: number }>): number {
  return (Math.atan(fitLine(centres).b) * 180) / Math.PI;
}

function rejectSpikes(values: number[]): number[] {
  if (values.length < 5) return values.slice();
  const output = values.slice();
  const window = 4;
  for (let index = 0; index < values.length; index += 1) {
    const lower = Math.max(0, index - window);
    const upper = Math.min(values.length - 1, index + window);
    const neighbors: number[] = [];
    for (let neighbor = lower; neighbor <= upper; neighbor += 1) {
      if (neighbor !== index) neighbors.push(values[neighbor]);
    }
    const mid = median(neighbors);
    const limit = Math.max(0.8, 0.18 * mid);
    if (values[index] - mid > limit) output[index] = mid;
  }
  return output;
}

function smooth(values: number[]): number[] {
  if (values.length < 5) return values.slice();
  return values.map((_, index) => {
    const lower = Math.max(0, index - 2);
    const upper = Math.min(values.length - 1, index + 2);
    let sum = 0;
    let count = 0;
    for (let cursor = lower; cursor <= upper; cursor += 1) {
      sum += values[cursor];
      count += 1;
    }
    return sum / count;
  });
}
