import { describe, expect, it } from "vitest";
import { cartonMarkSize } from "../../geometry/logos.ts";
import { MARK_FACE_GAP } from "./kit.tsx";
import { sleeveInnerDepth, sleeveInnerMarkZ } from "./build/sleeve.tsx";
import { tubeInnerRadius, tubeInsertOuter, tubeInsertRadius, tubeMarkBand } from "./build/tube.tsx";

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

  it("wraps the tube mark in a band about 35 mm wide and 60 degrees", () => {
    const radius = 33.6;
    const band = tubeMarkBand(radius);
    expect(band.radius).toBeCloseTo(radius + MARK_FACE_GAP, 5);
    expect(band.angle).toBeCloseTo(Math.PI / 3, 5);
    expect(band.thetaStart).toBeCloseTo(-band.angle / 2, 5);
    expect(band.arc).toBeGreaterThan(34);
    expect(band.arc).toBeLessThan(37);
    const sized = cartonMarkSize(band.arc, 4);
    expect(sized.width).toBeGreaterThan(30);
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
