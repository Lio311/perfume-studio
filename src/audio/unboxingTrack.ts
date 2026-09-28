import { useSyncExternalStore } from "react";

/**
 * Soundtrack slot. Muted until a user turns it on, and silent until
 * `configureUnboxingTrack` receives a URL. No audio file ships with the app.
 * Playback starts only from that unmute gesture, so autoplay policies hold.
 */
export interface UnboxingTrackSnapshot {
  muted: boolean;
  configured: boolean;
}

let trackUrl: string | null = null;
let muted = true;
let audio: HTMLAudioElement | null = null;
let snapshot: UnboxingTrackSnapshot = { muted: true, configured: false };
const listeners = new Set<() => void>();

function publish(): void {
  const next = { muted, configured: Boolean(trackUrl) };
  if (next.muted === snapshot.muted && next.configured === snapshot.configured) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

export function getUnboxingTrackSnapshot(): UnboxingTrackSnapshot {
  return snapshot;
}

export function subscribeUnboxingTrack(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useUnboxingTrack(): UnboxingTrackSnapshot {
  return useSyncExternalStore(subscribeUnboxingTrack, getUnboxingTrackSnapshot, getUnboxingTrackSnapshot);
}

/** Store a track URL. Does not start playback. */
export function configureUnboxingTrack(url: string | null | undefined): void {
  const next = typeof url === "string" && url.trim() ? url.trim() : null;
  if (next === trackUrl) return;
  trackUrl = next;
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio = null;
  }
  publish();
}

export function unboxingTrackUrl(): string | null {
  return trackUrl;
}

/** Unmute is the user gesture that may call play(). Without a URL this is a no-op. */
export function setUnboxingMuted(next: boolean): void {
  muted = next;
  if (muted) audio?.pause();
  else startFromGesture();
  publish();
}

function startFromGesture(): void {
  if (!trackUrl || typeof Audio === "undefined") return;
  if (!audio) {
    audio = new Audio(trackUrl);
    audio.loop = true;
    audio.preload = "none";
  }
  audio.muted = false;
  const pending = audio.play();
  if (pending && typeof pending.catch === "function") {
    pending.catch(() => {
      // The browser still blocked playback. Stay quiet.
    });
  }
}

export function resetUnboxingTrackForTests(): void {
  audio?.pause();
  if (audio) audio.removeAttribute("src");
  audio = null;
  trackUrl = null;
  muted = true;
  snapshot = { muted: true, configured: false };
}
