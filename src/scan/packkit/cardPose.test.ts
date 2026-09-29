import { describe, expect, it } from "vitest";
import { alignments, widthLength } from "./cornerOrder.ts";
import { choosePose, type PoseCandidate } from "./poseChoice.ts";
import { estimateCardPose, homographyFromPose, solveCardPose } from "./cardPose.ts";
import { planeMap, SCALE_LIMITS } from "./scale.ts";
import { rowMajor } from "./measureMath.ts";
import { homography, ID1, modelCorners } from "./poseMath.ts";
import { SYNTHETIC_INTRINSICS, cardCorners } from "./synthetic.ts";
import { v2 } from "./vec.ts";
import {
  pixelFromVisionNormalized,
  safariCaptureOrientation,
  uprightIntrinsics,
  uprightPixel,
  visionNormalizedFromPixel,
} from "./imageOrientation.ts";

const intrinsics = SYNTHETIC_INTRINSICS;

describe("card pose ambiguity", () => {
  it("keeps the 85.60 mm side on the long image edges", () => {
    const corners = cardCorners(0, "y", 0, 1, 0);
    const rotated = [corners[1], corners[2], corners[3], corners[0]];
    const naive = (intrinsics.fx * ID1.widthMm) / (0.5 * (
      Math.hypot(rotated[1].x - rotated[0].x, rotated[1].y - rotated[0].y) +
      Math.hypot(rotated[2].x - rotated[3].x, rotated[2].y - rotated[3].y)
    ));
    expect(naive / 200).toBeCloseTo(ID1.widthMm / ID1.heightMm, 1);
    const estimate = estimateCardPose(rotated, intrinsics);
    expect(estimate?.depthMm).toBeCloseTo(200, 0);
    expect(Math.abs((estimate?.depthMm ?? 0) - 200)).toBeLessThanOrEqual(0.5);
  });

  it("holds the long edge until the other side is clearly longer", () => {
    const wide = rectangle(100, 90);
    const first = alignments(wide, ID1, null);
    expect(widthLength(first[0])).toBeCloseTo(100, 6);
    const slight = rectangle(100, 103);
    const kept = alignments(slight, ID1, wide);
    expect(widthLength(kept[0])).toBeCloseTo(100, 6);
    const clear = rectangle(100, 130);
    const switched = alignments(clear, ID1, wide);
    expect(widthLength(switched[0])).toBeCloseTo(130, 6);
  });

  it("picks the in-front pose nearest the previous one, and the 8% gate is optional", () => {
    for (const tilt of [0, 15]) {
      const corners = cardCorners(tilt, "y", 0, 1, 0);
      const solved = solveCardPose({ imageCorners: corners, intrinsics, requireWidthAgreement: true });
      expect(solved.estimate?.depthMm).toBeCloseTo(200, 0);
      const widthOnly = solved.estimate?.widthOnlyDepthMm ?? 0;
      const depth = solved.estimate?.depthMm ?? 0;
      expect(Math.abs(depth - widthOnly) / widthOnly).toBeLessThanOrEqual(0.08);
    }
    const farther: PoseCandidate = { depthMm: 200, rmse: 0.2, inFront: true, facingCamera: true, previousDistance: 0.4, widthOnlyMm: 200 };
    const wrong: PoseCandidate = { depthMm: 320, rmse: 0.1, inFront: true, facingCamera: true, previousDistance: 0.01, widthOnlyMm: 200 };
    const behind: PoseCandidate = { depthMm: 180, rmse: 0.05, inFront: false, facingCamera: true, previousDistance: 0, widthOnlyMm: 180 };
    const closer: PoseCandidate = { depthMm: 205, rmse: 0.3, inFront: true, facingCamera: true, previousDistance: 0.1, widthOnlyMm: 200 };
    expect(choosePose([farther, wrong, behind, closer], true)).toBe(3);
    expect(choosePose([wrong], true)).toBeNull();
    expect(choosePose([wrong], false)).toBe(0);
  });

  it("builds the rectified plane from the refined pose, not the direct homography", () => {
    const corners = cardCorners(10, "y", 0.8, 4, 0);
    const solved = solveCardPose({ imageCorners: corners, intrinsics, requireWidthAgreement: false });
    expect(solved.pose).not.toBeNull();
    const plane = planeMap(corners, ID1, intrinsics);
    expect(plane).not.toBeNull();
    const refined = normalizeHomography(rowMajor(homographyFromPose(solved.pose!, intrinsics)));
    const mapped = normalizeHomography(plane!.imageFromPlane);
    for (let index = 0; index < 9; index += 1) {
      expect(Math.abs(refined[index] - mapped[index])).toBeLessThan(1e-6);
    }
    const model = modelCorners(ID1).map((point) => v2(point.x, point.y));
    const direct = homography(model, corners);
    expect(direct).not.toBeNull();
    const raw = normalizeHomography(rowMajor(direct!));
    const gap = refined.reduce((sum, value, index) => sum + Math.abs(value - raw[index]), 0);
    expect(gap).toBeGreaterThan(1e-4);
  });

  it("flags a strong tilt above 15° without rejecting it before 25°", () => {
    const corners = cardCorners(20, "y", 0, 1, 0);
    const solved = solveCardPose({ imageCorners: corners, intrinsics, requireWidthAgreement: false });
    expect(solved.estimate).not.toBeNull();
    expect(solved.estimate!.tiltDegrees).toBeGreaterThan(SCALE_LIMITS.strongTiltDegrees);
    expect(solved.estimate!.tiltDegrees).toBeLessThan(SCALE_LIMITS.maximumCardTiltDegrees);
  });
});

