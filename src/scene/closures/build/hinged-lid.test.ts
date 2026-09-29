import { describe, expect, it } from "vitest";
import { flapMagnetPose } from "./hinged-lid.tsx";

describe("hinged flap magnet", () => {
  it("lies entirely inside the flap", () => {
    for (const wall of [1.2, 2.2, 3.4]) {
      for (const [boxW, flapH] of [[78, 73.4], [40, 29.4]] as const) {
        const pose = flapMagnetPose(wall, boxW, flapH);
        expect(pose.y - pose.thickness / 2).toBeGreaterThanOrEqual(pose.panelMinY - 1e-6);
        expect(pose.y + pose.thickness / 2).toBeLessThanOrEqual(pose.panelMaxY + 1e-6);
        expect(pose.x - pose.radius).toBeGreaterThanOrEqual(pose.panelMinX - 1e-6);
        expect(pose.x + pose.radius).toBeLessThanOrEqual(pose.panelMaxX + 1e-6);
        expect(pose.z - pose.radius).toBeGreaterThanOrEqual(pose.panelMinZ - 1e-6);
        expect(pose.z + pose.radius).toBeLessThanOrEqual(pose.panelMaxZ + 1e-6);
        expect(pose.panelMaxY - pose.panelMinY).toBeCloseTo(wall * 1.6, 5);
      }
    }
  });
});
