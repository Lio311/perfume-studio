import { describe, expect, it } from "vitest";
import bottleText from "../../../ios/Packages/PackKit/Tests/PackKitTests/Fixtures/revolve/cylinder-bottle.json?raw";
import capText from "../../../ios/Packages/PackKit/Tests/PackKitTests/Fixtures/revolve/cap.json?raw";
import shoulderText from "../../../ios/Packages/PackKit/Tests/PackKitTests/Fixtures/revolve/shouldered-bottle.json?raw";
import { latheGeometry } from "../../import/lathe.ts";
import { revolveLathe } from "./revolve.ts";

interface RevolveFixture {
  name: string;
  widthMm: number;
  heightMm: number;
  profile: number[];
  segments: number;
  web: { vertexCount: number; indexCount: number };
  expected: {
    bboxMinM: [number, number, number];
    bboxMaxM: [number, number, number];
    firstRingMeters: [number, number, number][];
  };
}

const FIXTURES = [bottleText, shoulderText, capText].map((text) => JSON.parse(text) as RevolveFixture);

describe("scan revolve matches the PackKit fixtures", () => {
  for (const fixture of FIXTURES) {
    it(fixture.name, () => {
      const radiusMm = fixture.widthMm / 2;
      const mesh = revolveLathe(fixture.profile, fixture.heightMm, radiusMm);
      const lathe = latheGeometry(fixture.profile, fixture.heightMm, radiusMm);
      expect(mesh.segments).toBe(fixture.segments);
      expect(mesh.positions.length / 3).toBe(fixture.web.vertexCount);
      expect(mesh.indices.length).toBe(fixture.web.indexCount);

      const attribute = lathe.getAttribute("position");
      const index = lathe.getIndex();
      expect(index).not.toBeNull();
      expect(mesh.indices.length).toBe(index!.count);
      for (let cursor = 0; cursor < index!.count; cursor += 1) {
        expect(mesh.indices[cursor]).toBe(index!.getX(cursor));
      }
      for (let vertex = 0; vertex < attribute.count; vertex += 1) {
        expect(Math.abs(mesh.positions[vertex * 3] - attribute.getX(vertex) / 1000)).toBeLessThanOrEqual(1e-6);
        expect(Math.abs(mesh.positions[vertex * 3 + 1] - attribute.getY(vertex) / 1000)).toBeLessThanOrEqual(1e-6);
        expect(Math.abs(mesh.positions[vertex * 3 + 2] - attribute.getZ(vertex) / 1000)).toBeLessThanOrEqual(1e-6);
      }
      lathe.dispose();

      const pointCount = fixture.profile.length + 2;
      fixture.expected.firstRingMeters.forEach((expected, column) => {
        const vertex = 1 + column * pointCount;
        expect(Math.abs(mesh.positions[vertex * 3] - expected[0])).toBeLessThanOrEqual(1e-6);
        expect(Math.abs(mesh.positions[vertex * 3 + 1] - expected[1])).toBeLessThanOrEqual(1e-6);
        expect(Math.abs(mesh.positions[vertex * 3 + 2] - expected[2])).toBeLessThanOrEqual(1e-6);
      });

      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) {
        const x = mesh.positions[vertex * 3];
        const y = mesh.positions[vertex * 3 + 1];
        const z = mesh.positions[vertex * 3 + 2];
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);
      }
      const [ex0, ey0, ez0] = fixture.expected.bboxMinM;
      const [ex1, ey1, ez1] = fixture.expected.bboxMaxM;
      expect(Math.abs(minX - ex0)).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(minY - ey0)).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(minZ - ez0)).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(maxX - ex1)).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(maxY - ey1)).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(maxZ - ez1)).toBeLessThanOrEqual(1e-6);
    });
  }
});
