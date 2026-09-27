import * as THREE from "three";
import { computeFit } from "../model/fit.ts";
import type { Design, PartKey } from "../model/types.ts";
import { frameFor } from "./Guides.tsx";

const PARTS: PartKey[] = ["bottle", "liquid", "label", "collar", "pump", "cap", "box"];
const scratch = new THREE.PerspectiveCamera(30, 1, 0.5, 5000);
const center = new THREE.Vector3();
const projected = new THREE.Vector3();

function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1)));
  return t * t * (3 - 2 * t);
}

export interface SafeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export function gutterFor(slotWidth: number): number {
  if (slotWidth < 480) return 108;
  if (slotWidth < 700) return 136;
  return 168;
}

export function readStageSafe(canvas: HTMLCanvasElement): SafeRect {
  const canvasRect = canvas.getBoundingClientRect();
  const width = canvasRect.width || canvas.clientWidth || 1;
  const height = canvasRect.height || canvas.clientHeight || 1;
  const slot = document.querySelector(".stage-slot")?.getBoundingClientRect();
  if (!slot || slot.width < 80 || slot.height < 80) {
    return { left: width * 0.22, top: height * 0.16, right: width * 0.78, bottom: height * 0.82, width, height };
  }
  const gutter = gutterFor(slot.width);
  const left = slot.left - canvasRect.left + gutter;
  const right = slot.right - canvasRect.left - gutter;
  const top = slot.top - canvasRect.top + 36;
  const bottom = slot.bottom - canvasRect.top - 88;
  return {
    left: Math.min(left, width * 0.46),
    top: Math.max(8, top),
    right: Math.max(right, width * 0.54),
    bottom: Math.min(height - 8, Math.max(bottom, top + 80)),
    width,
    height,
  };
}

export function assemblyBounds(design: Design, explode: number): THREE.Box3 {
  const fit = computeFit(design, explode > 0.45);
  const box = new THREE.Box3();
  for (const part of PARTS) {
    if (!design[part].visible) continue;
    if (part === "liquid" && !design.bottle.visible) continue;
    const frame = frameFor(part, fit);
    const span = frame.index * 0.07;
    const local = smooth(span, span + 0.5, explode);
    const originX = frame.home[0] + frame.explode[0] * local;
    const originY = frame.home[1] + frame.explode[1] * local;
    const originZ = frame.home[2] + frame.explode[2] * local;
    const cx = originX + frame.center[0];
    const cy = originY + frame.center[1];
    const cz = originZ + frame.center[2];
    const hx = frame.size[0] / 2 + 4;
    const hy = frame.size[1] / 2 + 4;
    const hz = frame.size[2] / 2 + 4;
    box.expandByPoint(new THREE.Vector3(cx - hx, cy - hy, cz - hz));
    box.expandByPoint(new THREE.Vector3(cx + hx, cy + hy, cz + hz));
  }
  if (box.isEmpty()) box.set(new THREE.Vector3(-30, 0, -30), new THREE.Vector3(30, 80, 30));
  box.expandByPoint(new THREE.Vector3(0, 0, 0));
  return box;
}

function cornersOf(box: THREE.Box3): THREE.Vector3[] {
  const { min, max } = box;
  const points: THREE.Vector3[] = [];
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) points.push(new THREE.Vector3(x, y, z));
    }
  }
  return points;
}

export function fitPose(
  bounds: THREE.Box3,
  direction: THREE.Vector3,
  fov: number,
  safe: SafeRect,
): { position: THREE.Vector3; target: THREE.Vector3 } {
  bounds.getCenter(center);
  const corners = cornersOf(bounds);
  const dir = direction.clone().normalize();
  const aspect = safe.width / Math.max(1, safe.height);
  scratch.fov = fov;
  scratch.aspect = aspect;
  scratch.near = 0.5;
  scratch.far = 5000;
  scratch.updateProjectionMatrix();

  const place = (distance: number, target: THREE.Vector3) => {
    scratch.position.copy(target).addScaledVector(dir, distance);
    scratch.up.set(0, 1, 0);
    scratch.lookAt(target);
    scratch.updateMatrixWorld();
  };

  const contains = (target: THREE.Vector3, distance: number) => {
    place(distance, target);
    for (const corner of corners) {
      projected.copy(corner).project(scratch);
      if (projected.z < -1 || projected.z > 1) return false;
      const x = (projected.x * 0.5 + 0.5) * safe.width;
      const y = (-projected.y * 0.5 + 0.5) * safe.height;
      if (x < safe.left || x > safe.right || y < safe.top || y > safe.bottom) return false;
    }
    return true;
  };

  let low = 80;
  let high = 2200;
  let best = high;
  for (let i = 0; i < 16; i += 1) {
    const mid = (low + high) / 2;
    if (contains(center, mid)) {
      best = mid;
      high = mid;
    } else low = mid;
  }
  best *= 1.06;

  const target = center.clone();
  for (let pass = 0; pass < 3; pass += 1) {
    place(best, target);
    projected.copy(center).project(scratch);
    const px = (projected.x * 0.5 + 0.5) * safe.width;
    const py = (-projected.y * 0.5 + 0.5) * safe.height;
    const dx = px - (safe.left + safe.right) / 2;
    const dy = py - (safe.top + safe.bottom) / 2;
    const vFov = (fov * Math.PI) / 180;
    const worldPerPixelY = (2 * Math.tan(vFov / 2) * best) / safe.height;
    const worldPerPixelX = worldPerPixelY * aspect;
    const right = new THREE.Vector3().setFromMatrixColumn(scratch.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(scratch.matrixWorld, 1);
    target.addScaledVector(right, dx * worldPerPixelX);
    target.addScaledVector(up, -dy * worldPerPixelY);
    if (!contains(target, best)) best *= 1.08;
  }

  const position = target.clone().addScaledVector(dir, best);
  return { position, target };
}
