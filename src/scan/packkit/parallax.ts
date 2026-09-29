import type { CameraIntrinsics } from "./poseMath.ts";

export const DEFAULT_PARALLAX_ITERATIONS = 2;

export function correctedRadius(apparentRadiusMm: number, distanceMm: number, iterations = DEFAULT_PARALLAX_ITERATIONS): number {
  if (!Number.isFinite(apparentRadiusMm) || !(apparentRadiusMm > 0) || !Number.isFinite(distanceMm) || !(distanceMm > apparentRadiusMm)) {
    return apparentRadiusMm;
  }
  let radius = apparentRadiusMm;
  const steps = Math.max(1, iterations);
  for (let index = 0; index < steps; index += 1) {
    const next = (apparentRadiusMm * (distanceMm - radius)) / distanceMm;
    if (Number.isFinite(next) && next > 0 && next < distanceMm) radius = next;
  }
  return radius;
}

export function roundFactor(radiusMm: number, distanceMm: number): number {
  if (!Number.isFinite(distanceMm) || !(distanceMm > 0) || !Number.isFinite(radiusMm) || !(radiusMm > 0) || !(radiusMm < distanceMm)) return 1;
  return (distanceMm - radiusMm) / distanceMm;
}

export function correctRound(apparentMm: number, distanceMm: number, radiusMm: number): number {
  return apparentMm * roundFactor(radiusMm, distanceMm);
}

export function flatEndDepthMm(distanceMm: number, radiusMm: number): number {
  if (!Number.isFinite(distanceMm) || !Number.isFinite(radiusMm)) return distanceMm;
  return distanceMm - 2 * radiusMm;
}

export function correctBoxFront(apparentMm: number): number {
  return apparentMm;
}

export function radiusFromTangents(
  leftPixel: number,
  rightPixel: number,
  intrinsics: CameraIntrinsics,
  distanceMm: number,
): number | null {
  if (!Number.isFinite(intrinsics.fx) || !(intrinsics.fx > 0) || !Number.isFinite(distanceMm) || !(distanceMm > 1)) return null;
  if (!Number.isFinite(leftPixel) || !Number.isFinite(rightPixel) || !(rightPixel > leftPixel)) return null;
  const thetaLeft = Math.atan((leftPixel - intrinsics.cx) / intrinsics.fx);
  const thetaRight = Math.atan((rightPixel - intrinsics.cx) / intrinsics.fx);
  const half = (thetaRight - thetaLeft) / 2;
  const center = (thetaRight + thetaLeft) / 2;
  const sine = Math.sin(half);
  const cosine = Math.cos(center);
  const denominator = cosine + sine;
  if (!(sine > 0) || !(denominator > 1e-9)) return null;
  const radius = (distanceMm * sine) / denominator;
  if (!Number.isFinite(radius) || !(radius > 0) || !(radius < distanceMm)) return null;
  return radius;
}

export function radiusAboutAxis(
  leftPixel: number,
  rightPixel: number,
  intrinsics: CameraIntrinsics,
  axisXMm: number,
  axisZMm: number,
): number | null {
  if (!(intrinsics.fx > 0) || !(axisZMm > 1) || !(rightPixel > leftPixel)) return null;
  const thetaLeft = Math.atan((leftPixel - intrinsics.cx) / intrinsics.fx);
  const thetaRight = Math.atan((rightPixel - intrinsics.cx) / intrinsics.fx);
  const half = (thetaRight - thetaLeft) / 2;
  const distance = Math.sqrt(axisXMm * axisXMm + axisZMm * axisZMm);
  const radius = distance * Math.sin(half);
  if (!Number.isFinite(radius) || !(radius > 0)) return null;
  return radius;
}
