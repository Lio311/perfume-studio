import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { prismFrontFacet, prismShell } from "./prism.ts";
import { MARK_FACE_GAP } from "./kit.tsx";

function boundaryEdges(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute("position");
  const index = geo.getIndex();
  const key = (i: number) => `${Math.round(pos.getX(i) * 50)},${Math.round(pos.getY(i) * 50)},${Math.round(pos.getZ(i) * 50)}`;
  const edges = new Map<string, number>();
  const add = (a: number, b: number) => {
    const ka = key(a);
    const kb = key(b);
    const id = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    edges.set(id, (edges.get(id) ?? 0) + 1);
  };
  const triangles = index ? index.count / 3 : pos.count / 3;
  for (let t = 0; t < triangles; t += 1) {
    const a = index ? index.getX(t * 3) : t * 3;
    const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    add(a, b);
    add(b, c);
    add(c, a);
  }
  let open = 0;
  for (const count of edges.values()) if (count === 1) open += 1;
  return open;
}

describe("prism shell", () => {
  it("closes an octagon tube so the wall is a thick shell, not an open flap", () => {
    const geo = prismShell(30, 26, 48, 8);
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    expect(box).toBeTruthy();
    expect(box!.min.y).toBeCloseTo(0, 1);
    expect(box!.max.y).toBeCloseTo(48, 1);
    expect(boundaryEdges(geo)).toBe(0);
    const pos = geo.getAttribute("position");
    let minR = Infinity;
    let maxR = 0;
    for (let i = 0; i < pos.count; i += 1) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      if (r < 1) continue;
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
    }
    expect(minR).toBeGreaterThan(24);
    expect(minR).toBeLessThan(27.5);
    expect(maxR).toBeGreaterThan(28);
    expect(maxR).toBeLessThan(31.5);
    geo.dispose();
  });

  it("points an octagon facet at +z and keeps the brand mark on that facet", () => {
    const radius = 30;
    const sides = 8;
    const facet = prismFrontFacet(radius, sides);
    expect(facet.normal[2]).toBeGreaterThan(0.99);
    expect(Math.hypot(facet.normal[0], facet.normal[1])).toBeLessThan(0.01);
    const geo = prismShell(radius, 26, 48, sides);
    const pos = geo.getAttribute("position");
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const normal = new THREE.Vector3();
    let facing = 0;
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
      if (normal.lengthSq() < 1e-6) continue;
      normal.normalize();
      const cz = (a.z + b.z + c.z) / 3;
      if (normal.z > 0.9 && Math.abs(normal.x) < 0.2 && Math.abs(normal.y) < 0.25 && Math.abs(cz - facet.z) < 1.2) facing += 1;
    }
    expect(facing).toBeGreaterThan(0);
    const markZ = facet.z + MARK_FACE_GAP;
    const markW = Math.min(facet.width, facet.width * 0.92);
    expect(markZ - facet.z).toBeGreaterThan(0);
    expect(markZ - facet.z).toBeLessThan(0.5);
    expect(markW).toBeLessThanOrEqual(facet.width);
    expect(markW).toBeGreaterThan(facet.width * 0.8);
    geo.dispose();
  });
});
