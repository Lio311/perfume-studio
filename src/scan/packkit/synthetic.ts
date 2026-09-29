/**
 * Rasteriser shared with `ios/Packages/PackKit/Tests/PackKitTests/MeasureTests.swift`
 * (`Synthetic`). Pixel rounding uses Swift's `rounded()` (half to even) so the
 * masks match. `Int` truncation toward zero is not used on these positive pixels.
 */
import { estimateMeasure, type MeasureResult } from "./estimator.ts";
import { cardReference } from "./scale.ts";
import type { CameraIntrinsics, CardReference } from "./poseMath.ts";
import { ID1 } from "./poseMath.ts";
import { silhouette, type Silhouette } from "./silhouette.ts";
import { v2, v3, type Vec2, type Vec3 } from "./vec.ts";
import type { PartKind } from "./shape.ts";

export const SYNTHETIC_INTRINSICS: CameraIntrinsics = { fx: 1500, fy: 1500, cx: 960, cy: 720 };
export const SYNTHETIC_WIDTH = 1920;
export const SYNTHETIC_HEIGHT = 1440;
export const SYNTHETIC_FRAME = { width: SYNTHETIC_WIDTH, height: SYNTHETIC_HEIGHT };
export const SYNTHETIC_DISTANCE = 200;

export function measureSynthetic(
  kind: PartKind,
  mask: Silhouette,
  tilt: number,
  axis: string,
  noise = 0,
  seed = 1,
  outlineEdited = false,
  centerX = -80,
): MeasureResult {
  return estimateMeasure({
    kind,
    intrinsics: SYNTHETIC_INTRINSICS,
    frame: SYNTHETIC_FRAME,
    reference: cardReference(cardCorners(tilt, axis, noise, seed, centerX)),
    front: mask,
    outlineEdited,
    device: "iPhone15,4",
  });
}

export function cardCorners(
  tilt: number,
  axis: string,
  noise = 0,
  seed = 1,
  centerX = -80,
  size: CardReference = ID1,
): Vec2[] {
  const w = size.widthMm / 2;
  const h = size.heightMm / 2;
  const model = [v3(-w, -h, 0), v3(w, -h, 0), v3(w, h, 0), v3(-w, h, 0)];
  const rng = splitMix(BigInt(seed));
  return model.map((point) => {
    const camera = add3(rotate(point, tilt, axis), v3(centerX, 0, SYNTHETIC_DISTANCE));
    let pixel = project(camera);
    if (noise > 0) pixel = v2(pixel.x + rng.gaussian() * noise, pixel.y + rng.gaussian() * noise);
    return pixel;
  });
}

export function cylinderMask(radius: number, heightMm: number, axisX = 0): Silhouette {
  return revolve(radius, radius, heightMm, 2, axisX, SYNTHETIC_DISTANCE - radius);
}

export function taperMask(radius: number, topRadius: number, heightMm: number, slices: number): Silhouette {
  const yTop = -heightMm / 2;
  return revolveBody(yTop, heightMm / 2, 0, SYNTHETIC_DISTANCE - radius, slices, (y) => {
    const t = (y - yTop) / heightMm;
    return radius + (topRadius - radius) * t;
  });
}

export function domeMask(bodyRadius: number, bodyHeight: number): Silhouette {
  const yTop = -(bodyHeight + bodyRadius) / 2;
  const yBottom = (bodyHeight + bodyRadius) / 2;
  const shoulder = yTop + bodyRadius;
  return revolveBody(yTop, yBottom, 0, SYNTHETIC_DISTANCE - bodyRadius, 100, (y) => {
    if (y >= shoulder) return bodyRadius;
    const dy = shoulder - y;
    const inside = bodyRadius * bodyRadius - dy * dy;
    return inside > 0 ? Math.sqrt(inside) : 0;
  });
}

export function sphereMask(radius: number): Silhouette {
  return revolveBody(-radius, radius, 0, SYNTHETIC_DISTANCE - radius, 120, (y) => {
    const inside = radius * radius - y * y;
    return inside > 0 ? Math.sqrt(inside) : 0;
  });
}

function revolve(radius: number, _top: number, heightMm: number, slices: number, axisX: number, axisZ: number): Silhouette {
  const yTop = -heightMm / 2;
  return revolveBody(yTop, heightMm / 2, axisX, axisZ, slices, () => radius);
}

function revolveBody(
  yTop: number,
  yBottom: number,
  axisX: number,
  axisZ: number,
  slices: number,
  radiusAtY: (y: number) => number,
): Silhouette {
  const minV = Array(SYNTHETIC_WIDTH).fill(Number.POSITIVE_INFINITY);
  const maxV = Array(SYNTHETIC_WIDTH).fill(Number.NEGATIVE_INFINITY);
  const steps = Math.max(2, slices);
  for (let slice = 0; slice < steps; slice += 1) {
    const y = yTop + ((yBottom - yTop) * slice) / (steps - 1);
    const radius = radiusAtY(y);
    if (!(radius > 0)) continue;
    const angles = Math.max(180, Math.floor(radius * 12));
    for (let step = 0; step < angles; step += 1) {
      const angle = (2 * Math.PI * step) / angles;
      const point = v3(axisX + radius * Math.cos(angle), y, axisZ + radius * Math.sin(angle));
      if (!(point.z > 1)) continue;
      const pixel = project(point);
      const column = roundHalfEven(pixel.x);
      if (column < 0 || column >= SYNTHETIC_WIDTH) continue;
      minV[column] = Math.min(minV[column], pixel.y);
      maxV[column] = Math.max(maxV[column], pixel.y);
    }
  }
  return maskFromColumns(minV, maxV);
}

