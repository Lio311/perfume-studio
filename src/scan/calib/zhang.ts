import { closestRotation, rodrigues, rodriguesInverse } from "../packkit/poseMath.ts";
import {
  add3,
  cross,
  determinant,
  inverse,
  length3,
  type Mat3,
  mat3,
  mulMat,
  mulVec,
  scale3,
  v2,
  v3,
  type Vec2,
  type Vec3,
} from "../packkit/vec.ts";
import { ID1_HEIGHT_MM, ID1_WIDTH_MM } from "../packkit/vec.ts";

export interface IntrinsicsEstimate {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  k1: number;
  k2: number;
  reprojectionPx: number;
  views: number;
  rejected: number;
}

export interface CalibrationView {
  /** Image corners, top-left, top-right, bottom-right, bottom-left. */
  corners: Vec2[];
}

const OBJECT: Vec2[] = [
  v2(-ID1_WIDTH_MM / 2, -ID1_HEIGHT_MM / 2),
  v2(ID1_WIDTH_MM / 2, -ID1_HEIGHT_MM / 2),
  v2(ID1_WIDTH_MM / 2, ID1_HEIGHT_MM / 2),
  v2(-ID1_WIDTH_MM / 2, ID1_HEIGHT_MM / 2),
];

const MIN_VIEWS = 6;
const MAX_VIEW_ERROR = 2.5;

/** A calibration still of the ID-1 card: convex, large enough, and not an extreme sliver. */
export function quadAcceptable(corners: Vec2[]): boolean {
  if (corners.length !== 4 || !corners.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) return false;
  let area = 0;
  for (let index = 0; index < 4; index += 1) {
    const next = corners[(index + 1) % 4];
    area += corners[index].x * next.y - next.x * corners[index].y;
  }
  if (Math.abs(area) < 800) return false;
  let crossSign = 0;
  for (let index = 0; index < 4; index += 1) {
    const a = corners[index];
    const b = corners[(index + 1) % 4];
    const c = corners[(index + 2) % 4];
    const crossValue = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(crossValue) < 1e-6) return false;
    const sign = crossValue > 0 ? 1 : -1;
    if (crossSign === 0) crossSign = sign;
    else if (sign !== crossSign) return false;
  }
  const edges = [0, 1, 2, 3].map((index) => {
    const next = corners[(index + 1) % 4];
    return Math.hypot(next.x - corners[index].x, next.y - corners[index].y);
  });
  if (edges.some((edge) => edge < 24)) return false;
  const lengths = [(edges[0] + edges[2]) / 2, (edges[1] + edges[3]) / 2].sort((a, b) => b - a);
  const aspect = lengths[0] / lengths[1];
  return aspect >= 1.05 && aspect <= 3.4;
}

/**
 * Zhang closed-form intrinsics from planar homographies, then Levenberg-Marquardt
 * on fx, fy, cx, cy, k1, k2 and each view's pose. A view whose reprojection stays
 * above 2.5 px is dropped and the fit is repeated when at least six remain.
 */
