import { estimateCardPose } from "./cardPose.ts";
import { applyHomography, formatG, polygonArea, rowMajor, trueInverse } from "./measureMath.ts";
import {
  type CameraIntrinsics,
  type CardReference,
  cardFinite,
  cycles,
  homography,
  ID1,
  intrinsicsFinite,
  intrinsicsMatrix,
  modelCorners,
  type PixelSize,
  poseCandidates,
  refine,
  sameCard,
  widthOnlyDepth,
} from "./poseMath.ts";
import { length2, MAT3_IDENTITY, mulMat, type Vec2, v2, v3 } from "./vec.ts";

export const SCALE_LIMITS = {
  minimumCardAreaFraction: 0.08,
  maximumCardTiltDegrees: 25,
  strongTiltDegrees: 15,
  minimumAutoMillimetres: 80,
  suspectDisagreementMillimetres: 5,
  toleranceMillimetres: 5,
  okErrorMillimetres: 3,
  checkErrorMillimetres: 5,
} as const;

export interface MeasureIssue {
  code: string;
  messageHe: string;
  messageEn: string;
  blocksSave: boolean;
}

export interface CardPlaneMap {
  imageFromPlane: number[];
  planeFromImage: number[];
}

export function pixelFromPlane(plane: CardPlaneMap, point: Vec2): Vec2 | null {
  return applyHomography(plane.imageFromPlane, point);
}

export function planeMmFromPixel(plane: CardPlaneMap, pixel: Vec2): Vec2 | null {
  return applyHomography(plane.planeFromImage, pixel);
}

export function mmPerPxAtCentre(plane: CardPlaneMap): number {
  const origin = pixelFromPlane(plane, v2(0, 0));
  const stepX = pixelFromPlane(plane, v2(1, 0));
  const stepY = pixelFromPlane(plane, v2(0, 1));
  if (!origin || !stepX || !stepY) return 0;
  const pxPerMm = 0.5 * (length2({ x: stepX.x - origin.x, y: stepX.y - origin.y }) + length2({ x: stepY.x - origin.x, y: stepY.y - origin.y }));
  if (!(pxPerMm > 1e-9)) return 0;
  return 1 / pxPerMm;
}

export type ScaleSourceKind = "card" | "coin" | "ruler" | "custom" | "typed" | "autoLidar" | "autoObjectCapture";
export type MeasureAxis = "height" | "width";
export type AutoScaleSource = "lidar" | "objectCapture";

export interface PixelExtent {
  widthPx: number;
  heightPx: number;
}

export interface ScaleSolution {
  mmPerPx: number;
  pxPerMm: number;
  depthMm: number | null;
  tiltDegrees: number | null;
  reprojectionPx: number | null;
  cardAreaFraction: number | null;
  plane: CardPlaneMap | null;
  source: ScaleSourceKind;
  sigmaScaleMm: number;
  referenceObject: string | null;
  scanScale: string | null;
  measurementSource: string;
  scanMethod: string;
  issue: MeasureIssue | null;
  isSharp: boolean;
}

export function scaleUsable(scale: ScaleSolution): boolean {
  return scale.issue == null && Number.isFinite(scale.mmPerPx) && scale.mmPerPx > 0;
}

export type ScaleReference =
  | { kind: "card"; corners: Vec2[]; size: CardReference }
  | { kind: "coin"; p1: Vec2; p2: Vec2; diameterMm: number }
  | { kind: "ruler"; p1: Vec2; p2: Vec2; mm: number }
  | { kind: "custom"; p1: Vec2; p2: Vec2; mm: number }
  | { kind: "typed"; axis: MeasureAxis; mm: number }
  | { kind: "auto"; source: AutoScaleSource; mmPerPx: number };

export function cardReference(corners: Vec2[], size: CardReference = ID1): ScaleReference {
  return { kind: "card", corners, size };
}

export interface CoinSpec {
  id: string;
  nameEn: string;
  nameHe: string;
  diameterMm: number;
}

