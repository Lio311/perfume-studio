import * as THREE from "three";
import type { Design } from "../../model/types.ts";
import { assemblyBounds, fitPose, orbitLimits, type StageFrame } from "../framing.ts";
import { clampPolarOffset } from "../orbitGlide.ts";

/** Closed approach, slightly above the closed shot, still inside the polar clamp. */
const APPROACH_DIR = new THREE.Vector3(0.72, 0.46, 1).normalize();
/** Open hero. High enough to see into the carton, low enough to stay in orbit. */
const HERO_DIR = new THREE.Vector3(0.62, 0.72, 0.95).normalize();

const HERO_FILL = 0.58;
const APPROACH_FILL = 0.62;

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

function clampPose(pose: CameraPose, radius: number, fov: number): CameraPose {
  const limits = orbitLimits(Math.max(18, radius), fov);
  const target = pose.target.clone();
  target.y = Math.max(6, target.y);
  const offset = pose.position.clone().sub(target);
  const len = THREE.MathUtils.clamp(offset.length() || 1, limits.min, limits.max);
  clampPolarOffset(offset, len);
  return { position: target.clone().add(offset), target };
}

function poseFor(design: Design, frame: StageFrame, fov: number, lidOpen: boolean, dir: THREE.Vector3, fill: number): CameraPose {
  const bounds = assemblyBounds(design, 0, "box", lidOpen);
  const sphere = new THREE.Sphere();
  bounds.getBoundingSphere(sphere);
  const fitted = fitPose(bounds, dir, fov, frame, fill);
  return clampPose(fitted, Math.max(18, sphere.radius), fov);
}

/** Composed view of the closed carton, in the stage slot rather than under the panels. */
export function approachPose(design: Design, frame: StageFrame, fov = 30): CameraPose {
  return poseFor(design, frame, fov, false, APPROACH_DIR, APPROACH_FILL);
}

/**
 * Hero on the open carton. The fit uses the stage slot, so the dock and the
 * side panels stay outside the product.
 */
export function heroPose(design: Design, frame: StageFrame, fov = 30): CameraPose {
  return poseFor(design, frame, fov, true, HERO_DIR, HERO_FILL);
}

export function tuneUnboxCamera(camera: THREE.PerspectiveCamera, dist: number, radius: number): void {
  const limits = orbitLimits(Math.max(18, radius), camera.fov);
  const near = THREE.MathUtils.clamp(limits.near, 0.2, Math.max(0.4, dist * 0.08));
  const far = Math.max(limits.far, dist * 8);
  if (Math.abs(camera.near - near) < near * 0.2 && Math.abs(camera.far - far) < 20) return;
  camera.near = near;
  camera.far = far;
  camera.updateProjectionMatrix();
}
