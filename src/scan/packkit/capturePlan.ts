import type { PartKind } from "./shape.ts";

export type CaptureAngle = "side" | "top" | "bottom" | "front";

export interface CaptureStep {
  angle: CaptureAngle;
  required: boolean;
  recommended: boolean;
}

export const ANGLE_HEBREW: Record<CaptureAngle, string> = {
  side: "צד",
  top: "למעלה",
  bottom: "למטה",
  front: "חזית",
};

export const KIND_HEBREW: Record<PartKind, string> = {
  bottle: "בקבוק",
  cap: "פקק",
  label: "תווית",
  pump: "משאבה",
  collar: "צווארון",
  box: "קופסה",
};

export function capturePlan(kind: PartKind): CaptureStep[] {
  switch (kind) {
    case "bottle":
      return [
        { angle: "side", required: true, recommended: false },
        { angle: "top", required: false, recommended: true },
        { angle: "bottom", required: false, recommended: false },
      ];
    case "cap":
      return [
        { angle: "side", required: true, recommended: false },
        { angle: "top", required: true, recommended: false },
        { angle: "bottom", required: false, recommended: false },
      ];
    case "pump":
      return [{ angle: "side", required: true, recommended: false }];
    case "collar":
      return [
        { angle: "side", required: true, recommended: false },
        { angle: "top", required: true, recommended: false },
      ];
    case "box":
      return [
        { angle: "front", required: true, recommended: false },
        { angle: "side", required: true, recommended: false },
        { angle: "top", required: false, recommended: false },
      ];
    case "label":
      return [{ angle: "front", required: true, recommended: false }];
    default:
      return [];
  }
}