describe("Safari image orientation", () => {
  it("treats an iPhone portrait landscape buffer as right, not as an up-flip", () => {
    expect(safariCaptureOrientation({
      bufferWidth: 1920,
      bufferHeight: 1080,
      screenWidth: 390,
      screenHeight: 844,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)",
    })).toBe("right");
    expect(safariCaptureOrientation({
      bufferWidth: 1920,
      bufferHeight: 1080,
      screenWidth: 1440,
      screenHeight: 900,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    })).toBe("up");
    const pixel = v2(50, 20);
    const vision = visionNormalizedFromPixel(pixel, "right", 200, 100);
    const oldUpFlip = pixelFromVisionNormalized(vision, "up", 200, 100);
    expect(Math.abs(oldUpFlip.x - pixel.x) + Math.abs(oldUpFlip.y - pixel.y)).toBeGreaterThan(1);
    const fixed = pixelFromVisionNormalized(vision, "right", 200, 100);
    expect(fixed.x).toBeCloseTo(pixel.x, 9);
    expect(fixed.y).toBeCloseTo(pixel.y, 9);
  });

  it("keeps the card depth when the buffer is turned to match the intrinsics", () => {
    const corners = cardCorners(0, "y", 0, 1, 0);
    const expected = estimateCardPose(corners, intrinsics);
    expect(expected?.depthMm).toBeCloseTo(200, 1);
    const buffer = { width: 1920, height: 1440 };
    for (const orientation of ["up", "down", "left", "right"] as const) {
      const turned = corners.map((point) => uprightPixel(point, orientation, buffer.width, buffer.height));
      const camera = uprightIntrinsics(intrinsics, orientation, buffer.width, buffer.height);
      const estimate = estimateCardPose(turned, camera.intrinsics);
      expect(estimate?.depthMm).toBeCloseTo(expected?.depthMm ?? -1, 1);
    }
  });
});

function rectangle(width: number, height: number, origin = v2(0, 0)): ReturnType<typeof v2>[] {
  return [
    origin,
    v2(origin.x + width, origin.y),
    v2(origin.x + width, origin.y + height),
    v2(origin.x, origin.y + height),
  ];
}

function normalizeHomography(values: number[]): number[] {
  const scale = Math.abs(values[8]) > 1e-12 ? values[8] : 1;
  return values.map((value) => value / scale);
}
