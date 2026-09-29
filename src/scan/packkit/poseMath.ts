import {
  add2,
  add3,
  addMat,
  type Mat3,
  MAT3_IDENTITY,
  mat3,
  mulMat,
  mulScalar,
  mulVec,
  scale2,
  scale3,
  sub2,
  transpose,
  v2,
  v3,
  type Vec2,
  type Vec3,
  cross,
  determinant,
  dot3,
  inverseTransposed,
  length2,
  length3,
} from "./vec.ts";

export interface CameraIntrinsics {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
}

export interface PixelSize {
  width: number;
  height: number;
}

export interface CardReference {
  widthMm: number;
  heightMm: number;
}

export const ID1: CardReference = { widthMm: 85.6, heightMm: 53.98 };

export function intrinsicsFinite(k: CameraIntrinsics): boolean {
  return Number.isFinite(k.fx) && Number.isFinite(k.fy) && Number.isFinite(k.cx) && Number.isFinite(k.cy) && k.fx > 0 && k.fy > 0;
}

export function cardFinite(card: CardReference): boolean {
  return Number.isFinite(card.widthMm) && Number.isFinite(card.heightMm) && card.widthMm > 0 && card.heightMm > 0;
}

export function sameCard(a: CardReference, b: CardReference): boolean {
  return a.widthMm === b.widthMm && a.heightMm === b.heightMm;
}

export interface Pose {
  rotation: Mat3;
  translation: Vec3;
  rmse: number;
}

export function modelCorners(reference: CardReference): Vec3[] {
  const w = reference.widthMm / 2;
  const h = reference.heightMm / 2;
  return [v3(-w, -h, 0), v3(w, -h, 0), v3(w, h, 0), v3(-w, h, 0)];
}

export function intrinsicsMatrix(k: CameraIntrinsics): Mat3 {
  return mat3(v3(k.fx, 0, 0), v3(0, k.fy, 0), v3(k.cx, k.cy, 1));
}

export function project(point: Vec3, rotation: Mat3, translation: Vec3, intrinsics: CameraIntrinsics): Vec2 | null {
  const camera = add3(mulVec(rotation, point), translation);
  if (!(camera.z > 1e-6)) return null;
  return v2(
    (intrinsics.fx * camera.x) / camera.z + intrinsics.cx,
    (intrinsics.fy * camera.y) / camera.z + intrinsics.cy,
  );
}

export function rodrigues(w: Vec3): Mat3 {
  const theta2 = dot3(w, w);
  if (theta2 < 1e-16) {
    return mat3(v3(1, w.z, -w.y), v3(-w.z, 1, w.x), v3(w.y, -w.x, 1));
  }
  const theta = Math.sqrt(theta2);
  const k = scale3(w, 1 / theta);
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const skew = mat3(v3(0, k.z, -k.y), v3(-k.z, 0, k.x), v3(k.y, -k.x, 0));
  const outer = mat3(scale3(k, k.x), scale3(k, k.y), scale3(k, k.z));
  return addMat(addMat(mulScalar(MAT3_IDENTITY, c), mulScalar(outer, 1 - c)), mulScalar(skew, s));
}

export function rodriguesInverse(rotation: Mat3): Vec3 {
  const trace = rotation.c0.x + rotation.c1.y + rotation.c2.z;
  const theta = Math.acos(Math.min(1, Math.max(-1, (trace - 1) / 2)));
  const vee = v3(
    rotation.c1.z - rotation.c2.y,
    rotation.c2.x - rotation.c0.z,
    rotation.c0.y - rotation.c1.x,
  );
  if (theta < 1e-8) return scale3(vee, 0.5);
  return scale3(vee, theta / (2 * Math.sin(theta)));
}

export function closestRotation(matrix: Mat3): Mat3 {
  const { u, vt } = svd3(matrix);
  let rotation = mulMat(u, vt);
  if (determinant(rotation) < 0) {
    const flipped = { c0: u.c0, c1: u.c1, c2: scale3(u.c2, -1) };
    rotation = mulMat(flipped, vt);
  }
  return rotation;
}