export function calibrateViews(views: CalibrationView[]): IntrinsicsEstimate | null {
  const finite = views.filter((view) => view.corners.length === 4 && view.corners.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
  const usable = finite.filter((view) => quadAcceptable(view.corners));
  const geometricRejects = finite.length - usable.length;
  if (usable.length < MIN_VIEWS) return null;
  const first = fit(usable);
  if (!first) return null;
  const kept = usable.filter((_, index) => first.viewErrorPx[index] <= MAX_VIEW_ERROR);
  const rejected = geometricRejects + (usable.length - kept.length);
  if (kept.length < MIN_VIEWS) return null;
  const finalFit = rejected === 0 ? first : fit(kept);
  if (!finalFit || !(finalFit.reprojectionPx < 5)) return null;
  return { ...finalFit, views: kept.length, rejected };
}

function fit(views: CalibrationView[]): (Omit<IntrinsicsEstimate, "views" | "rejected"> & { viewErrorPx: number[] }) | null {
  const homographies = views.map((view) => dlt(OBJECT, view.corners));
  if (homographies.some((item) => item == null)) return null;
  const known = homographies as Mat3[];
  const linear = zhangIntrinsics(known);
  if (!linear) return null;
  const poses = known.map((homography) => poseFromHomography(homography, linear));
  if (poses.some((pose) => pose == null)) return null;
  return refine(views, linear, poses as Array<{ rotation: Mat3; translation: Vec3 }>);
}

function zhangIntrinsics(homographies: Mat3[]): { fx: number; fy: number; cx: number; cy: number } | null {
  const rows: number[][] = [];
  for (const homography of homographies) {
    const h1 = homography.c0;
    const h2 = homography.c1;
    rows.push(vij(h1, h2));
    const v11 = vij(h1, h1);
    const v22 = vij(h2, h2);
    rows.push(v11.map((value, index) => value - v22[index]));
  }
  const b = smallestEigenvector(gram(rows));
  if (!b) return null;
  return extractK(b) ?? extractK(b.map((value) => -value));
}

function vij(hi: Vec3, hj: Vec3): number[] {
  return [
    hi.x * hj.x,
    hi.x * hj.y + hi.y * hj.x,
    hi.y * hj.y,
    hi.z * hj.x + hi.x * hj.z,
    hi.z * hj.y + hi.y * hj.z,
    hi.z * hj.z,
  ];
}

function extractK(b: number[]): { fx: number; fy: number; cx: number; cy: number } | null {
  const [b11, b12, b22, b13, b23, b33] = b;
  const denom = b11 * b22 - b12 * b12;
  if (!(Math.abs(b11) > 1e-12) || !(Math.abs(denom) > 1e-14)) return null;
  const cy = (b12 * b13 - b11 * b23) / denom;
  const lambda = b33 - (b13 * b13 + cy * (b12 * b13 - b11 * b23)) / b11;
  if (!(lambda / b11 > 0) || !(lambda * b11 / denom > 0)) return null;
  const fx = Math.sqrt(lambda / b11);
  const fy = Math.sqrt((lambda * b11) / denom);
  const skew = (-b12 * fx * fx * fy) / lambda;
  const cx = (skew * cy) / fy - (b13 * fx * fx) / lambda;
  if (![fx, fy, cx, cy].every((value) => Number.isFinite(value)) || !(fx > 1) || !(fy > 1)) return null;
  return { fx, fy, cx, cy };
}

function poseFromHomography(homography: Mat3, k: { fx: number; fy: number; cx: number; cy: number }): { rotation: Mat3; translation: Vec3 } | null {
  const camera = mat3(v3(k.fx, 0, 0), v3(0, k.fy, 0), v3(k.cx, k.cy, 1));
  const inverted = inverse(camera);
  if (!inverted) return null;
  const m = mulMat(inverted, homography);
  const n1 = length3(m.c0);
  const n2 = length3(m.c1);
  if (!(n1 > 1e-9) || !(n2 > 1e-9)) return null;
  const norm = (n1 + n2) / 2;
  let r1 = scale3(m.c0, 1 / norm);
  let r2 = scale3(m.c1, 1 / norm);
  let r3 = cross(r1, r2);
  let translation = scale3(m.c2, 1 / norm);
  if (translation.z < 0) {
    r1 = scale3(r1, -1);
    r2 = scale3(r2, -1);
    r3 = scale3(r3, -1);
    translation = scale3(translation, -1);
  }
  const rotation = closestRotation(mat3(r1, r2, r3));
  if (determinant(rotation) < 0 || !(translation.z > 0)) return null;
  return { rotation, translation };
}

interface Packed {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  k1: number;
  k2: number;
  poses: Array<{ w: Vec3; t: Vec3 }>;
}

function refine(
  views: CalibrationView[],
  linear: { fx: number; fy: number; cx: number; cy: number },
  poses: Array<{ rotation: Mat3; translation: Vec3 }>,
): (Omit<IntrinsicsEstimate, "views" | "rejected"> & { viewErrorPx: number[] }) | null {
  const state: Packed = {
    fx: linear.fx,
    fy: linear.fy,
    cx: linear.cx,
    cy: linear.cy,
    k1: 0,
    k2: 0,
    poses: poses.map((pose) => ({ w: rodriguesInverse(pose.rotation), t: { ...pose.translation } })),
  };
  const count = 6 + views.length * 6;
  let lambda = 1e-3;
  let best = residualSum(views, state);
  if (!Number.isFinite(best)) return null;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    if (best < 1e-4) break;
    const base = residualVector(views, state);
    const jacobian: number[][] = Array.from({ length: base.length }, () => Array(count).fill(0));
    for (let column = 0; column < count; column += 1) {
      const step = parameterStep(column);
      const bumped = residualVector(views, bump(state, column, step));
      for (let row = 0; row < base.length; row += 1) jacobian[row][column] = (bumped[row] - base[row]) / step;
    }
    const columnScale = Array(count).fill(1);
    for (let column = 0; column < count; column += 1) {
      let sum = 0;
      for (let row = 0; row < base.length; row += 1) sum += jacobian[row][column] ** 2;
      columnScale[column] = Math.max(Math.sqrt(sum), 1e-12);
      for (let row = 0; row < base.length; row += 1) jacobian[row][column] /= columnScale[column];
    }
    const normal: number[][] = Array.from({ length: count }, () => Array(count).fill(0));
    const right = Array(count).fill(0);
    for (let row = 0; row < base.length; row += 1) {
      for (let column = 0; column < count; column += 1) {
        right[column] += jacobian[row][column] * base[row];
        for (let other = 0; other < count; other += 1) normal[column][other] += jacobian[row][column] * jacobian[row][other];
      }
    }
    for (let column = 0; column < count; column += 1) normal[column][column] += lambda;
    const delta = solveLinear(normal, right.map((value) => -value));
    if (!delta) {
      lambda = Math.min(lambda * 8, 1e8);
      continue;
    }
    const scaled = delta.map((value, column) => value / columnScale[column]);
    const trial = applyDelta(state, scaled);
    const score = residualSum(views, trial);
    if (Number.isFinite(score) && score < best) {
      Object.assign(state, trial, { poses: trial.poses });
      state.fx = trial.fx;
      state.fy = trial.fy;
      state.cx = trial.cx;
      state.cy = trial.cy;
      state.k1 = trial.k1;
      state.k2 = trial.k2;
      state.poses = trial.poses;
      best = score;
      lambda = Math.max(lambda / 8, 1e-8);
    } else {
      lambda = Math.min(lambda * 8, 1e8);
    }
  }
  const values = residualVector(views, state);
  const viewErrorPx = views.map((_, index) => {
    let sum = 0;
    for (let offset = 0; offset < 8; offset += 1) sum += values[index * 8 + offset] ** 2;
    return Math.sqrt(sum / 8);
  });
  const rmse = Math.sqrt(best / (views.length * 8));
  if (![state.fx, state.fy, state.cx, state.cy, state.k1, state.k2, rmse].every(Number.isFinite)) return null;
  if (!(state.fx > 1) || !(state.fy > 1)) return null;
  return { fx: state.fx, fy: state.fy, cx: state.cx, cy: state.cy, k1: state.k1, k2: state.k2, reprojectionPx: rmse, viewErrorPx };
}

