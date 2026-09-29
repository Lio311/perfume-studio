import { describe, expect, it } from "vitest";
import { cartonMarkSize } from "../../geometry/logos.ts";
import { BOX_CLOSED_MARK_AZIMUTH } from "../boxCamera.ts";
import { MARK_FACE_GAP } from "./kit.tsx";
import { sleeveInnerDepth, sleeveInnerMarkZ } from "./build/sleeve.tsx";
import { tubeInnerRadius, tubeInsertOuter, tubeInsertRadius } from "./build/tube.tsx";
import { TUBE_MARK_ANGLE_CAP, tubeMarkBand } from "./tubeMark.tsx";

describe("carton mark placement", () => {
  it("keeps the brand offset under half a millimetre", () => {
    expect(MARK_FACE_GAP).toBeGreaterThan(0);
    expect(MARK_FACE_GAP).toBeLessThan(0.5);
  });

  it("puts the inner sleeve mark on the tray face, clear of the sleeve wall", () => {
    const depth = 68;
    const wall = 2.2;
    const inner = sleeveInnerDepth(depth, wall);
    expect(inner).toBeCloseTo(depth - 2 * wall - 0.6, 5);
    expect(inner / 2).toBeLessThan(depth / 2 - wall);
    const z = sleeveInnerMarkZ(depth, wall);
    expect(z).toBeCloseTo(inner / 2 + MARK_FACE_GAP, 5);
    expect(z).toBeLessThan(depth / 2 - wall);
    expect(z).toBeGreaterThan(inner / 2);
  });

  it("faces the closed shot and sizes the arc from the brand line", () => {
    const radius = 33.6;
    const aspect = 4;
    const band = tubeMarkBand(radius, aspect);
    const surface = radius + MARK_FACE_GAP;
    const sized = cartonMarkSize(surface * TUBE_MARK_ANGLE_CAP, aspect);
    expect(band.radius).toBeCloseTo(surface, 5);
    expect(band.angle).toBeCloseTo(sized.width / surface, 5);
    expect(band.angle).toBeLessThan(TUBE_MARK_ANGLE_CAP);
    expect(band.angle).toBeGreaterThan((40 * Math.PI) / 180);
    expect(band.thetaStart).toBeCloseTo(BOX_CLOSED_MARK_AZIMUTH - band.angle / 2, 5);
    expect(BOX_CLOSED_MARK_AZIMUTH).toBeCloseTo(Math.atan2(0.72, 1), 5);
    expect(band.arc).toBeCloseTo(sized.width, 5);
    expect(band.height).toBeCloseTo(sized.height, 5);
    expect(band.arc).toBeLessThan(surface * TUBE_MARK_ANGLE_CAP);
  });

  it("keeps the round tube insert inside the cylinder", () => {
    const radius = 33.6;
    const wall = 2.2;
    const inner = tubeInnerRadius(radius, wall);
    const placed = tubeInsertRadius(inner);
    const disc = tubeInsertOuter(inner);
    expect(placed).toBeCloseTo(inner - 0.4, 5);
    expect(disc).toBeLessThanOrEqual(inner);
    expect(disc).toBeLessThanOrEqual(radius);
  });
});
