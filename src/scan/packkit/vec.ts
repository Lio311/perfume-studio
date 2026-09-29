/**
 * Column-major 3×3 math matching `PoseMath.swift`.
 *
 * Ambiguity: `Mat3.inverse()` in Swift stores cofactors as columns, which is
 * the transpose of the mathematical inverse. `MeasureMath.inverse` transposes
 * that result back. Homography denormalisation calls the transposed inverse.
 * Both are ported as written so the web solver matches PackKit.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Mat3 {
  c0: Vec3;
  c1: Vec3;
  c2: Vec3;
}

export const ID1_WIDTH_MM = 85.6;
export const ID1_HEIGHT_MM = 53.98;

export function v2(x: number, y: number): Vec2 {
  return { x, y };
}

export function v3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function add2(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub2(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale2(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function add3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function scale3(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length3(a: Vec3): number {
  return Math.sqrt(dot3(a, a));
}

export function length2(a: Vec2): number {
  return Math.sqrt(a.x * a.x + a.y * a.y);
}

export const MAT3_IDENTITY: Mat3 = {
  c0: v3(1, 0, 0),
  c1: v3(0, 1, 0),
  c2: v3(0, 0, 1),
};

export function mat3(c0: Vec3, c1: Vec3, c2: Vec3): Mat3 {
  return { c0, c1, c2 };
}

export function col(m: Mat3, index: number): Vec3 {
  if (index === 0) return m.c0;
  if (index === 1) return m.c1;
  return m.c2;
}

export function determinant(m: Mat3): number {
  return dot3(m.c0, cross(m.c1, m.c2));
}

export function transpose(m: Mat3): Mat3 {
  return {
    c0: v3(m.c0.x, m.c1.x, m.c2.x),
    c1: v3(m.c0.y, m.c1.y, m.c2.y),
    c2: v3(m.c0.z, m.c1.z, m.c2.z),
  };
}

/** Swift `Mat3.inverse`: transpose of the mathematical inverse. */
export function inverseTransposed(m: Mat3): Mat3 | null {
  const det = determinant(m);
  if (!Number.isFinite(det) || Math.abs(det) <= 1e-12) return null;
  const invDet = 1 / det;
  return {
    c0: scale3(cross(m.c1, m.c2), invDet),
    c1: scale3(cross(m.c2, m.c0), invDet),
    c2: scale3(cross(m.c0, m.c1), invDet),
  };
}

/** Mathematical inverse. Swift `MeasureMath.inverse`. */
export function inverse(m: Mat3): Mat3 | null {
  const transposed = inverseTransposed(m);
  return transposed ? transpose(transposed) : null;
}

export function mulMat(lhs: Mat3, rhs: Mat3): Mat3 {
  return {
    c0: mulVec(lhs, rhs.c0),
    c1: mulVec(lhs, rhs.c1),
    c2: mulVec(lhs, rhs.c2),
  };
}

export function mulVec(lhs: Mat3, rhs: Vec3): Vec3 {
  return add3(add3(scale3(lhs.c0, rhs.x), scale3(lhs.c1, rhs.y)), scale3(lhs.c2, rhs.z));
}

export function mulScalar(lhs: Mat3, rhs: number): Mat3 {
  return { c0: scale3(lhs.c0, rhs), c1: scale3(lhs.c1, rhs), c2: scale3(lhs.c2, rhs) };
}

export function addMat(lhs: Mat3, rhs: Mat3): Mat3 {
  return {
    c0: add3(lhs.c0, rhs.c0),
    c1: add3(lhs.c1, rhs.c1),
    c2: add3(lhs.c2, rhs.c2),
  };
}

export function finite2(p: Vec2): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

export function finite3(p: Vec3): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}
