import * as THREE from "three";
import { extrudeBox } from "./extrude.ts";
import { isRoundPart, type PartMeshInput } from "./partSpec.ts";
import { revolveLathe } from "./revolve.ts";

export type { PartMeshInput } from "./partSpec.ts";
export { glbFilename } from "./partSpec.ts";

/** Round parts revolve the lathe. A box (and a flat label) is a rounded-rect extrude. */
export function buildPartGeometry(input: PartMeshInput): THREE.BufferGeometry {
  if (isRoundPart(input.kind)) {
    const samples = input.lathe && input.lathe.length >= 4 ? input.lathe : Array.from({ length: 42 }, () => 1);
    const radiusMm = input.widthMm / 2;
    const mesh = revolveLathe(samples, input.heightMm, radiusMm);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    geometry.setIndex(Array.from(mesh.indices));
    geometry.computeVertexNormals();
    return geometry;
  }
  const depth = input.kind === "label" ? Math.max(input.depthMm, 0.4) : input.depthMm;
  return extrudeBox(input.widthMm, input.heightMm, depth);
}
