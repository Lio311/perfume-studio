import { inverse, type Mat3, type Vec2 } from "./vec.ts";

export function polygonArea(points: Vec2[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    sum += points[index].x * next.y - next.x * points[index].y;
  }
  return Math.abs(sum) / 2;
}

export function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const count = sorted.length;
  if (count === 0) return 0;
  if (count % 2 === 1) return sorted[Math.floor(count / 2)];
  return 0.5 * (sorted[count / 2 - 1] + sorted[count / 2]);
}

export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mid = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - mid) * (value - mid), 0) / values.length;
  return Math.sqrt(variance);
}

export function fitLine(samples: Array<{ v: number; u: number }>): { a: number; b: number } {
  const n = samples.length;
  if (n < 2) return { a: samples[0]?.u ?? 0, b: 0 };
  let sumV = 0;
  let sumU = 0;
  let sumVV = 0;
  let sumVU = 0;
  for (const sample of samples) {
    sumV += sample.v;
    sumU += sample.u;
    sumVV += sample.v * sample.v;
    sumVU += sample.v * sample.u;
  }
  const denominator = n * sumVV - sumV * sumV;
  if (Math.abs(denominator) < 1e-9) return { a: sumU / n, b: 0 };
  const slope = (n * sumVU - sumV * sumU) / denominator;
  const intercept = (sumU - slope * sumV) / n;
  return { a: intercept, b: slope };
}

export function resample(values: number[], count: number): number[] {
  if (count <= 0) return [];
  const first = values[0];
  if (first === undefined) return Array(count).fill(0);
  if (values.length === 1 || count === 1) return Array(count).fill(first);
  return Array.from({ length: count }, (_, index) => {
    const position = (index / (count - 1)) * (values.length - 1);
    const lower = Math.floor(position);
    const fraction = position - lower;
    if (lower >= values.length - 1) return values[values.length - 1];
    return values[lower] * (1 - fraction) + values[lower + 1] * fraction;
  });
}

export function rowMajor(matrix: Mat3): number[] {
  return [
    matrix.c0.x, matrix.c1.x, matrix.c2.x,
    matrix.c0.y, matrix.c1.y, matrix.c2.y,
    matrix.c0.z, matrix.c1.z, matrix.c2.z,
  ];
}

export function applyHomography(rowMajorValues: number[], point: Vec2): Vec2 | null {
  if (rowMajorValues.length !== 9) return null;
  const x = rowMajorValues[0] * point.x + rowMajorValues[1] * point.y + rowMajorValues[2];
  const y = rowMajorValues[3] * point.x + rowMajorValues[4] * point.y + rowMajorValues[5];
  const w = rowMajorValues[6] * point.x + rowMajorValues[7] * point.y + rowMajorValues[8];
  if (!Number.isFinite(w) || Math.abs(w) <= 1e-12) return null;
  return { x: x / w, y: y / w };
}

export function hypot3(a: number, b: number, c: number): number {
  return Math.sqrt(a * a + b * b + c * c);
}

export function trueInverse(matrix: Mat3): Mat3 | null {
  return inverse(matrix);
}

/** Swift `String(format: "%g")` for the reference labels used by ScaleSolver. */
export function formatG(value: number): string {
  if (!Number.isFinite(value)) return "nan";
  const text = value.toPrecision(6);
  if (text.includes("e") || text.includes("E")) return text.replace(/\.?0+e/, "e").replace("e+", "e+");
  return String(Number(text));
}
