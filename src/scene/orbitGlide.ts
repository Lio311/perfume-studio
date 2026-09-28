import * as THREE from "three";

export interface Glide {
  yaw: number;
  pitch: number;
  zoom: number;
  panX: number;
  panY: number;
}

export function emptyGlide(): Glide {
  return { yaw: 0, pitch: 0, zoom: 0, panX: 0, panY: 0 };
}

/**
 * Pointer, touch, and trackpad orbit/pan are 18% quicker than the previous gains.
 * Wheel glide caps and per-frame steps scale with it. The per-event pixel cap,
 * polar limits, pinch zoom, and glide decay do not.
 */
export const GESTURE_SPEED = 1.18;
/** OrbitControls rotateSpeed: mouse-drag and one-finger touch. */
export const ROTATE_SPEED = 0.38 * GESTURE_SPEED;
/** OrbitControls panSpeed: mouse-drag and two-finger touch. */
export const PAN_SPEED = 0.42 * GESTURE_SPEED;
/** Yaw radians per wheel or trackpad pixel. */
export const TRACKPAD_YAW_GAIN = 0.00028 * GESTURE_SPEED;
/** Pitch radians per wheel or trackpad pixel. */
export const TRACKPAD_PITCH_GAIN = 0.00018 * GESTURE_SPEED;
/** Pan units per wheel or trackpad pixel. */
export const TRACKPAD_PAN_GAIN = 0.06 * GESTURE_SPEED;
/** Max yaw kept from wheel or trackpad events. */
export const YAW_BUFFER_CAP = 0.016 * GESTURE_SPEED;
/** Max pitch kept from wheel or trackpad events. */
export const PITCH_BUFFER_CAP = 0.01 * GESTURE_SPEED;
/** Max pan kept from wheel or trackpad events. */
export const PAN_BUFFER_CAP = 6 * GESTURE_SPEED;
/** Max yaw applied in one frame. */
export const YAW_STEP = 0.008 * GESTURE_SPEED;
/** Max pitch applied in one frame. */
export const PITCH_STEP = 0.005 * GESTURE_SPEED;
/** Max pan applied in one frame. */
export const PAN_STEP = 1.1 * GESTURE_SPEED;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(min, n));
}

/** Pixels from one wheel or trackpad event. A burst cannot push past the caps. */
export function pushGlide(glide: Glide, dx: number, dy: number, kind: "orbit" | "pinch" | "pan"): void {
  const x = clamp(dx, -80, 80);
  const y = clamp(dy, -80, 80);
  if (kind === "pan") {
    glide.panX = clamp(glide.panX + x * TRACKPAD_PAN_GAIN, -PAN_BUFFER_CAP, PAN_BUFFER_CAP);
    glide.panY = clamp(glide.panY + y * TRACKPAD_PAN_GAIN, -PAN_BUFFER_CAP, PAN_BUFFER_CAP);
    return;
  }
  if (kind === "pinch") {
    glide.zoom = clamp(glide.zoom + y * 0.0004, -0.035, 0.035);
    return;
  }
  glide.yaw = clamp(glide.yaw + x * TRACKPAD_YAW_GAIN, -YAW_BUFFER_CAP, YAW_BUFFER_CAP);
  glide.pitch = clamp(glide.pitch + y * TRACKPAD_PITCH_GAIN, -PITCH_BUFFER_CAP, PITCH_BUFFER_CAP);
}

/** Apply at most `cap` radians (or zoom units) this frame and keep the remainder. */
export function takeStep(value: number, cap: number): { step: number; rest: number } {
  if (!Number.isFinite(value)) return { step: 0, rest: 0 };
  const step = clamp(value, -cap, cap);
  return { step, rest: value - step };
}

export function decayGlide(glide: Glide, delta: number): void {
  const k = Math.exp(-Math.min(0.1, Math.max(0, delta)) * 26);
  const keys: Array<keyof Glide> = ["yaw", "pitch", "zoom", "panX", "panY"];
  for (const key of keys) {
    const next = glide[key] * k;
    glide[key] = Math.abs(next) < 0.00035 ? 0 : next;
  }
}

/** Radians from straight down. Below this the bottle becomes a plan view. */
export const MIN_POLAR = 0.78;
/** Radians from straight down. Above this the camera skims or crosses the floor. */
export const MAX_POLAR = 1.45;

/** Keep an orbit offset inside the polar window. A zero-length or straight-up offset gets a front azimuth. */
export function clampPolarOffset(offset: THREE.Vector3, length: number): THREE.Vector3 {
  const span = Number.isFinite(length) ? Math.max(1, length) : 1;
  if (offset.lengthSq() < 1e-8 || !Number.isFinite(offset.x)) offset.set(0.78, 0.22, 1);
  const polar = Math.acos(THREE.MathUtils.clamp(offset.y / (offset.length() || 1), -1, 1));
  const next = THREE.MathUtils.clamp(polar, MIN_POLAR, MAX_POLAR);
  let hx = offset.x;
  let hz = offset.z;
  if (Math.hypot(hx, hz) < 1e-4) {
    hx = 0.78;
    hz = 1;
  }
  const h = Math.hypot(hx, hz) || 1;
  offset.set((hx / h) * Math.sin(next) * span, Math.cos(next) * span, (hz / h) * Math.sin(next) * span);
  return offset;
}

export function polarAngle(position: THREE.Vector3, target: THREE.Vector3): number {
  const dx = position.x - target.x;
  const dy = position.y - target.y;
  const dz = position.z - target.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  return Math.acos(THREE.MathUtils.clamp(dy / len, -1, 1));
}

export function poseBroken(position: THREE.Vector3, target: THREE.Vector3, up: THREE.Vector3): boolean {
  const nums = [position.x, position.y, position.z, target.x, target.y, target.z, up.x, up.y, up.z];
  if (nums.some((n) => !Number.isFinite(n))) return true;
  if (up.lengthSq() < 0.25) return true;
  const dist = position.distanceTo(target);
  if (!(dist > 1 && dist < 8000)) return true;
  if (target.y < -20 || target.y > 420) return true;
  if (position.y < -8) return true;
  if (Math.hypot(target.x, target.z) > 900) return true;
  return false;
}
