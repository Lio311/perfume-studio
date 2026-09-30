import * as THREE from "three";
import { computeFit } from "../model/fit.ts";
import type { Design, PartKey } from "../model/types.ts";
import { explodeLocal } from "./explodeCurve.ts";
import type { StageMode } from "../store/labStore.ts";
import { frameFor, posedFrame, turntableHome } from "./Guides.tsx";

const PARTS: PartKey[] = ["bottle", "liquid", "label", "collar", "pump", "cap", "box"];
const scratch = new THREE.PerspectiveCamera(30, 1, 0.5, 5000);
const center = new THREE.Vector3();
const projected = new THREE.Vector3();

export interface StageFrame {
  width: number;
  height: number;
  stageLeft: number;
  stageTop: number;
  stageWidth: number;
  stageHeight: number;
  gutter: number;
  openTop: number;
  openHeight: number;
}

export function gutterFor(slotWidth: number): number {
  if (slotWidth < 520) return 78;
  if (slotWidth < 760) return 96;
  return 112;
}

/** Distance clamps from the current framing sphere. Angles are unitless, so R stays in millimetres. */
export function orbitLimits(radius: number, fovDeg: number): { min: number; max: number; near: number; far: number } {
  const span = Math.max(12, radius);
  const sin = Math.max(0.08, Math.sin((fovDeg * Math.PI) / 360));
  return {
    min: ((1.25 * span) / sin) * 0.55,
    max: (2.2 * span) / sin,
    near: span * 0.02,
    far: span * 60,
  };
}

/** Space kept clear under the gesture hint. */
export const STAGE_HINT_MARGIN = 36;
/** Fallback clearance when the dock has not been measured yet. */
export const STAGE_DOCK_MARGIN = 108;

/** Open slot between the hint row and the dock. Dock height is added to the bottom margin. */
export function stageOpenSlot(stageTop: number, stageHeight: number, dockHeight = 0): { openTop: number; openHeight: number } {
  const openTop = stageTop + STAGE_HINT_MARGIN;
  const dock = Math.max(0, dockHeight);
  const openHeight = Math.max(120, stageHeight - STAGE_HINT_MARGIN - STAGE_DOCK_MARGIN - dock);
  return { openTop, openHeight };
}

export function readStageFrame(canvas: HTMLCanvasElement): StageFrame {
  const canvasRect = canvas.getBoundingClientRect();
  const width = canvasRect.width || canvas.clientWidth || 1;
  const height = canvasRect.height || canvas.clientHeight || 1;
  const slot = document.querySelector(".stage-slot")?.getBoundingClientRect();
  const stageLeft = slot && slot.width > 80 ? slot.left - canvasRect.left : width * 0.2;
  const stageTop = slot && slot.height > 80 ? slot.top - canvasRect.top : height * 0.12;
  const stageWidth = slot && slot.width > 80 ? slot.width : width * 0.6;
  const stageHeight = slot && slot.height > 80 ? slot.height : height * 0.76;
  const gutter = gutterFor(stageWidth);
  const dock = document.querySelector(".dock")?.getBoundingClientRect();
  const dockHeight = dock && dock.height > 0 ? dock.height : 0;
  const { openTop, openHeight } = stageOpenSlot(stageTop, stageHeight, dockHeight);
  return { width, height, stageLeft, stageTop, stageWidth, stageHeight, gutter, openTop, openHeight };
}

function expandFrame(box: THREE.Box3, frame: ReturnType<typeof frameFor>, explode: number, pad = 2) {
  const local = explodeLocal(frame.index, explode);
  const cx = frame.home[0] + frame.explode[0] * local + frame.center[0];
  const cy = frame.home[1] + frame.explode[1] * local + frame.center[1];
  const cz = frame.home[2] + frame.explode[2] * local + frame.center[2];
  const hx = frame.size[0] / 2 + pad;
  const hy = frame.size[1] / 2 + pad;
  const hz = frame.size[2] / 2 + pad;
  box.expandByPoint(new THREE.Vector3(cx - hx, cy - hy, cz - hz));
  box.expandByPoint(new THREE.Vector3(cx + hx, cy + hy, cz + hz));
}

