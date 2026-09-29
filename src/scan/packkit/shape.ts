import { standardDeviation } from "./measureMath.ts";

export type PartKind = "bottle" | "cap" | "label" | "pump" | "collar" | "box";
export type ShapeHint = "cylinder" | "taper" | "dome" | "sphere" | "cube" | "other";

export function classifyShape(radiiMm: number[], rectangleFit: number, kind: PartKind): ShapeHint {
  if (radiiMm.length < 4) return "other";
  const widest = radiiMm.reduce((best, value) => Math.max(best, value), 0);
  if (!(widest > 0)) return "other";
  if (kind === "label") return "other";
  if (kind === "box" && rectangleFit >= 0.95) return "cube";
  const unit = radiiMm.map((value) => value / widest);
  if (kind === "box") return rectangleFit >= 0.8 ? "cube" : "other";
  if (isSphere(unit)) return "sphere";
  if (isDome(unit)) return "dome";
  if (isTaper(unit)) return "taper";
  if (rectangleFit >= 0.9 || centralDeviation(unit) < 0.04) return "cylinder";
  return "other";
}

function sample(values: number[], t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  const position = clamped * (values.length - 1);
  const lower = Math.floor(position);
  const fraction = position - lower;
  if (lower >= values.length - 1) return values[values.length - 1];
  return values[lower] * (1 - fraction) + values[lower + 1] * fraction;
}

function isSphere(unit: number[]): boolean {
  const base = sample(unit, 0.08);
  const top = sample(unit, 0.92);
  const mid = sample(unit, 0.5);
  if (!(base < 0.7 && top < 0.7 && mid > 0.9 && Math.abs(base - top) < 0.12)) return false;
  let residual = 0;
  let energy = 0;
  for (let index = 0; index < unit.length; index += 1) {
    const t = index / (unit.length - 1);
    const expected = Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
    residual += (unit[index] - expected) ** 2;
    energy += expected * expected;
  }
  return energy > 0 && residual / energy < 0.04;
}

function isDome(unit: number[]): boolean {
  const shoulder = sample(unit, 0.62);
  const upper = sample(unit, 0.86);
  const crown = sample(unit, 0.97);
  const base = sample(unit, 0.15);
  const dropEarly = shoulder - upper;
  const dropLate = upper - crown;
  return base > 0.8 && shoulder > 0.9 && upper < 0.96 && crown < 0.82 && dropLate > dropEarly && dropLate > 0.04;
}

function isTaper(unit: number[]): boolean {
  const start = Math.max(1, Math.floor(unit.length / 12));
  const end = Math.min(unit.length - 1, unit.length - Math.floor(unit.length / 12));
  const body = unit.slice(start, end);
  if (body.length < 4) return false;
  const n = body.length;
  let sumT = 0;
  let sumR = 0;
  let sumTT = 0;
  let sumTR = 0;
  for (let index = 0; index < body.length; index += 1) {
    const t = index / (body.length - 1);
    sumT += t;
    sumR += body[index];
    sumTT += t * t;
    sumTR += t * body[index];
  }
  const denominator = n * sumTT - sumT * sumT;
  if (!(Math.abs(denominator) > 1e-9)) return false;
  const slope = (n * sumTR - sumT * sumR) / denominator;
  const intercept = (sumR - slope * sumT) / n;
  let residual = 0;
  let total = 0;
  const mean = sumR / n;
  for (let index = 0; index < body.length; index += 1) {
    const t = index / (body.length - 1);
    const predicted = intercept + slope * t;
    residual += (body[index] - predicted) ** 2;
    total += (body[index] - mean) ** 2;
  }
  const r2 = total < 1e-9 ? 1 : 1 - residual / total;
  const base = body[0] ?? 0;
  const top = body[body.length - 1] ?? 0;
  return r2 > 0.95 && Math.abs(slope) > 0.12 && Math.abs(base - top) > 0.12;
}

function centralDeviation(unit: number[]): number {
  const lower = Math.floor(unit.length / 5);
  const upper = Math.max(lower + 1, Math.floor((unit.length * 4) / 5));
  return standardDeviation(unit.slice(lower, upper));
}