export const COINS: CoinSpec[] = [
  { id: "ils-10-agorot", nameEn: "10 agorot", nameHe: "10 אגורות", diameterMm: 22 },
  { id: "ils-5-agorot", nameEn: "5 agorot", nameHe: "5 אגורות", diameterMm: 19.5 },
  { id: "ils-1-agora", nameEn: "1 agora", nameHe: "1 אגורה", diameterMm: 17 },
  { id: "ils-50-agorot", nameEn: "1/2 new shekel", nameHe: "½ שקל חדש", diameterMm: 26 },
  { id: "ils-1", nameEn: "1 new shekel", nameHe: "שקל חדש 1", diameterMm: 18 },
  { id: "ils-2", nameEn: "2 new shekels", nameHe: "2 שקלים חדשים", diameterMm: 21.6 },
  { id: "ils-5", nameEn: "5 new shekels", nameHe: "5 שקלים חדשים", diameterMm: 24 },
  { id: "ils-10", nameEn: "10 new shekels", nameHe: "10 שקלים חדשים", diameterMm: 23 },
];

export function coinById(id: string): CoinSpec | null {
  return COINS.find((coin) => coin.id === id) ?? null;
}

export function solveScale(
  reference: ScaleReference,
  intrinsics: CameraIntrinsics,
  frame: PixelSize,
  extent: PixelExtent | null = null,
  lidarDepthMm: number | null = null,
): ScaleSolution {
  switch (reference.kind) {
    case "card":
      return solveCard(reference.corners, reference.size, intrinsics, frame, lidarDepthMm);
    case "coin":
      return solveTap(reference.p1, reference.p2, reference.diameterMm, "coin", intrinsics, `ILS coin ${formatG(reference.diameterMm)}mm (to verify)`, "manual", "estimate", "single-photo");
    case "ruler":
      return solveTap(reference.p1, reference.p2, reference.mm, "ruler", intrinsics, `ruler ${formatG(reference.mm)}mm`, "ruler", "ruler", "single-photo");
    case "custom":
      return solveTap(reference.p1, reference.p2, reference.mm, "custom", intrinsics, `custom reference ${formatG(reference.mm)}mm`, "manual", "estimate", "single-photo");
    case "typed":
      return solveTyped(reference.axis, reference.mm, extent, intrinsics);
    case "auto":
      return solveAuto(reference.source, reference.mmPerPx, intrinsics, lidarDepthMm);
  }
}

function solveCard(
  corners: Vec2[],
  size: CardReference,
  intrinsics: CameraIntrinsics,
  frame: PixelSize,
  lidarDepth: number | null,
): ScaleSolution {
  const solution = empty("card", 1, "reference-card", "reference-card", "photo-lathe");
  solution.referenceObject = cardLabel(size);
  if (corners.length !== 4 || !intrinsicsFinite(intrinsics) || !cardFinite(size) || !corners.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) {
    solution.issue = degenerate();
    return solution;
  }
  const area = polygonArea(corners);
  const frameArea = frame.width * frame.height;
  const fraction = frameArea > 0 ? area / frameArea : 0;
  solution.cardAreaFraction = fraction;
  const pose = estimateCardPose(corners, intrinsics, size);
  if (!pose) {
    solution.issue = degenerate();
    return solution;
  }
  solution.depthMm = usableLidar(lidarDepth) ?? pose.depthMm;
  solution.tiltDegrees = pose.tiltDegrees;
  solution.reprojectionPx = pose.reprojectionPx;
  solution.isSharp = pose.reprojectionPx <= 2;
  if (pose.tiltDegrees > SCALE_LIMITS.maximumCardTiltDegrees) {
    solution.issue = {
      code: "card_tilt",
      messageHe: "הכרטיס מוטה ביותר מ־25 מעלות.",
      messageEn: "The card is tilted by more than 25°.",
      blocksSave: true,
    };
    return solution;
  }
  if (fraction < SCALE_LIMITS.minimumCardAreaFraction) {
    solution.issue = {
      code: "card_too_small",
      messageHe: "הכרטיס מכסה פחות מ־8% משטח הפריים.",
      messageEn: "The card covers less than 8% of the frame.",
      blocksSave: true,
    };
    return solution;
  }
  solution.plane = planeMap(corners, size, intrinsics);
  const mmPerPx = solution.plane ? mmPerPxAtCentre(solution.plane) : widthMillimetresPerPixel(corners, size.widthMm);
  if (!(mmPerPx > 0)) {
    solution.issue = degenerate();
    return solution;
  }
  solution.mmPerPx = mmPerPx;
  solution.pxPerMm = 1 / mmPerPx;
  solution.sigmaScaleMm = cardSigma(pose.tiltDegrees, pose.reprojectionPx, mmPerPx);
  return solution;
}