export function assemblyBounds(design: Design, explode: number, stage: StageMode = "bottle", lidOpen = false): THREE.Box3 {
  const fit = computeFit(design, explode > 0.45);
  const box = new THREE.Box3();
  if (stage === "box") {
    const frame = posedFrame("box", fit, "box");
    expandFrame(box, frame, explode, 4);
    box.max.y += explode * fit.boxH * 0.42;
    if (lidOpen) {
      const structure = design.box.structure ?? "lift-off";
      const drawer = structure === "drawer";
      const telescope = structure === "lift-off" && design.box.liftOff?.variant === "telescope-full";
      if (telescope) {
        box.min.x -= fit.boxW * 1.22;
        box.max.y += fit.boxH * 0.22;
        box.max.z += fit.boxD * 0.32;
        box.min.z -= fit.boxD * 0.06;
      } else if (structure === "tube") {
        box.max.y += fit.boxH * 0.95;
        box.max.z += fit.boxD * 0.42;
        box.min.z -= fit.boxD * 0.08;
      } else {
        box.max.y += drawer ? fit.capH * 0.45 : fit.boxH * 0.72;
        box.max.z += drawer ? fit.boxD * 0.98 : fit.boxD * 0.42;
        box.min.z -= fit.boxD * (structure === "book" ? 0.35 : 0.08);
      }
      box.expandByPoint(new THREE.Vector3(0, fit.seatY + fit.bottleH + fit.capH * 0.35, drawer ? fit.boxD * 0.7 : 0));
    }
    return box;
  }
  for (const part of PARTS) {
    if (!design[part].visible) continue;
    if (part === "liquid" && !design.bottle.visible) continue;
    if (part === "box" && stage !== "together") continue;
    const frame = part === "box" && stage === "together"
      ? { ...frameFor(part, fit), home: [-(fit.bottleW * 0.5 + fit.boxW * 0.5 + 32), 0, 6] as [number, number, number], explode: [0, 0, 0] as [number, number, number] }
      : frameFor(part, fit);
    expandFrame(box, frame, explode);
  }
  if (box.isEmpty()) box.set(new THREE.Vector3(-30, 0, -30), new THREE.Vector3(30, 80, 30));
  box.expandByPoint(new THREE.Vector3(0, 0, 0));
  return box;
}

