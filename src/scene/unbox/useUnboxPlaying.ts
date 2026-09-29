import { useSyncExternalStore } from "react";
import { getUnboxPlayback, subscribeUnbox } from "./playback.ts";

/** True while a cinematic open is on the timeline. The settled pose uses boxOpen instead. */
export function useUnboxPlaying(): boolean {
  return useSyncExternalStore(subscribeUnbox, () => getUnboxPlayback().phase === "playing", () => false);
}
