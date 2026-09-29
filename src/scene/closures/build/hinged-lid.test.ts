import { describe, expect, it } from "vitest";
import { flapMagnetPose } from "./hinged-lid.tsx";

describe("hinged flap magnet", () => {
  it("lies entirely within the flap thickness", () => {
    for (const wall of [1.2, 2.2, 3.4]) {
      const pose = flapMagnetPose(wall);
      const bottom = pose.y - pose.thickness / 2;
      const top = pose.y + pose.thickness / 2;
      expect(bottom).toBeGreaterThanOrEqual(pose.panelMin - 1e-6);
      expect(top).toBeLessThanOrEqual(pose.panelMax + 1e-6);
      expect(pose.panelMax - pose.panelMin).toBeCloseTo(wall * 1.6, 5);
    }
  });
});
