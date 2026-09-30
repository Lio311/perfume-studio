/**
 * Ephemeral unboxing playback. Not a store field, so it cannot be persisted,
 * shared, or written over a demo hold.
 */

export type UnboxPhase = "idle" | "playing";

export interface UnboxLook {
  x: number;
  y: number;
  z: number;
}

export interface UnboxPlayback {
  phase: UnboxPhase;
  openAmount: number;
  ribbon: number;
  sheen: number;
  sweep: number;
  /** 0 is the camera at the gesture, 1 is the hero frame. */
  camera: number;
  runToken: number;
  cameraToken: number;
  /** False while the hero frame is held. Orbit or another gesture sets it true. */
  heroReleased: boolean;
  look: UnboxLook | null;
  snap: UnboxLook | null;
}

/** First camera beat ends here; the rest eases to the hero. */
export const UNBOX_CAMERA_SPLIT = 0.42;

/** Close an already-open carton before a replay, so the lid does not pop shut. */
export const UNBOX_REPLAY_LEAD = 0.45;

const playback: UnboxPlayback = {
  phase: "idle",
  openAmount: 0,
  ribbon: 0,
  sheen: 0,
  sweep: 0,
  camera: 0,
  runToken: 0,
  cameraToken: 0,
  heroReleased: true,
  look: null,
  snap: null,
};

const listeners = new Set<() => void>();

export function getUnboxPlayback(): UnboxPlayback {
  return playback;
}

export function subscribeUnbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyUnbox(): void {
  for (const listener of listeners) listener();
}

let skipHandler: (() => void) | null = null;

export function registerUnboxSkip(handler: (() => void) | null): void {
  skipHandler = handler;
}

export function skipUnboxing(): void {
  skipHandler?.();
}

export function resetUnboxPlayback(): void {
  playback.phase = "idle";
  playback.openAmount = 0;
  playback.ribbon = 0;
  playback.sheen = 0;
  playback.sweep = 0;
  playback.camera = 0;
  playback.runToken = 0;
  playback.cameraToken = 0;
  playback.heroReleased = true;
  playback.look = null;
  playback.snap = null;
  notifyUnbox();
}