export function homography(source: Vec2[], destination: Vec2[]): Mat3 | null {
  if (source.length !== 4 || destination.length !== 4) return null;
  const src = normalize(source);
  const dst = normalize(destination);
  const rows: number[][] = Array.from({ length: 8 }, () => Array(9).fill(0));
  for (let index = 0; index < 4; index += 1) {
    const x = src.points[index].x;
    const y = src.points[index].y;
    const u = dst.points[index].x;
    const v = dst.points[index].y;
    rows[2 * index] = [-x, -y, -1, 0, 0, 0, u * x, u * y, u];
    rows[2 * index + 1] = [0, 0, 0, -x, -y, -1, v * x, v * y, v];
  }
  const h = smallestEigenvector(gram(rows));
  if (!h || h.length !== 9) return null;
  const normalized = mat3(v3(h[0], h[3], h[6]), v3(h[1], h[4], h[7]), v3(h[2], h[5], h[8]));
  const dstInverse = inverseTransposed(dst.transform);
  if (!dstInverse) return null;
  const result = mulMat(mulMat(dstInverse, normalized), src.transform);
  if (!Number.isFinite(result.c0.x)) return null;
  return result;
}

export function poseCandidates(
  homographyMatrix: Mat3,
  intrinsics: CameraIntrinsics,
): Array<{ rotation: Mat3; translation: Vec3 }> {
  const kInverse = inverseTransposed(intrinsicsMatrix(intrinsics));
  if (!kInverse) return [];
  const m = mulMat(kInverse, homographyMatrix);
  const poses: Array<{ rotation: Mat3; translation: Vec3 }> = [];
  for (const sign of [1, -1]) {
    const scaled = mulScalar(m, sign);
    const n1 = length3(scaled.c0);
    const n2 = length3(scaled.c1);
    if (!(n1 > 1e-9) || !(n2 > 1e-9)) continue;
    const norm = (n1 + n2) / 2;
    const r1 = scale3(scaled.c0, 1 / norm);
    const r2 = scale3(scaled.c1, 1 / norm);
    const r3 = cross(r1, r2);
    const translation = scale3(scaled.c2, 1 / norm);
    const rotation = closestRotation(mat3(r1, r2, r3));
    if (!Number.isFinite(translation.z) || !Number.isFinite(rotation.c0.x)) continue;
    poses.push({ rotation, translation });
    poses.push({ rotation: mulScalar(rotation, -1), translation: scale3(translation, -1) });
  }
  return poses;
}

export function refine(
  rotation: Mat3,
  translation: Vec3,
  objectPoints: Vec3[],
  imagePoints: Vec2[],
  intrinsics: CameraIntrinsics,
): Pose | null {
  let w = rodriguesInverse(rotation);
  let t = { ...translation };
  if (!Number.isFinite(w.x) || !Number.isFinite(t.x)) return null;
  let lambda = 1e-2;
  let best = residualSum(w, t, objectPoints, imagePoints, intrinsics);
  if (!Number.isFinite(best)) return null;
  const steps = [1e-6, 1e-6, 1e-6, 1e-3, 1e-3, 1e-3];
  for (let iteration = 0; iteration < 16; iteration += 1) {
    if (best < 1e-6) break;
    const jacobian: number[][] = Array.from({ length: 8 }, () => Array(6).fill(0));
    const base = residualVector(w, t, objectPoints, imagePoints, intrinsics);
    for (let column = 0; column < 6; column += 1) {
      const w2 = { ...w };
      const t2 = { ...t };
      if (column === 0) w2.x += steps[column];
      else if (column === 1) w2.y += steps[column];
      else if (column === 2) w2.z += steps[column];
      else if (column === 3) t2.x += steps[column];
      else if (column === 4) t2.y += steps[column];
      else t2.z += steps[column];
      const bumped = residualVector(w2, t2, objectPoints, imagePoints, intrinsics);
      for (let row = 0; row < 8; row += 1) jacobian[row][column] = (bumped[row] - base[row]) / steps[column];
    }
    const columnScale = [1, 1, 1, 1, 1, 1];
    for (let column = 0; column < 6; column += 1) {
      let sum = 0;
      for (let row = 0; row < 8; row += 1) sum += jacobian[row][column] * jacobian[row][column];
      columnScale[column] = Math.max(Math.sqrt(sum), 1e-12);
      for (let row = 0; row < 8; row += 1) jacobian[row][column] /= columnScale[column];
    }
    const normal: number[][] = Array.from({ length: 6 }, () => Array(6).fill(0));
    const right = [0, 0, 0, 0, 0, 0];
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 6; column += 1) {
        right[column] += jacobian[row][column] * base[row];
        for (let other = 0; other < 6; other += 1) {
          normal[column][other] += jacobian[row][column] * jacobian[row][other];
        }
      }
    }
    for (let column = 0; column < 6; column += 1) normal[column][column] += lambda;
    const solved = solve(normal, right.map((value) => -value));
    if (!solved) {
      lambda = Math.min(lambda * 10, 1e8);
      continue;
    }
    const delta = solved.map((value, column) => value / columnScale[column]);
    const stepW = v3(delta[0], delta[1], delta[2]);
    const stepT = v3(delta[3], delta[4], delta[5]);
    if (length3(stepW) > 0.6 || length3(stepT) > 80) {
      lambda = Math.min(lambda * 10, 1e8);
      continue;
    }
    const trialW = add3(w, stepW);
    const trialT = add3(t, stepT);
    const trial = residualSum(trialW, trialT, objectPoints, imagePoints, intrinsics);
    if (Number.isFinite(trial) && trial < best) {
      w = trialW;
      t = trialT;
      best = trial;
      lambda = Math.max(lambda / 10, 1e-8);
    } else {
      lambda = Math.min(lambda * 10, 1e8);
    }
  }
  if (!(t.z > 1) || !Number.isFinite(best)) return null;
  return { rotation: rodrigues(w), translation: t, rmse: Math.sqrt(best / 8) };
}