function solveTap(
  p1: Vec2,
  p2: Vec2,
  millimetres: number,
  source: ScaleSourceKind,
  intrinsics: CameraIntrinsics,
  referenceObject: string,
  scanScale: string,
  measurementSource: string,
  scanMethod: string,
): ScaleSolution {
  const solution = empty(source, 3.6, scanScale, measurementSource, scanMethod);
  solution.referenceObject = referenceObject;
  const pixels = length2({ x: p2.x - p1.x, y: p2.y - p1.y });
  if (!intrinsicsFinite(intrinsics) || !Number.isFinite(millimetres) || !(millimetres > 0) || !(pixels > 1) || !Number.isFinite(p1.x) || !Number.isFinite(p2.x)) {
    solution.issue = degenerate();
    return solution;
  }
  solution.mmPerPx = millimetres / pixels;
  solution.pxPerMm = pixels / millimetres;
  solution.sigmaScaleMm = 3.6;
  return solution;
}

function solveTyped(axis: MeasureAxis, millimetres: number, extent: PixelExtent | null, intrinsics: CameraIntrinsics): ScaleSolution {
  const solution = empty("typed", 3.6, "manual", "estimate", "manual");
  solution.referenceObject = `typed ${axis} ${formatG(millimetres)}mm`;
  if (!intrinsicsFinite(intrinsics) || !Number.isFinite(millimetres) || !(millimetres > 0) || !extent) {
    solution.issue = degenerate();
    return solution;
  }
  const pixels = axis === "height" ? extent.heightPx : extent.widthPx;
  if (!(pixels > 1)) {
    solution.issue = degenerate();
    return solution;
  }
  solution.mmPerPx = millimetres / pixels;
  solution.pxPerMm = pixels / millimetres;
  return solution;
}

function solveAuto(source: AutoScaleSource, mmPerPx: number, intrinsics: CameraIntrinsics, lidarDepth: number | null): ScaleSolution {
  const kind: ScaleSourceKind = source === "lidar" ? "autoLidar" : "autoObjectCapture";
  const sigma = source === "lidar" ? 2 : 3.6;
  const solution = empty(kind, sigma, source === "lidar" ? "lidar" : null, source === "lidar" ? "lidar" : "object-capture", source === "lidar" ? "single-photo" : "object-capture");
  solution.referenceObject = source === "lidar" ? "LiDAR" : "Object Capture";
  solution.depthMm = usableLidar(lidarDepth);
  if (!intrinsicsFinite(intrinsics) || !Number.isFinite(mmPerPx) || !(mmPerPx > 0)) {
    solution.issue = degenerate();
    return solution;
  }
  solution.mmPerPx = mmPerPx;
  solution.pxPerMm = 1 / mmPerPx;
  return solution;
}

