import { describe, expect, it } from "vitest";
import { boxEdgeMm, extrudeBox } from "./extrude.ts";

describe("box extrude", () => {
  it("builds a rounded box in metres from width, height and depth", () => {
    expect(boxEdgeMm(60, 100, 40)).toBeLessThanOrEqual(2);
    const geometry = extrudeBox(60, 100, 40);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.max.x - box.min.x).toBeCloseTo(0.06, 4);
    expect(box.max.y - box.min.y).toBeCloseTo(0.1, 4);
    expect(box.max.z - box.min.z).toBeCloseTo(0.04, 4);
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(Math.abs(box.min.x + box.max.x)).toBeLessThan(1e-6);
    geometry.dispose();
  });
});