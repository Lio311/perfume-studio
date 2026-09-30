import { alignments } from "./cornerOrder.ts";
import { choosePose } from "./poseChoice.ts";
import { add2, mulMat, scale2, transpose, type Mat3, type Vec2, type Vec3 } from "./vec.ts";
import {
  type CameraIntrinsics,
  type CardReference,
  homography,
  ID1,
  intrinsicsFinite,
  cardFinite,
  intrinsicsMatrix,
  modelCorners,
  type Pose,
  poseCandidates,
  project,
  refine,
  tiltDegrees,
  widthOnlyDepth,
} from "./poseMath.ts";
import { MAT3_IDENTITY, v2, v3 } from "./vec.ts";

export interface CardPoseEstimate {
  depthMm: number;
  tiltDegrees: number;
  widthOnlyDepthMm: number;
  reprojectionPx: number;
}

export interface CardPoseMemory {
  rotation: Mat3;
  translation: Vec3;
  corners: Vec2[];
}

export interface CardSolveResult {
  estimate: CardPoseEstimate | null;
  failure: "pose" | "depthDisagree" | null;
  memory: CardPoseMemory | null;
  orderedCorners: Vec2[];
  pose: Pose | null;
}

/**
 * `imageCorners` are pixels, origin at the top-left, Y down.
 * The 85.60 mm side is matched to the longer image edges before the solve.
 * Measurement calls this with `requireWidthAgreement: false`. The distance guide
 * passes true, so a pose that misses `fx * W / w_px` by more than 8% is dropped.
 */
export function solveCardPose(input: {
  imageCorners: Vec2[];
  intrinsics: CameraIntrinsics;
  reference?: CardReference;
  memory?: CardPoseMemory | null;
  requireWidthAgreement?: boolean;
}): CardSolveResult {
  const reference = input.reference ?? ID1;
  const requireWidthAgreement = input.requireWidthAgreement ?? true;
  const empty = (failure: "pose" | "depthDisagree"): CardSolveResult => ({
    estimate: null,
    failure,
    memory: null,
    orderedCorners: [],
    pose: null,
  });
  if (input.imageCorners.length !== 4 || !intrinsicsFinite(input.intrinsics) || !cardFinite(reference)) return empty("pose");
  if (!input.imageCorners.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) return empty("pose");
  const orderedSets = alignments(input.imageCorners, reference, input.memory?.corners ?? null);
  if (!orderedSets.length) return empty("pose");
  const object = modelCorners(reference);
  const candidates = [];
  const poses: Pose[] = [];
  const cornerSets: Vec2[][] = [];
  const widthOnlyValues: number[] = [];
  for (const corners of orderedSets) {
    const widthOnly = widthOnlyDepth(corners, reference.widthMm, input.intrinsics.fx);
    if (widthOnly == null) continue;
    for (const pose of refinedPoses(corners, object, input.intrinsics, reference)) {
      if (!(pose.rmse < 8) || !Number.isFinite(pose.translation.z)) continue;
      candidates.push({
        depthMm: pose.translation.z,
        rmse: pose.rmse,
        inFront: pose.translation.z > 1,
        facingCamera: pose.rotation.c2.z > 0,
        previousDistance: input.memory ? poseDistance(pose, input.memory) : 0,
        widthOnlyMm: widthOnly,
      });
      poses.push(pose);
      cornerSets.push(corners);
      widthOnlyValues.push(widthOnly);
    }
  }
  const index = choosePose(candidates, requireWidthAgreement);
  if (index == null) {
    const hadFacing = candidates.some((candidate) => candidate.inFront && candidate.facingCamera);
    const ordered = orderedSets[0];
    return {
      estimate: null,
      failure: hadFacing ? "depthDisagree" : "pose",
      memory: null,
      orderedCorners: ordered,
      pose: null,
    };
  }
  const pose = poses[index];
  const corners = cornerSets[index];
  const widthOnly = widthOnlyValues[index];
  return {
    estimate: {
      depthMm: pose.translation.z,
      tiltDegrees: tiltDegrees(pose.rotation),
      widthOnlyDepthMm: widthOnly,
      reprojectionPx: pose.rmse,
    },
    failure: null,
    memory: { rotation: pose.rotation, translation: pose.translation, corners },
    orderedCorners: corners,
    pose,
  };
}

/** Measurement entry. The 8% width-only gate stays off. */
export function estimateCardPose(
  imageCorners: Vec2[],
  intrinsics: CameraIntrinsics,
  reference: CardReference = ID1,
  memory: CardPoseMemory | null = null,
): CardPoseEstimate | null {
  return solveCardPose({
    imageCorners,
    intrinsics,
    reference,
    memory,
    requireWidthAgreement: false,
  }).estimate;
}

/** Pixels from card-plane millimetres: `K [r1 r2 t]` of a refined pose. */
export function homographyFromPose(pose: Pose, intrinsics: CameraIntrinsics): Mat3 {
  const axes = { c0: pose.rotation.c0, c1: pose.rotation.c1, c2: pose.translation };
  return mulMat(intrinsicsMatrix(intrinsics), axes);
}

function refinedPoses(corners: Vec2[], object: Vec3[], intrinsics: CameraIntrinsics, reference: CardReference): Pose[] {
  const poses: Pose[] = [];
  const plane = object.map((point) => v2(point.x, point.y));
  const found = homography(plane, corners);
  if (found) {
    for (const candidate of poseCandidates(found, intrinsics)) {
      const pose = refine(candidate.rotation, candidate.translation, object, corners, intrinsics);
      if (pose) poses.push(pose);
    }
  }
  const seed = frontoParallel(corners, intrinsics, reference);
  if (seed) {
    const pose = refine(seed.rotation, seed.translation, object, corners, intrinsics);
    if (pose) poses.push(pose);
  }
  return poses;
}

function poseDistance(pose: Pose, memory: CardPoseMemory): number {
  const depth = Math.abs(pose.translation.z - memory.translation.z) / Math.max(memory.translation.z, 1);
  const relative = mulMat(transpose(memory.rotation), pose.rotation);
  const trace = relative.c0.x + relative.c1.y + relative.c2.z;
  const cosine = Math.min(1, Math.max(-1, (trace - 1) / 2));
  return depth + Math.acos(cosine);
}

function frontoParallel(
  corners: Vec2[],
  intrinsics: CameraIntrinsics,
  reference: CardReference,
): { rotation: Mat3; translation: Vec3 } | null {
  const depth = widthOnlyDepth(corners, reference.widthMm, intrinsics.fx);
  if (depth == null) return null;
  const centre = scale2(add2(add2(add2(corners[0], corners[1]), corners[2]), corners[3]), 0.25);
  return {
    rotation: MAT3_IDENTITY,
    translation: v3(
      ((centre.x - intrinsics.cx) * depth) / intrinsics.fx,
      ((centre.y - intrinsics.cy) * depth) / intrinsics.fy,
      depth,
    ),
  };
}

export function projectPoint(
  point: Vec3,
  rotation: Mat3,
  translation: Vec3,
  intrinsics: CameraIntrinsics,
): Vec2 | null {
  return project(point, rotation, translation, intrinsics);
}