export function widthOnlyDepth(imagePoints: Vec2[], widthMm: number, fx: number): number | null {
  if (imagePoints.length !== 4 || !(fx > 0) || !(widthMm > 0)) return null;
  const top = length2(sub2(imagePoints[1], imagePoints[0]));
  const bottom = length2(sub2(imagePoints[2], imagePoints[3]));
  const pixels = (top + bottom) / 2;
  if (!(pixels > 1)) return null;
  return (fx * widthMm) / pixels;
}

export function tiltDegrees(rotation: Mat3): number {
  const cosine = Math.min(1, Math.max(0, Math.abs(rotation.c2.z)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

export function cycles(points: Vec2[]): Vec2[][] {
  if (points.length !== 4) return [];
  return [0, 1, 2, 3].map((shift) => [0, 1, 2, 3].map((index) => points[(index + shift) % 4]));
}

function residualVector(
  w: Vec3,
  t: Vec3,
  objectPoints: Vec3[],
  imagePoints: Vec2[],
  intrinsics: CameraIntrinsics,
): number[] {
  const rotation = rodrigues(w);
  const values = Array(8).fill(1000);
  for (let index = 0; index < 4; index += 1) {
    const projected = project(objectPoints[index], rotation, t, intrinsics);
    if (!projected) continue;
    values[2 * index] = projected.x - imagePoints[index].x;
    values[2 * index + 1] = projected.y - imagePoints[index].y;
  }
  return values;
}

function residualSum(
  w: Vec3,
  t: Vec3,
  objectPoints: Vec3[],
  imagePoints: Vec2[],
  intrinsics: CameraIntrinsics,
): number {
  return residualVector(w, t, objectPoints, imagePoints, intrinsics).reduce((sum, value) => sum + value * value, 0);
}

function normalize(points: Vec2[]): { points: Vec2[]; transform: Mat3 } {
  let mean = v2(0, 0);
  for (const point of points) mean = add2(mean, point);
  mean = scale2(mean, 1 / points.length);
  let distance = 0;
  for (const point of points) distance += length2(sub2(point, mean));
  const scale = Math.SQRT2 * points.length / Math.max(distance, 1e-9);
  const transform = mat3(v3(scale, 0, 0), v3(0, scale, 0), v3(-scale * mean.x, -scale * mean.y, 1));
  const normalized = points.map((point) => v2(scale * (point.x - mean.x), scale * (point.y - mean.y)));
  return { points: normalized, transform };
}

function gram(rows: number[][]): number[][] {
  const cols = rows[0].length;
  const matrix = Array.from({ length: cols }, () => Array(cols).fill(0));
  for (let column = 0; column < cols; column += 1) {
    for (let other = column; other < cols; other += 1) {
      let sum = 0;
      for (const row of rows) sum += row[column] * row[other];
      matrix[column][other] = sum;
      matrix[other][column] = sum;
    }
  }
  return matrix;
}

function smallestEigenvector(matrix: number[][]): number[] | null {
  const { values, vectors } = jacobi(matrix);
  let index = 0;
  for (let cursor = 1; cursor < values.length; cursor += 1) {
    if (values[cursor] < values[index]) index = cursor;
  }
  if (!values.length) return null;
  return vectors.map((row) => row[index]);
}

function jacobi(original: number[][]): { values: number[]; vectors: number[][] } {
  const n = original.length;
  const a = original.map((row) => row.slice());
  const vectors = Array.from({ length: n }, () => Array(n).fill(0));
  for (let index = 0; index < n; index += 1) vectors[index][index] = 1;
  for (let sweep = 0; sweep < 40; sweep += 1) {
    let pivotRow = 0;
    let pivotCol = 1;
    let largest = 0;
    for (let row = 0; row < n; row += 1) {
      for (let col = row + 1; col < n; col += 1) {
        if (Math.abs(a[row][col]) > largest) {
          largest = Math.abs(a[row][col]);
          pivotRow = row;
          pivotCol = col;
        }
      }
    }
    if (largest < 1e-14) break;
    const app = a[pivotRow][pivotRow];
    const aqq = a[pivotCol][pivotCol];
    const apq = a[pivotRow][pivotCol];
    const tau = (aqq - app) / (2 * apq);
    const tangent = tau >= 0 ? 1 / (tau + Math.sqrt(1 + tau * tau)) : -1 / (-tau + Math.sqrt(1 + tau * tau));
    const cosine = 1 / Math.sqrt(1 + tangent * tangent);
    const sine = tangent * cosine;
    for (let k = 0; k < n; k += 1) {
      if (k === pivotRow || k === pivotCol) continue;
      const aik = a[k][pivotRow];
      const akq = a[k][pivotCol];
      a[k][pivotRow] = cosine * aik - sine * akq;
      a[pivotRow][k] = a[k][pivotRow];
      a[k][pivotCol] = sine * aik + cosine * akq;
      a[pivotCol][k] = a[k][pivotCol];
    }
    a[pivotRow][pivotRow] = cosine * cosine * app - 2 * sine * cosine * apq + sine * sine * aqq;
    a[pivotCol][pivotCol] = sine * sine * app + 2 * sine * cosine * apq + cosine * cosine * aqq;
    a[pivotRow][pivotCol] = 0;
    a[pivotCol][pivotRow] = 0;
    for (let k = 0; k < n; k += 1) {
      const vip = vectors[k][pivotRow];
      const viq = vectors[k][pivotCol];
      vectors[k][pivotRow] = cosine * vip - sine * viq;
      vectors[k][pivotCol] = sine * vip + cosine * viq;
    }
  }
  return { values: a.map((row, index) => row[index]), vectors };
}

function svd3(matrix: Mat3): { u: Mat3; s: Vec3; vt: Mat3 } {
  const ata = mulMat(transpose(matrix), matrix);
  const entries = [
    [ata.c0.x, ata.c1.x, ata.c2.x],
    [ata.c0.y, ata.c1.y, ata.c2.y],
    [ata.c0.z, ata.c1.z, ata.c2.z],
  ];
  const { values, vectors } = jacobi(entries);
  const order = [0, 1, 2].sort((left, right) => values[right] - values[left]);
  const singular = v3(
    Math.sqrt(Math.max(0, values[order[0]])),
    Math.sqrt(Math.max(0, values[order[1]])),
    Math.sqrt(Math.max(0, values[order[2]])),
  );
  const column = (index: number): Vec3 => {
    const row = order[index];
    return v3(vectors[0][row], vectors[1][row], vectors[2][row]);
  };
  const v = mat3(column(0), column(1), column(2));
  const uColumn = (index: number, vColumn: Vec3): Vec3 => {
    const sigma = index === 0 ? singular.x : index === 1 ? singular.y : singular.z;
    const mapped = mulVec(matrix, vColumn);
    if (sigma > 1e-12) return scale3(mapped, 1 / sigma);
    const len = length3(mapped);
    if (len > 0) return scale3(mapped, 1 / len);
    return v3(index === 0 ? 1 : 0, index === 1 ? 1 : 0, index === 2 ? 1 : 0);
  };
  let u = mat3(uColumn(0, v.c0), uColumn(1, v.c1), uColumn(2, v.c2));
  if (determinant(u) < 0) u = { c0: u.c0, c1: u.c1, c2: scale3(u.c2, -1) };
  return { u, s: singular, vt: transpose(v) };
}

function solve(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const a = matrix.map((row) => row.slice());
  const b = rhs.slice();
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    let best = Math.abs(a[column][column]);
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(a[row][column]) > best) {
        best = Math.abs(a[row][column]);
        pivot = row;
      }
    }
    if (best < 1e-14) return null;
    if (pivot !== column) {
      const row = a[column];
      a[column] = a[pivot];
      a[pivot] = row;
      const value = b[column];
      b[column] = b[pivot];
      b[pivot] = value;
    }
    for (let row = column + 1; row < n; row += 1) {
      const factor = a[row][column] / a[column][column];
      b[row] -= factor * b[column];
      for (let other = column; other < n; other += 1) a[row][other] -= factor * a[column][other];
    }
  }
  const solution = Array(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = b[row];
    for (let column = row + 1; column < n; column += 1) sum -= a[row][column] * solution[column];
    solution[row] = sum / a[row][row];
  }
  return solution.every((value) => Number.isFinite(value)) ? solution : null;
}
