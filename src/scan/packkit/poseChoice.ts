/**
 * The planar homography has two poses. Keep the one in front of the camera,
 * facing the camera, within 8% of the width-only depth, and closest to the previous pose.
 * `fx * W / w_px` agreement is the distance guide's check. Measurement leaves it off.
 */
export const DEPTH_AGREEMENT = 0.08;

export interface PoseCandidate {
  depthMm: number;
  rmse: number;
  inFront: boolean;
  facingCamera: boolean;
  /** Smaller is closer to the previous pose. Zero when there is no previous pose. */
  previousDistance: number;
  widthOnlyMm: number;
}

export function choosePose(candidates: PoseCandidate[], requireAgreement = true, agreement = DEPTH_AGREEMENT): number | null {
  const facing = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.inFront && candidate.facingCamera && Number.isFinite(candidate.depthMm));
  const agreed = facing.filter(({ candidate }) => {
    const widthOnly = candidate.widthOnlyMm;
    if (!(widthOnly > 1)) return false;
    return Math.abs(candidate.depthMm - widthOnly) / widthOnly <= agreement;
  });
  const pool = agreed.length === 0 && !requireAgreement ? facing : agreed;
  if (!pool.length) return null;
  pool.sort((lhs, rhs) => {
    if (lhs.candidate.previousDistance !== rhs.candidate.previousDistance) {
      return lhs.candidate.previousDistance - rhs.candidate.previousDistance;
    }
    return lhs.candidate.rmse - rhs.candidate.rmse;
  });
  return pool[0].index;
}
