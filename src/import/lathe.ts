import * as THREE from "three";
export type { LatheProfile } from "./latheProfile.ts";
export { clearLatheProfiles, latheProfile, setLatheProfile } from "./latheProfile.ts";

/** Revolve a half-profile around Y. `radius` is the widest radius in millimetres. */
export function latheGeometry(radii: number[], height: number, radius: number): THREE.LatheGeometry {
  const points = radii.map((sample, index) => {
    const y = (index / Math.max(1, radii.length - 1)) * height;
    return new THREE.Vector2(Math.max(0.1, sample * radius), y);
  });
  
  if (points.length > 0) {
    const first = points[0];
    const last = points[points.length - 1];
    points.unshift(new THREE.Vector2(0, first.y));
    points.push(new THREE.Vector2(0, last.y));
  }

  const geometry = new THREE.LatheGeometry(points, 128);
  geometry.computeVertexNormals();
  return geometry;
}