function parameterStep(column: number): number {
  const local = column < 6 ? column : (column - 6) % 6;
  if (column < 6) return [0.05, 0.05, 0.05, 0.05, 1e-5, 1e-5][column];
  return local < 3 ? 1e-6 : 1e-3;
}

function bump(state: Packed, column: number, step: number): Packed {
  return applyDelta(state, Array.from({ length: 6 + state.poses.length * 6 }, (_, index) => (index === column ? step : 0)));
}

function applyDelta(state: Packed, delta: number[]): Packed {
  return {
    fx: Math.max(1, state.fx + delta[0]),
    fy: Math.max(1, state.fy + delta[1]),
    cx: state.cx + delta[2],
    cy: state.cy + delta[3],
    k1: state.k1 + delta[4],
    k2: state.k2 + delta[5],
    poses: state.poses.map((pose, index) => {
      const offset = 6 + index * 6;
      return {
        w: add3(pose.w, v3(delta[offset], delta[offset + 1], delta[offset + 2])),
        t: add3(pose.t, v3(delta[offset + 3], delta[offset + 4], delta[offset + 5])),
      };
    }),
  };
}

function residualVector(views: CalibrationView[], state: Packed): number[] {
  const values: number[] = [];
  for (let index = 0; index < views.length; index += 1) {
    const pose = state.poses[index];
    const rotation = rodrigues(pose.w);
    for (let corner = 0; corner < 4; corner += 1) {
      const projected = projectDistorted(OBJECT[corner], rotation, pose.t, state);
      const observed = views[index].corners[corner];
      if (!projected) {
        values.push(1000, 1000);
      } else {
        values.push(projected.x - observed.x, projected.y - observed.y);
      }
    }
  }
  return values;
}

