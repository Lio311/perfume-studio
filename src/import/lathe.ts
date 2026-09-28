import * as THREE from "three";

export interface LatheProfile {
  /** Radius samples from the base to the top, 0–1 of the widest point. */
  radii: number[];
}

const profiles = new Map<string, LatheProfile>();

export function clearLatheProfiles(): void {
  profiles.clear();
}

export function setLatheProfile(id: string, profile: LatheProfile | null): void {
  if (!profile || profile.radii.length < 4) profiles.delete(id);
  else profiles.set(id, profile);
}

export function latheProfile(id: string): LatheProfile | undefined {
  return profiles.get(id);
}

/** Revolve a half-profile around Y. `radius` is the widest radius in millimetres. */
export function latheGeometry(radii: number[], height: number, radius: number): THREE.LatheGeometry {
  const points = radii.map((sample, index) => {
    const y = (index / Math.max(1, radii.length - 1)) * height;
    return new THREE.Vector2(Math.max(0.35, sample * radius), y);
  });
  const geometry = new THREE.LatheGeometry(points, 128);
  geometry.computeVertexNormals();
  return geometry;
}
