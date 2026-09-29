import { add2, scale2, type Vec2 } from "./vec.ts";
import {
  type CameraIntrinsics,
  type CardReference,
  cycles,
  homography,
  ID1,
  intrinsicsFinite,
  cardFinite,
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

export function estimateCardPose(
  imageCorners: Vec2[],
  intrinsics: CameraIntrinsics,
  reference: CardReference = ID1,
): CardPoseEstimate | null {
  if (imageCorners.length !== 4 || !intrinsicsFinite(intrinsics) || !cardFinite(reference)) return null;
  if (!imageCorners.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) return null;
  const object = modelCorners(reference);
  let best: Pose | null = null;
  let bestCorners = imageCorners;
  for (const corners of cycles(imageCorners)) {
    const plane = object.map((point) => v2(point.x, point.y));
    const found = homography(plane, corners);
    if (found) {
      for (const candidate of poseCandidates(found, intrinsics)) {
        const refined = refine(candidate.rotation, candidate.translation, object, corners, intrinsics);
        const chosen = consider(refined, corners, best, bestCorners);
        best = chosen.best;
        bestCorners = chosen.bestCorners;
      }
    }
    const seed = frontoParallel(corners, intrinsics, reference);
    if (seed) {
      const refined = refine(seed.rotation, seed.translation, object, corners, intrinsics);
      const chosen = consider(refined, corners, best, bestCorners);
      best = chosen.best;
      bestCorners = chosen.bestCorners;
    }
  }
  if (!best || !(best.translation.z > 0) || !(best.rmse < 8)) return null;
  const widthOnly = widthOnlyDepth(bestCorners, reference.widthMm, intrinsics.fx);
  if (widthOnly == null) return null;
  return {
    depthMm: best.translation.z,
    tiltDegrees: tiltDegrees(best.rotation),
    widthOnlyDepthMm: widthOnly,
    reprojectionPx: best.rmse,
  };
}

function consider(
  pose: Pose | null,
  corners: Vec2[],
  best: Pose | null,
  bestCorners: Vec2[],
): { best: Pose | null; bestCorners: Vec2[] } {
  if (!pose || !(pose.translation.z > 0)) return { best, bestCorners };
  if (!best || pose.rmse < best.rmse) return { best: pose, bestCorners: corners };
  return { best, bestCorners };
}

function frontoParallel(
  corners: Vec2[],
  intrinsics: CameraIntrinsics,
  reference: CardReference,
): { rotation: typeof MAT3_IDENTITY; translation: ReturnType<typeof v3> } | null {
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
  point: ReturnType<typeof v3>,
  rotation: typeof MAT3_IDENTITY,
  translation: ReturnType<typeof v3>,
  intrinsics: CameraIntrinsics,
): Vec2 | null {
  return project(point, rotation, translation, intrinsics);
}
