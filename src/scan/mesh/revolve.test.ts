import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import bottleText from "../../../fixtures/packkit/revolve/bottle.json?raw";
import capText from "../../../fixtures/packkit/revolve/cap.json?raw";
import sphereText from "../../../fixtures/packkit/revolve/sphere.json?raw";
import { latheGeometry } from "../../import/lathe.ts";
import { REVOLVE_PROFILES } from "./profiles.ts";
import { revolveLathe } from "./revolve.ts";

const FIXTURE_TEXT: Record<string, string> = { bottle: bottleText, cap: capText, sphere: sphereText };

interface RevolveFixture {
  name: string;
  heightMm: number;
  radiusMm: number;
  samples: number[];
  segments: number;
  positions: number[];
  indices: number[];
}

describe("scan revolve matches lathe.ts", () => {
  for (const profile of REVOLVE_PROFILES) {
    it(`matches the ${profile.name} fixture and lathe.ts`, () => {
      const samples = profile.samples();
      const mesh = revolveLathe(samples, profile.heightMm, profile.radiusMm);
      const lathe = latheGeometry(samples, profile.heightMm, profile.radiusMm);
      expect(mesh.segments).toBe(lathe.parameters.segments);
      expect(mesh.segments).toBe(128);
      const attribute = lathe.getAttribute("position");
      expect(mesh.positions.length).toBe(attribute.count * 3);
      for (let index = 0; index < attribute.count; index += 1) {
        expect(Math.abs(mesh.positions[index * 3] - attribute.getX(index) / 1000)).toBeLessThanOrEqual(1e-6);
        expect(Math.abs(mesh.positions[index * 3 + 1] - attribute.getY(index) / 1000)).toBeLessThanOrEqual(1e-6);
        expect(Math.abs(mesh.positions[index * 3 + 2] - attribute.getZ(index) / 1000)).toBeLessThanOrEqual(1e-6);
      }
      const index = lathe.getIndex();
      expect(index).not.toBeNull();
      expect(mesh.indices.length).toBe(index!.count);
      for (let cursor = 0; cursor < index!.count; cursor += 1) {
        expect(mesh.indices[cursor]).toBe(index!.getX(cursor));
      }
      lathe.dispose();

      const fixture = JSON.parse(FIXTURE_TEXT[profile.name]) as RevolveFixture;
      expect(fixture.segments).toBe(mesh.segments);
      expect(fixture.samples).toEqual(samples);
      expect(fixture.heightMm).toBe(profile.heightMm);
      expect(fixture.radiusMm).toBe(profile.radiusMm);
      expect(fixture.positions.length).toBe(mesh.positions.length);
      expect(fixture.indices.length).toBe(mesh.indices.length);
      for (let cursor = 0; cursor < mesh.positions.length; cursor += 1) {
        expect(Math.abs(fixture.positions[cursor] - mesh.positions[cursor])).toBeLessThanOrEqual(1e-6);
      }
      for (let cursor = 0; cursor < mesh.indices.length; cursor += 1) {
        expect(fixture.indices[cursor]).toBe(mesh.indices[cursor]);
      }
    });
  }

  it("reads the reference bottle glb as binary metres", () => {
    const bytes = new Uint8Array(readFileSync(new URL("../../../fixtures/packkit/revolve/bottle.glb", import.meta.url)));
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe("glTF");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as {
      accessors: Array<{ count: number; componentType: number; type: string; bufferView: number }>;
      bufferViews: Array<{ byteOffset?: number; byteLength: number }>;
      meshes: Array<{ primitives: Array<{ attributes: { POSITION?: number } }> }>;
    };
    const accessorIndex = json.meshes[0].primitives[0].attributes.POSITION ?? 0;
    const accessor = json.accessors[accessorIndex];
    const bufferView = json.bufferViews[accessor.bufferView];
    const binStart = 20 + jsonLength;
    const binHeader = 8;
    const positions = new Float32Array(
      bytes.buffer,
      bytes.byteOffset + binStart + binHeader + (bufferView.byteOffset ?? 0),
      accessor.count * 3,
    );
    const fixture = JSON.parse(bottleText) as RevolveFixture;
    expect(accessor.count).toBe(fixture.positions.length / 3);
    expect(Math.abs(positions[0] - fixture.positions[0])).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(positions[1] - fixture.positions[1])).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(positions[2] - fixture.positions[2])).toBeLessThanOrEqual(1e-6);
  });
});
