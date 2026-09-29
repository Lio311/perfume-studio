import { describe, expect, it } from "vitest";
import { rodrigues } from "../packkit/poseMath.ts";
import { v3, type Vec2 } from "../packkit/vec.ts";
import { calibrateViews, projectDistorted } from "./zhang.ts";

describe("Zhang calibration", () => {
  it("recovers focal length, principal point, and radial distortion", () => {
    const truth = { fx: 1400, fy: 1380, cx: 960, cy: 540, k1: -0.18, k2: 0.04 };
    const object = [
      { x: -42.8, y: -26.99 },
      { x: 42.8, y: -26.99 },
      { x: 42.8, y: 26.99 },
      { x: -42.8, y: 26.99 },
    ];
    const poses = [
      { w: v3(0, 0, 0), t: v3(0, 0, 220) },
      { w: v3(0.22, -0.18, 0.04), t: v3(18, -12, 260) },
      { w: v3(-0.28, 0.16, -0.05), t: v3(-22, 14, 200) },
      { w: v3(0.12, 0.32, 0.02), t: v3(12, 18, 300) },
      { w: v3(-0.18, -0.26, 0.06), t: v3(-16, -18, 240) },
      { w: v3(0.3, 0.05, -0.04), t: v3(28, 6, 280) },
      { w: v3(-0.14, 0.24, 0.08), t: v3(-8, 22, 190) },
      { w: v3(0.06, -0.3, -0.03), t: v3(14, -16, 320) },
    ];
    const views = poses.map((pose) => ({
      corners: object.map((point) => {
        const projected = projectDistorted(point, rodrigues(pose.w), pose.t, truth);
        if (!projected) throw new Error("synthetic point fell behind the camera");
        return projected;
      }) as Vec2[],
    }));
    const estimated = calibrateViews(views);
    expect(estimated).not.toBeNull();
    expect(estimated!.fx).toBeGreaterThan(truth.fx * 0.98);
    expect(estimated!.fx).toBeLessThan(truth.fx * 1.02);
    expect(estimated!.fy).toBeGreaterThan(truth.fy * 0.98);
    expect(estimated!.fy).toBeLessThan(truth.fy * 1.02);
    expect(Math.abs(estimated!.cx - truth.cx)).toBeLessThan(8);
    expect(Math.abs(estimated!.cy - truth.cy)).toBeLessThan(8);
    expect(Math.abs(estimated!.k1 - truth.k1)).toBeLessThan(0.04);
    expect(Math.abs(estimated!.k2 - truth.k2)).toBeLessThan(0.04);
    expect(estimated!.reprojectionPx).toBeLessThan(0.5);
    expect(estimated!.rejected).toBe(0);
  });

  it("rejects a capture whose corners do not fit and still calibrates the rest", () => {
    const truth = { fx: 1200, fy: 1200, cx: 400, cy: 300, k1: -0.1, k2: 0.02 };
    const object = [
      { x: -42.8, y: -26.99 },
      { x: 42.8, y: -26.99 },
      { x: 42.8, y: 26.99 },
      { x: -42.8, y: 26.99 },
    ];
    const poses = [0, 0.2, -0.25, 0.15, -0.1, 0.3, -0.18].map((angle, index) => ({
      w: v3(angle, -angle * 0.6, 0.02 * index),
      t: v3((index - 3) * 8, (index % 2 === 0 ? 10 : -10), 210 + index * 12),
    }));
    const views = poses.map((pose) => ({
      corners: object.map((point) => projectDistorted(point, rodrigues(pose.w), pose.t, truth)!),
    }));
    views.push({
      corners: [
        { x: 80, y: 80 },
        { x: 420, y: 86 },
        { x: 418, y: 102 },
        { x: 78, y: 96 },
      ],
    });
    const estimated = calibrateViews(views);
    expect(estimated).not.toBeNull();
    expect(estimated!.rejected).toBe(1);
    expect(estimated!.views).toBe(7);
    expect(estimated!.reprojectionPx).toBeLessThan(1);
  });
});