function residualSum(views: CalibrationView[], state: Packed): number {
  return residualVector(views, state).reduce((sum, value) => sum + value * value, 0);
}

export function projectDistorted(
  point: Vec2,
  rotation: Mat3,
  translation: Vec3,
  camera: { fx: number; fy: number; cx: number; cy: number; k1: number; k2: number },
): Vec2 | null {
  const cameraPoint = add3(mulVec(rotation, v3(point.x, point.y, 0)), translation);
  if (!(cameraPoint.z > 1e-6)) return null;
  const x = cameraPoint.x / cameraPoint.z;
  const y = cameraPoint.y / cameraPoint.z;
  const r2 = x * x + y * y;
  const radial = 1 + camera.k1 * r2 + camera.k2 * r2 * r2;
  return v2(camera.fx * x * radial + camera.cx, camera.fy * y * radial + camera.cy);
}

export function undistort(point: Vec2, camera: { fx: number; fy: number; cx: number; cy: number; k1: number; k2: number }): Vec2 {
  const xd = (point.x - camera.cx) / camera.fx;
  const yd = (point.y - camera.cy) / camera.fy;
  let x = xd;
  let y = yd;
  for (let index = 0; index < 8; index += 1) {
    const r2 = x * x + y * y;
    const radial = 1 + camera.k1 * r2 + camera.k2 * r2 * r2;
    if (Math.abs(radial) < 1e-8) break;
    x = xd / radial;
    y = yd / radial;
  }
  return v2(x * camera.fx + camera.cx, y * camera.fy + camera.cy);
}

function dlt(source: Vec2[], destination: Vec2[]): Mat3 | null {
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
  if (!h) return null;
  const normalized = mat3(v3(h[0], h[3], h[6]), v3(h[1], h[4], h[7]), v3(h[2], h[5], h[8]));
  const dstInverse = inverse(dst.transform);
  if (!dstInverse) return null;
  const result = mulMat(mulMat(dstInverse, normalized), src.transform);
  return Number.isFinite(result.c0.x) ? result : null;
}

function normalize(points: Vec2[]): { points: Vec2[]; transform: Mat3 } {
  let meanX = 0;
  let meanY = 0;
  for (const point of points) {
    meanX += point.x;
    meanY += point.y;
  }
  meanX /= points.length;
  meanY /= points.length;
  let distance = 0;
  for (const point of points) distance += Math.hypot(point.x - meanX, point.y - meanY);
  const scale = (Math.SQRT2 * points.length) / Math.max(distance, 1e-9);
  return {
    points: points.map((point) => v2(scale * (point.x - meanX), scale * (point.y - meanY))),
    transform: mat3(v3(scale, 0, 0), v3(0, scale, 0), v3(-scale * meanX, -scale * meanY, 1)),
  };
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
  for (let cursor = 1; cursor < values.length; cursor += 1) if (values[cursor] < values[index]) index = cursor;
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

function solveLinear(matrix: number[][], rhs: number[]): number[] | null {
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
    if (best < 1e-12) return null;
    if (pivot !== column) {
      const swap = a[column];
      a[column] = a[pivot];
      a[pivot] = swap;
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
    if (Math.abs(a[row][row]) < 1e-14) return null;
    solution[row] = sum / a[row][row];
  }
  return solution.every(Number.isFinite) ? solution : null;
}
