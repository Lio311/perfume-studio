import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { buildPartGeometry } from "./partMesh.ts";
import { glbFilename, type PartMeshInput } from "./partSpec.ts";

/**
 * Binary glTF, metres, Y up. The schema's MeshAsset forces `units: "mm"` whenever
 * `format` is `glb`, so this metres file is not attached to the supplier pack.
 */
export async function exportPartGlb(input: PartMeshInput): Promise<ArrayBuffer> {
  const geometry = buildPartGeometry(input);
  const material = new THREE.MeshStandardMaterial({
    color: input.color || "#d8d2c8",
    roughness: 0.42,
    metalness: 0.04,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = input.name || glbFilename(input.kind, input.widthMm, input.heightMm, input.depthMm).replace(/\.glb$/, "");
  const scene = new THREE.Scene();
  scene.name = "scan";
  scene.add(mesh);
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, { binary: true });
  geometry.dispose();
  material.dispose();
  if (result instanceof ArrayBuffer) return result;
  throw new Error("GLB export did not return a binary buffer");
}
