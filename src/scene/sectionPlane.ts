import * as THREE from "three";

/** World-space cut through the carton. `constant` is the box center on X. */
export const sectionPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
export const sectionPlanes: THREE.Plane[] = [sectionPlane];
