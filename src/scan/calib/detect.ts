import { quadAcceptable } from "./zhang.ts";
import type { Vec2 } from "../packkit/vec.ts";

export interface Raster {
  width: number;
  height: number;
  rgba: Uint8ClampedArray | Uint8Array;
}

/**
 * Finds one credit-card quad. Bright connected components are contoured, then
 * simplified; a gradient edge map is the fallback when the card is not the
 * brightest region. Corners are ordered top-left, top-right, bottom-right,
 * bottom-left in image pixels (Y down).
 */
export function detectCardQuad(image: Raster): Vec2[] | null {
  const scale = Math.max(1, Math.ceil(image.width / 480));
  const width = Math.floor(image.width / scale);
  const height = Math.floor(image.height / scale);
  if (width < 16 || height < 16) return null;
  const gray = new Float32Array(width * height);
  const edge = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(image.width - 1, x * scale + (scale >> 1));
      const sy = Math.min(image.height - 1, y * scale + (scale >> 1));
      const index = (sy * image.width + sx) * 4;
      gray[y * width + x] = 0.299 * image.rgba[index] + 0.587 * image.rgba[index + 1] + 0.114 * image.rgba[index + 2];
    }
  }
  let borderSum = 0;
  let borderCount = 0;
  for (let x = 0; x < width; x += 1) {
    borderSum += gray[x] + gray[(height - 1) * width + x];
    borderCount += 2;
  }
  for (let y = 1; y < height - 1; y += 1) {
    borderSum += gray[y * width] + gray[y * width + width - 1];
    borderCount += 2;
  }
  const background = borderSum / Math.max(1, borderCount);
  const bright = new Uint8Array(width * height);
  for (let index = 0; index < gray.length; index += 1) bright[index] = gray[index] > background + 28 ? 1 : 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const gx = gray[y * width + x + 1] - gray[y * width + x - 1];
      const gy = gray[(y + 1) * width + x] - gray[(y - 1) * width + x];
      edge[y * width + x] = Math.hypot(gx, gy);
    }
  }
  const fromBright = largestQuad(bright, width, height);
  const chosen = fromBright ?? largestQuad(edgeMask(edge), width, height);
  if (!chosen) return null;
  const lifted = chosen.map((point) => ({ x: (point.x + 0.5) * scale, y: (point.y + 0.5) * scale }));
  const ordered = orderQuad(lifted);
  return quadAcceptable(ordered) ? ordered : null;
}

function edgeMask(edge: Float32Array): Uint8Array {
  const values = Array.from(edge).sort((a, b) => a - b);
  const threshold = values[Math.floor(values.length * 0.9)] ?? 0;
  const mask = new Uint8Array(edge.length);
  for (let index = 0; index < edge.length; index += 1) if (edge[index] >= threshold && threshold > 8) mask[index] = 1;
  return mask;
}

function largestQuad(mask: Uint8Array, width: number, height: number): Vec2[] | null {
  const seen = new Uint8Array(mask.length);
  let best: Vec2[] | null = null;
  let bestArea = 0;
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    stack.push(start);
    seen[start] = 1;
    let count = 0;
    const pixels: number[] = [];
    while (stack.length) {
      const index = stack.pop()!;
      pixels.push(index);
      count += 1;
      const x = index % width;
      const neighbors = [index - 1, index + 1, index - width, index + width];
      for (const next of neighbors) {
        if (next < 0 || next >= mask.length || seen[next] || !mask[next]) continue;
        const nx = next % width;
        if (Math.abs(nx - x) > 1) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    if (count < 40) continue;
    const boundary = boundaryPoints(mask, width, height, pixels);
    const quad = boundary.length >= 4 ? simplifyQuad(boundary) : null;
    if (!quad) continue;
    const area = Math.abs(polygon(quad));
    if (area > bestArea) {
      best = quad;
      bestArea = area;
    }
  }
  return best;
}

function boundaryPoints(mask: Uint8Array, width: number, height: number, pixels: number[]): Vec2[] {
  const points: Vec2[] = [];
  for (const index of pixels) {
    const x = index % width;
    const y = (index - x) / width;
    if (!exposed(mask, width, height, x, y)) continue;
    points.push({ x, y });
  }
  if (points.length <= 1200) return points;
  const step = Math.ceil(points.length / 1200);
  return points.filter((_, index) => index % step === 0);
}

function exposed(mask: Uint8Array, width: number, height: number, x: number, y: number): boolean {
  if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return true;
  return !mask[y * width + x - 1] || !mask[y * width + x + 1] || !mask[(y - 1) * width + x] || !mask[(y + 1) * width + x];
}

function simplifyQuad(points: Vec2[]): Vec2[] | null {
  const hull = convexHull(points);
  if (hull.length < 4) return null;
  if (hull.length === 4) return hull;
  let epsilon = 1.2;
  let simplified = douglas(hull.concat(hull[0]), epsilon);
  if (simplified.length && simplified[0] === simplified[simplified.length - 1]) simplified = simplified.slice(0, -1);
  for (let attempt = 0; attempt < 6 && simplified.length > 4; attempt += 1) {
    epsilon *= 1.7;
    simplified = douglas(hull.concat(hull[0]), epsilon);
    if (simplified.length && simplified[0] === simplified[simplified.length - 1]) simplified = simplified.slice(0, -1);
  }
  if (simplified.length === 4) return simplified;
  const extreme = extremeQuad(hull);
  return extreme.length === 4 ? extreme : null;
}

function douglas(points: Vec2[], epsilon: number): Vec2[] {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let farthest = start;
    let distance = 0;
    for (let index = start + 1; index < end; index += 1) {
      const candidate = pointLineDistance(points[index], points[start], points[end]);
      if (candidate > distance) {
        distance = candidate;
        farthest = index;
      }
    }
    if (distance > epsilon) {
      keep[farthest] = 1;
      stack.push([start, farthest], [farthest, end]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

function pointLineDistance(point: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return Math.hypot(point.x - a.x, point.y - a.y);
  return Math.abs(dy * point.x - dx * point.y + b.x * a.y - b.y * a.x) / length;
}

function convexHull(points: Vec2[]): Vec2[] {
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const crossValue = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && crossValue(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Vec2[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (upper.length >= 2 && crossValue(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function extremeQuad(hull: Vec2[]): Vec2[] {
  const cx = hull.reduce((sum, point) => sum + point.x, 0) / hull.length;
  const cy = hull.reduce((sum, point) => sum + point.y, 0) / hull.length;
  const bins: Array<Vec2 | null> = [null, null, null, null];
  for (const point of hull) {
    const angle = Math.atan2(point.y - cy, point.x - cx);
    const bin = Math.floor(((angle + Math.PI) / (Math.PI / 2)) % 4);
    const current = bins[bin];
    const score = (point.x - cx) ** 2 + (point.y - cy) ** 2;
    if (!current || score > (current.x - cx) ** 2 + (current.y - cy) ** 2) bins[bin] = point;
  }
  return bins.filter((point): point is Vec2 => point != null);
}

function polygon(points: Vec2[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    sum += points[index].x * next.y - next.x * points[index].y;
  }
  return sum / 2;
}

export function orderQuad(points: Vec2[]): Vec2[] {
  const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const sorted = points.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let start = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].x + sorted[index].y < sorted[start].x + sorted[start].y) start = index;
  }
  const ordered = [0, 1, 2, 3].map((index) => sorted[(start + index) % 4]);
  if (ordered[1].x < ordered[0].x) return [ordered[0], ordered[3], ordered[2], ordered[1]];
  return ordered;
}