export function quadMask(planeCenter: Vec2, widthMm: number, heightMm: number, tilt: number, axis: string, cardCenterX: number): Silhouette {
  const hx = widthMm / 2;
  const hy = heightMm / 2;
  const local = [
    v2(planeCenter.x - hx, planeCenter.y - hy),
    v2(planeCenter.x + hx, planeCenter.y - hy),
    v2(planeCenter.x + hx, planeCenter.y + hy),
    v2(planeCenter.x - hx, planeCenter.y + hy),
  ];
  const pixels = local.map((point) => project(add3(rotate(v3(point.x, point.y, 0), tilt, axis), v3(cardCenterX, 0, SYNTHETIC_DISTANCE))));
  return fillQuad(pixels);
}

export function filledMask(x0: number, x1: number, y0: number, y1: number): Silhouette {
  const pixels = new Uint8Array(SYNTHETIC_WIDTH * SYNTHETIC_HEIGHT);
  for (let row = y0; row < y1; row += 1) {
    for (let column = x0; column < x1; column += 1) pixels[row * SYNTHETIC_WIDTH + column] = 255;
  }
  return silhouette(SYNTHETIC_WIDTH, SYNTHETIC_HEIGHT, pixels);
}

function maskFromColumns(minV: number[], maxV: number[]): Silhouette {
  const pixels = new Uint8Array(SYNTHETIC_WIDTH * SYNTHETIC_HEIGHT);
  for (let column = 0; column < SYNTHETIC_WIDTH; column += 1) {
    if (!Number.isFinite(minV[column])) continue;
    const top = Math.max(0, Math.floor(minV[column]));
    const bottom = Math.min(SYNTHETIC_HEIGHT - 1, Math.ceil(maxV[column]));
    if (bottom >= top) {
      for (let row = top; row <= bottom; row += 1) pixels[row * SYNTHETIC_WIDTH + column] = 255;
    }
  }
  return silhouette(SYNTHETIC_WIDTH, SYNTHETIC_HEIGHT, pixels);
}

function fillQuad(corners: Vec2[]): Silhouette {
  const pixels = new Uint8Array(SYNTHETIC_WIDTH * SYNTHETIC_HEIGHT);
  const minY = Math.floor(Math.min(...corners.map((corner) => corner.y)));
  const maxY = Math.ceil(Math.max(...corners.map((corner) => corner.y)));
  const loop = [...corners, corners[0]];
  for (let row = Math.max(0, minY); row <= Math.min(SYNTHETIC_HEIGHT - 1, maxY); row += 1) {
    const y = row + 0.5;
    const hits: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      const a = loop[index];
      const b = loop[index + 1];
      if (((a.y <= y && y <= b.y) || (b.y <= y && y <= a.y)) && Math.abs(a.y - b.y) > 1e-9) {
        const t = (y - a.y) / (b.y - a.y);
        hits.push(a.x + t * (b.x - a.x));
      }
    }
    if (hits.length < 2) continue;
    const left = Math.floor(Math.min(...hits));
    const right = Math.ceil(Math.max(...hits));
    for (let column = Math.max(0, left); column <= Math.min(SYNTHETIC_WIDTH - 1, right); column += 1) {
      pixels[row * SYNTHETIC_WIDTH + column] = 255;
    }
  }
  return silhouette(SYNTHETIC_WIDTH, SYNTHETIC_HEIGHT, pixels);
}

function project(point: Vec3): Vec2 {
  return v2(
    (SYNTHETIC_INTRINSICS.fx * point.x) / point.z + SYNTHETIC_INTRINSICS.cx,
    (SYNTHETIC_INTRINSICS.fy * point.y) / point.z + SYNTHETIC_INTRINSICS.cy,
  );
}

function rotate(point: Vec3, degrees: number, axis: string): Vec3 {
  const radians = (degrees * Math.PI) / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  if (axis === "y") return v3(c * point.x + s * point.z, point.y, -s * point.x + c * point.z);
  return v3(point.x, c * point.y - s * point.z, s * point.y + c * point.z);
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return v3(a.x + b.x, a.y + b.y, a.z + b.z);
}

function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const frac = value - floor;
  if (frac > 0.5 + 1e-12) return floor + 1;
  if (frac < 0.5 - 1e-12) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

function splitMix(seed: bigint) {
  let state = seed;
  const mask = (1n << 64n) - 1n;
  const unit = () => {
    state = (state + 0x9E3779B97F4A7C15n) & mask;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & mask;
    z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & mask;
    z = (z ^ (z >> 31n)) & mask;
    return Number(z >> 11n) / 2 ** 53;
  };
  return {
    gaussian() {
      const u1 = Math.max(unit(), 1e-12);
      const u2 = unit();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
  };
}
