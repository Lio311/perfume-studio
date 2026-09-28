import { describe, expect, it } from "vitest";
import { CAPS } from "../model/caps.ts";
import { BOTTLES } from "../model/bottles.ts";
import { neckRadius } from "../model/necks.ts";
import { buildBottleGeometry, buildCapGeometry, buildLabelPatch } from "./sweep.ts";

function box(geo: { computeBoundingBox: () => void; boundingBox: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null }) {
  geo.computeBoundingBox();
  const bounds = geo.boundingBox;
  if (!bounds) throw new Error("missing bounds");
  return bounds;
}

describe("bottle shell, liquid and label share one profile", () => {
  it("keeps every bottle's liquid inside the glass and the label on the front", () => {
    expect(BOTTLES.length).toBeGreaterThanOrEqual(59);
    for (const bottle of BOTTLES) {
      const neckR = neckRadius(bottle.neck);
      const args = {
        height: bottle.heightMm,
        width: bottle.widthMm,
        depth: bottle.depthMm,
        section: bottle.section,
        softness: bottle.softness,
        faceted: bottle.faceted,
        neckR,
        profile: bottle.profile,
        shoulder: bottle.shoulder,
        finishMm: bottle.finishMm,
      };
      const glass = buildBottleGeometry(args);
      const fill = Math.min(bottle.heightMm - 6, Math.max(8, bottle.heightMm * 0.62));
      const liquid = buildBottleGeometry({ ...args, neckR: Math.max(3, neckR - 1.2), inset: 1.5, closedTop: true, limitY: fill });
      const label = buildLabelPatch({ ...args, yCenter: bottle.heightMm * 0.42, patchH: 16, patchW: Math.min(28, bottle.widthMm * 0.55) });
      const g = box(glass);
      const l = box(liquid);
      const p = box(label);
      expect(g.max.x, bottle.id).toBeLessThanOrEqual(bottle.widthMm / 2 * 1.28 + 1);
      expect(g.max.z, bottle.id).toBeLessThanOrEqual(bottle.depthMm / 2 * 1.28 + 1);
      expect(g.max.y, bottle.id).toBeLessThanOrEqual(bottle.heightMm + 0.6);
      expect(g.min.y, bottle.id).toBeGreaterThanOrEqual(-0.2);
      expect(l.max.x, bottle.id).toBeLessThan(g.max.x - 0.15);
      expect(l.max.z, bottle.id).toBeLessThan(g.max.z - 0.15);
      expect(l.max.y, bottle.id).toBeLessThanOrEqual(fill + 3.2);
      expect(Math.abs(p.max.x), bottle.id).toBeLessThanOrEqual(bottle.widthMm / 2 + 1);
      expect(p.max.z, bottle.id).toBeLessThan(8);
      expect(p.min.z, bottle.id).toBeGreaterThan(-bottle.depthMm);
      const pos = label.getAttribute("position");
      const uv = label.getAttribute("uv");
      let leftX = Infinity;
      let rightX = -Infinity;
      let leftU = 0;
      let rightU = 0;
      let lowY = Infinity;
      let highY = -Infinity;
      let lowV = 0;
      let highV = 0;
      if (!pos || !uv) throw new Error("label attributes");
      for (let i = 0; i < pos.count; i += 1) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        if (x < leftX) {
          leftX = x;
          leftU = uv.getX(i);
        }
        if (x > rightX) {
          rightX = x;
          rightU = uv.getX(i);
        }
        if (y < lowY) {
          lowY = y;
          lowV = uv.getY(i);
        }
        if (y > highY) {
          highY = y;
          highV = uv.getY(i);
        }
      }
      expect(leftU, bottle.id).toBeLessThan(rightU);
      expect(lowV, bottle.id).toBeLessThan(highV);
      glass.dispose();
      liquid.dispose();
      label.dispose();
    }
  });

  it("builds a sample of every cap family inside its millimetres", () => {
    const seen = new Set<string>();
    const sample = CAPS.filter((cap) => {
      if (seen.has(cap.profile)) return false;
      seen.add(cap.profile);
      return true;
    });
    expect(sample.length).toBeGreaterThanOrEqual(5);
    for (const cap of sample) {
      const geo = buildCapGeometry(cap.profile, cap.section, cap.heightMm, cap.widthMm, cap.depthMm, cap.softness, cap.faceted, 9);
      const b = box(geo);
      expect(b.max.y, cap.id).toBeLessThanOrEqual(cap.heightMm + 0.4);
      expect(b.max.y, cap.id).toBeGreaterThan(cap.heightMm * 0.9);
      expect(b.max.x, cap.id).toBeLessThanOrEqual(Math.max(cap.widthMm / 2, 9) * 1.15 + 1);
      geo.dispose();
    }
  });
});