export function planeMap(corners: Vec2[], size: CardReference, intrinsics: CameraIntrinsics): CardPlaneMap | null {
  const object = modelCorners(size);
  const plane = object.map((point) => v2(point.x, point.y));
  let best: { rotation: typeof MAT3_IDENTITY; translation: ReturnType<typeof v3>; score: number } | null = null;
  for (const ordered of cycles(corners)) {
    const seeds: Array<{ rotation: typeof MAT3_IDENTITY; translation: ReturnType<typeof v3> }> = [];
    const found = homography(plane, ordered);
    if (found) seeds.push(...poseCandidates(found, intrinsics));
    const parallel = frontoParallel(ordered, intrinsics, size);
    if (parallel) seeds.push(parallel);
    for (const candidate of seeds) {
      const pose = refine(candidate.rotation, candidate.translation, object, ordered, intrinsics);
      if (!pose || !(pose.translation.z > 0)) continue;
      if (!best || pose.rmse < best.score - 1e-4) best = { rotation: pose.rotation, translation: pose.translation, score: pose.rmse };
    }
  }
  if (!best || !(best.score < 8)) return null;
  const image = imageHomography(best.rotation, best.translation, intrinsics);
  const inverted = trueInverse(image);
  if (!inverted) return null;
  return { imageFromPlane: rowMajor(image), planeFromImage: rowMajor(inverted) };
}

function imageHomography(rotation: typeof MAT3_IDENTITY, translation: ReturnType<typeof v3>, intrinsics: CameraIntrinsics) {
  const axes = { c0: rotation.c0, c1: rotation.c1, c2: translation };
  return mulMat(intrinsicsMatrix(intrinsics), axes);
}

function frontoParallel(corners: Vec2[], intrinsics: CameraIntrinsics, reference: CardReference) {
  const depth = widthOnlyDepth(corners, reference.widthMm, intrinsics.fx);
  if (depth == null) return null;
  const centre = {
    x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
    y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4,
  };
  return {
    rotation: MAT3_IDENTITY,
    translation: v3(
      ((centre.x - intrinsics.cx) * depth) / intrinsics.fx,
      ((centre.y - intrinsics.cy) * depth) / intrinsics.fy,
      depth,
    ),
  };
}

function widthMillimetresPerPixel(corners: Vec2[], widthMm: number): number {
  if (corners.length !== 4 || !(widthMm > 0)) return 0;
  const top = length2({ x: corners[1].x - corners[0].x, y: corners[1].y - corners[0].y });
  const bottom = length2({ x: corners[2].x - corners[3].x, y: corners[2].y - corners[3].y });
  const pixels = (top + bottom) / 2;
  if (!(pixels > 1)) return 0;
  return widthMm / pixels;
}

function cardSigma(tilt: number, reprojectionPx: number, mmPerPx: number): number {
  if (tilt >= SCALE_LIMITS.strongTiltDegrees) return 3.8;
  if (reprojectionPx > 2) return Math.min(4.5, 1.2 + (reprojectionPx - 2) * mmPerPx * 8);
  return 1;
}

function usableLidar(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw) || !(raw > 0)) return null;
  return raw;
}

function cardLabel(size: CardReference): string {
  if (sameCard(size, ID1)) return "ISO/IEC 7810 ID-1 card 85.60x53.98mm";
  return `printed card ${formatG(size.widthMm)}x${formatG(size.heightMm)}mm`;
}

function empty(
  source: ScaleSourceKind,
  sigma: number,
  scanScale: string | null,
  measurementSource: string,
  scanMethod: string,
): ScaleSolution {
  return {
    mmPerPx: 0,
    pxPerMm: 0,
    depthMm: null,
    tiltDegrees: null,
    reprojectionPx: null,
    cardAreaFraction: null,
    plane: null,
    source,
    sigmaScaleMm: sigma,
    referenceObject: null,
    scanScale,
    measurementSource,
    scanMethod,
    issue: null,
    isSharp: false,
  };
}

function degenerate(): MeasureIssue {
  return {
    code: "scale_degenerate",
    messageHe: "לא ניתן לחשב קנה מידה מהייחוס.",
    messageEn: "The reference does not determine a scale.",
    blocksSave: true,
  };
}
