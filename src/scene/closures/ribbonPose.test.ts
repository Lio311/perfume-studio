import { describe, expect, it } from "vitest";
import { BOX_CLOSED_MARK_AZIMUTH } from "../boxCamera.ts";
import { cylinderRibbonYaw, splitRibbon } from "./ribbonPose.ts";
import { tubeMarkBand } from "./tubeMark.tsx";

describe("cylinder ribbon pose", () => {
  it("sits just past the mark, short of the silhouette", () => {
    const radius = 33.6;
    const lidR = radius + 0.7;
    const yaw = cylinderRibbonYaw(radius, lidR, 78, lidR * 2);
    const mark = tubeMarkBand(radius).angle;
    const degrees = (yaw * 180) / Math.PI;
    expect(yaw).toBeGreaterThan(BOX_CLOSED_MARK_AZIMUTH + mark / 2);
    expect(degrees).toBeGreaterThan(65);
    expect(degrees).toBeLessThan(85);
    expect(Math.abs(yaw - BOX_CLOSED_MARK_AZIMUTH)).toBeGreaterThan(0.4);
    expect(Math.abs(yaw - (BOX_CLOSED_MARK_AZIMUTH + Math.PI / 2))).toBeGreaterThan(0.4);
  });

  it("splits the ribbon at the seam and keeps the full height", () => {
    const h = 120;
    const start = h * 0.28;
    const seam = h * 0.38;
    const span = splitRibbon(start, h, seam);
    expect(span.below?.y).toBeCloseTo(start, 5);
    expect(span.above?.y).toBeCloseTo(seam, 5);
    expect((span.below?.h ?? 0) + (span.above?.h ?? 0)).toBeCloseTo(h - start, 5);
    const aboveSeam = splitRibbon(h * 0.55, h, h * 0.15);
    expect(aboveSeam.below).toBeNull();
    expect(aboveSeam.above?.h).toBeCloseTo(h * 0.45, 5);
  });
});