export function partBounds(design: Design, explode: number, part: PartKey, stage: StageMode, solo = false, lidOpen = false): THREE.Box3 {
  const fit = computeFit(design, explode > 0.45);
  const frame = posedFrame(part, fit, stage);
  if (solo) {
    const home = turntableHome(frame);
    const parked = { ...frame, home, explode: [0, 0, 0] as [number, number, number] };
    const box = new THREE.Box3();
    expandFrame(box, parked, 0, 6);
    return box;
  }
  const box = new THREE.Box3();
  expandFrame(box, frame, explode, 4);
  const minHalf = 18;
  const cx = (box.min.x + box.max.x) / 2;
  const cy = (box.min.y + box.max.y) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  box.min.x = Math.min(box.min.x, cx - minHalf);
  box.max.x = Math.max(box.max.x, cx + minHalf);
  box.min.y = Math.min(box.min.y, cy - minHalf);
  box.max.y = Math.max(box.max.y, cy + minHalf);
  box.min.z = Math.min(box.min.z, cz - minHalf);
  box.max.z = Math.max(box.max.z, cz + minHalf);
  if (stage === "box" && part === "box") box.max.y += explode * fit.boxH * 0.28;
  if (lidOpen && part === "box") {
    box.max.y += fit.boxH * 0.95;
    box.min.z -= fit.boxD * 0.4;
    box.max.z += fit.boxD * 0.75;
    box.max.x += fit.boxW * 0.9;
  }
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

const FILL = 0.66;
export const FOCUS_FILL = 0.6;
/** Box stage target, as a fraction of the viewport-height safe rect. Lands near 64% of the viewport. */
export const BOX_FILL = 0.71;

/** Full-viewport frame for the carton, so the dock slot does not shrink the product. */
export function boxViewportFrame(width: number, height: number): StageFrame {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  return {
    width: w,
    height: h,
    stageLeft: w * 0.04,
    stageTop: 0,
    stageWidth: w * 0.92,
    stageHeight: h,
    gutter: 0,
    openTop: h * 0.03,
    openHeight: h * 0.94,
  };
}

export function safeRect(frame: StageFrame): { left: number; right: number; top: number; bottom: number; width: number; height: number } {
  const gutter = Math.min(frame.gutter, 96) * 0.55;
  const left = frame.stageLeft + gutter;
  const right = frame.stageLeft + frame.stageWidth - gutter;
  const top = frame.openTop + 16;
  const bottom = frame.openTop + frame.openHeight - 18;
  return { left, right, top, bottom, width: Math.max(80, right - left), height: Math.max(80, bottom - top) };
}

/**
 * Canvas pixels covered by the top toolbar (14px chrome padding plus the 64px bar).
 * The front view shifts under this band. The global safe rect stays put, so other
 * views keep their size.
 */
export const TOOLBAR_COVER_PX = 78;

const coverCam = new THREE.PerspectiveCamera(30, 1, 0.4, 8000);
const coverPoint = new THREE.Vector3();
const coverUp = new THREE.Vector3();

function projectedExtent(
  pose: { position: THREE.Vector3; target: THREE.Vector3 },
  bounds: THREE.Box3,
  frame: StageFrame,
  fov: number,
): { top: number; height: number } {
  coverCam.fov = fov;
  coverCam.aspect = frame.width / Math.max(1, frame.height);
  coverCam.position.copy(pose.position);
  coverCam.up.set(0, 1, 0);
  coverCam.lookAt(pose.target);
  coverCam.updateProjectionMatrix();
  coverCam.updateMatrixWorld();
  let minY = Infinity;
  let maxY = -Infinity;
  const { min, max } = bounds;
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        coverPoint.set(x, y, z).project(coverCam);
        const sy = (-coverPoint.y * 0.5 + 0.5) * frame.height;
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy);
      }
    }
  }
  return { top: minY, height: Math.max(0, maxY - minY) };
}

function shiftDownScreen(
  pose: { position: THREE.Vector3; target: THREE.Vector3 },
  pixels: number,
  frame: StageFrame,
  fov: number,
): { position: THREE.Vector3; target: THREE.Vector3 } {
  const dist = Math.max(1, pose.position.distanceTo(pose.target));
  const vFov = (fov * Math.PI) / 180;
  const worldPerPixel = (2 * Math.tan(vFov / 2) * dist) / Math.max(1, frame.height);
  coverCam.fov = fov;
  coverCam.aspect = frame.width / Math.max(1, frame.height);
  coverCam.position.copy(pose.position);
  coverCam.up.set(0, 1, 0);
  coverCam.lookAt(pose.target);
  coverCam.updateMatrixWorld();
  coverUp.setFromMatrixColumn(coverCam.matrixWorld, 1).normalize();
  const delta = coverUp.multiplyScalar(pixels * worldPerPixel);
  return {
    position: pose.position.clone().add(delta),
    target: pose.target.clone().add(delta),
  };
}

/**
 * Raise the orbit target and the camera together so the subject drops below the toolbar.
 * Distance and direction stay the same, so the product does not change size.
 * A subject that is already clear is returned unchanged.
 */
export function clearToolbar(
  pose: { position: THREE.Vector3; target: THREE.Vector3 },
  bounds: THREE.Box3,
  frame: StageFrame,
  fov: number,
  coverPx = TOOLBAR_COVER_PX,
): { position: THREE.Vector3; target: THREE.Vector3 } {
  let next = { position: pose.position.clone(), target: pose.target.clone() };
  for (let pass = 0; pass < 4; pass += 1) {
    const top = projectedExtent(next, bounds, frame, fov).top;
    const overlap = coverPx - top;
    if (!Number.isFinite(overlap) || overlap <= 0.5) return next;
    next = shiftDownScreen(next, overlap, frame, fov);
  }
  return next;
}

