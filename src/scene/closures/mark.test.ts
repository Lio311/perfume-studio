import { describe, expect, it } from "vitest";
import { MARK_FACE_GAP } from "./kit.tsx";
import { sleeveInnerMarkZ } from "./build/sleeve.tsx";
import { tubeMarkWidth } from "./build/tube.tsx";

describe("carton mark placement", () => {
  it("keeps the brand offset under half a millimetre", () => {
    expect(MARK_FACE_GAP).toBeGreaterThan(0);
    expect(MARK_FACE_GAP).toBeLessThan(0.5);
  });

  it("holds the inner sleeve mark behind the sleeve wall", () => {
    const depth = 68;
    const wall = 2.2;
    const inner = depth - wall * 1.6;
    const z = sleeveInnerMarkZ(depth, wall, inner);
    expect(z).toBeLessThan(depth / 2 - wall);
    expect(z).toBeGreaterThan(0);
  });

  it("shrinks the tube mark so the flat chord stays near the cylinder", () => {
    const radius = 34;
    const width = tubeMarkWidth(radius);
    expect(width).toBeLessThan(52);
    const half = width / 2 / 0.92;
    const sagitta = radius - Math.sqrt(radius * radius - half * half);
    expect(sagitta).toBeLessThan(1.6);
    expect(width).toBeGreaterThan(16);
  });
});
