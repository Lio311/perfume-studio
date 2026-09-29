import { describe, expect, it } from "vitest";
import { cartonMarkSize } from "../../geometry/logos.ts";
import { MARK_FACE_GAP } from "./kit.tsx";
import { sleeveInnerDepth, sleeveInnerMarkZ } from "./build/sleeve.tsx";
import { tubeMarkWidth } from "./build/tube.tsx";

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

  it("shrinks the tube mark once so the flat chord stays near the cylinder", () => {
    const radius = 34;
    const chord = tubeMarkWidth(radius);
    const plane = cartonMarkSize(chord, 4).width;
    expect(plane).toBeCloseTo(Math.min(52, chord * 0.92), 4);
    expect(plane).toBeGreaterThan(16);
    const half = plane / 2;
    const sagitta = radius - Math.sqrt(radius * radius - half * half);
    expect(sagitta).toBeLessThan(1.6);
  });
});