function projectBox(corners: THREE.Vector3[], canvasW: number, canvasH: number): { w: number; h: number; cx: number; cy: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const corner of corners) {
    projected.copy(corner).project(scratch);
    const x = (projected.x * 0.5 + 0.5) * canvasW;
    const y = (-projected.y * 0.5 + 0.5) * canvasH;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY), cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export function fitPose(
  bounds: THREE.Box3,
  direction: THREE.Vector3,
  fov: number,
  frame: StageFrame,
  fill = FILL,
  ceiling = 0.78,
): { position: THREE.Vector3; target: THREE.Vector3 } {
  bounds.getCenter(center);
  const corners = cornersOf(bounds);
  const dir = direction.clone().normalize();
  const aspect = frame.width / Math.max(1, frame.height);
  scratch.fov = fov;
  scratch.aspect = aspect;
  scratch.near = 0.4;
  scratch.far = 5000;
  scratch.updateProjectionMatrix();

  const place = (distance: number, target: THREE.Vector3) => {
    scratch.position.copy(target).addScaledVector(dir, distance);
    scratch.up.set(0, 1, 0);
    scratch.lookAt(target);
    scratch.updateMatrixWorld();
  };

  const safe = safeRect(frame);
  const targetPx = safe.height * fill;
  const allowedW = safe.width * 0.9;
  let best = 520;
  const target = center.clone();
  for (let pass = 0; pass < 5; pass += 1) {
    place(best, target);
    const box = projectBox(corners, frame.width, frame.height);
    if (!Number.isFinite(box.h) || box.h < 2) {
      best *= 1.35;
      continue;
    }
    best *= THREE.MathUtils.clamp(box.h / targetPx, 0.55, 2.4);
  }
  place(best, target);
  const wide = projectBox(corners, frame.width, frame.height);
  if (wide.w > allowedW) best *= wide.w / allowedW;

  const aimX = (safe.left + safe.right) / 2;
  const aimY = (safe.top + safe.bottom) / 2;
  for (let pass = 0; pass < 4; pass += 1) {
    place(best, target);
    const box = projectBox(corners, frame.width, frame.height);
    const dx = box.cx - aimX;
    const dy = box.cy - aimY;
    const vFov = (fov * Math.PI) / 180;
    const worldPerPixelY = (2 * Math.tan(vFov / 2) * best) / frame.height;
    const worldPerPixelX = worldPerPixelY * aspect;
    const right = new THREE.Vector3().setFromMatrixColumn(scratch.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(scratch.matrixWorld, 1);
    target.addScaledVector(right, dx * worldPerPixelX);
    target.addScaledVector(up, -dy * worldPerPixelY);
  }

  const marginX = safe.width * 0.04;
  const marginY = safe.height * 0.05;
  for (let pass = 0; pass < 6; pass += 1) {
    place(best, target);
    const box = projectBox(corners, frame.width, frame.height);
    const left = box.cx - box.w / 2;
    const rightEdge = box.cx + box.w / 2;
    const top = box.cy - box.h / 2;
    const bottom = box.cy + box.h / 2;
    const inside = left >= safe.left + marginX && rightEdge <= safe.right - marginX && top >= safe.top + marginY && bottom <= safe.bottom - marginY;
    const heightCap = safe.height * Math.min(ceiling, Math.max(fill, 0.5));
    if (inside && box.h <= heightCap && box.w <= safe.width * 0.92 && box.h >= safe.height * fill * 0.92) break;
    const hScale = box.h / Math.max(1, safe.height * fill);
    const wScale = box.w / Math.max(1, allowedW);
    const overflow = Math.max(hScale, wScale, inside ? 1 : 1.06);
    best *= overflow > 1.02 ? overflow : Math.max(0.9, hScale);
  }

  const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
  best = Math.max(best, radius * 1.12);
  const position = target.clone().addScaledVector(dir, best);
  return { position, target };
}
