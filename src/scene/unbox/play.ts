import { closureById } from "../../model/closures/registry.ts";
import { useLab } from "../../store/labStore.ts";
import { prefersReducedMotion } from "../motion.ts";
import {
  getUnboxPlayback,
  notifyUnbox,
  registerUnboxSkip,
  resetUnboxPlayback,
  UNBOX_REPLAY_LEAD,
  type UnboxPlayback,
} from "./playback.ts";
import type { UnboxDriver } from "./timelines.ts";

import type gsap from "gsap";

type GsapApi = typeof gsap;
type Timeline = gsap.core.Timeline;
type Timelines = typeof import("./timelines.ts");

let gsapApi: GsapApi | null = null;
let timelinesApi: Timelines | null = null;
let active: Timeline | null = null;
let pending: Timeline | null = null;
let armedStage = "box";
let watch: (() => void) | null = null;

function closureId(): string {
  const id = useLab.getState().design.box.structure || "lift-off";
  return closureById(id)?.id ?? "lift-off";
}

function writeDriver(driver: UnboxDriver): void {
  const play = getUnboxPlayback();
  play.openAmount = driver.openAmount;
  play.ribbon = driver.ribbon;
  play.sheen = driver.sheen;
  play.sweep = driver.sweep;
  play.camera = driver.camera;
}

function showCarton(): void {
  const lab = useLab.getState();
  if (lab.stage === "box" && !lab.solo && !lab.aimed) return;
  useLab.setState({ stage: "box", solo: null, aimed: false, selected: "box" });
}

function stopWatch(): void {
  watch?.();
  watch = null;
}

/** Drop the shot without forcing the carton open. */
function abortToRest(): void {
  stopWatch();
  killActive();
  registerUnboxSkip(null);
  resetUnboxPlayback();
}

function watchPlayback(): void {
  stopWatch();
  armedStage = useLab.getState().stage;
  watch = useLab.subscribe((state, prev) => {
    if (getUnboxPlayback().phase !== "playing") return;
    const stageChanged = state.stage !== armedStage;
    const closed = state.boxOpen === false && prev.boxOpen === true;
    if (stageChanged || closed) abortToRest();
  });
}

function settle(): void {
  stopWatch();
  if (useLab.getState().stage !== armedStage) {
    abortToRest();
    return;
  }
  const play = getUnboxPlayback();
  play.openAmount = 1;
  play.ribbon = 0;
  play.sheen = 0;
  play.sweep = 1;
  play.camera = 1;
  play.phase = "idle";
  play.cameraToken += 1;
  play.heroReleased = false;
  showCarton();
  if (!useLab.getState().boxOpen) useLab.getState().setBoxOpen(true);
  if (useLab.getState().autoRotate) useLab.setState({ autoRotate: false });
  notifyUnbox();
}

function killActive(): void {
  if (active) {
    active.eventCallback("onComplete", null);
    active.eventCallback("onUpdate", null);
    active.kill();
    active = null;
  }
  if (pending) {
    pending.kill();
    pending = null;
  }
}

function arm(play: UnboxPlayback): void {
  play.phase = "playing";
  play.runToken += 1;
  showCarton();
  if (useLab.getState().autoRotate) useLab.setState({ autoRotate: false });
  watchPlayback();
  notifyUnbox();
}

function playMain(driver: UnboxDriver, timeline: Timeline): void {
  if (!gsapApi) return;
  pending = null;
  timeline.eventCallback("onUpdate", () => writeDriver(driver));
  timeline.eventCallback("onComplete", () => {
    if (active !== timeline) return;
    active = null;
    writeDriver(driver);
    settle();
  });
  active = timeline;
  timeline.play(0);
}

function start(options?: { reducedMotion?: boolean }): void {
  const gsap = gsapApi;
  const timelines = timelinesApi;
  if (!gsap || !timelines) return;
  const reduced = options?.reducedMotion ?? prefersReducedMotion();
  killActive();
  if (reduced) {
    armedStage = useLab.getState().stage;
    settle();
    return;
  }
  const built = timelines.buildUnboxTimeline(closureId());
  const play = getUnboxPlayback();
  const wasOpen = useLab.getState().boxOpen || play.openAmount > 0.04;
  registerUnboxSkip(skipUnboxing);
  if (!wasOpen) {
    built.driver.openAmount = 0;
    built.driver.ribbon = 0;
    built.driver.sheen = 0;
    built.driver.sweep = 0;
    built.driver.camera = 0;
    writeDriver(built.driver);
    arm(play);
    playMain(built.driver, built.timeline);
    return;
  }
  built.driver.openAmount = 1;
  built.driver.ribbon = 0;
  built.driver.sheen = 0;
  built.driver.sweep = 1;
  built.driver.camera = 0;
  writeDriver(built.driver);
  arm(play);
  pending = built.timeline;
  const lead = gsap.timeline({
    onUpdate: () => writeDriver(built.driver),
    onComplete: () => {
      if (active !== lead) return;
      playMain(built.driver, built.timeline);
    },
  });
  lead.to(built.driver, { openAmount: 0, duration: UNBOX_REPLAY_LEAD, ease: "power2.inOut" });
  active = lead;
  lead.play(0);
}

/**
 * The GSAP chunk is loaded on demand. A failed fetch still opens the carton.
 */
function loadRuntime(): Promise<boolean> {
  if (gsapApi && timelinesApi) return Promise.resolve(true);
  return import("gsap")
    .then((mod) => {
      gsapApi = mod.default;
      return import("./timelines.ts");
    })
    .then((mod) => {
      timelinesApi = mod;
      return true;
    })
    .catch(() => {
      useLab.getState().setBoxOpen(true);
      return false;
    });
}

/**
 * Play the cinematic open. Reduced motion jumps to the open pose.
 * A replay closes the carton first, then plays, so the lid does not pop.
 */
export function playUnboxing(options?: { reducedMotion?: boolean }): Promise<void> {
  return loadRuntime().then((ready) => {
    if (!ready) return;
    start(options);
  });
}

/** Jump to the open pose. A click on the stage or Escape calls this. */
export function skipUnboxing(): void {
  if (getUnboxPlayback().phase !== "playing" && !active) return;
  killActive();
  settle();
}

/**
 * Hold the timeline at a progress for a still. 1 settles on the open pose.
 * Dev and the screenshot pass use this; it is not a share or persist field.
 */
export function previewUnbox(progress: number): Promise<void> {
  return loadRuntime().then((ready) => {
    if (!ready || !timelinesApi) return;
    killActive();
    const built = timelinesApi.buildUnboxTimeline(closureId());
    const amount = Math.min(1, Math.max(0, progress));
    built.timeline.pause();
    built.timeline.progress(amount);
    writeDriver(built.driver);
    showCarton();
    if (amount >= 0.999) {
      built.timeline.kill();
      armedStage = useLab.getState().stage;
      settle();
      return;
    }
    const play = getUnboxPlayback();
    play.phase = "playing";
    play.runToken += 1;
    active = built.timeline;
    watchPlayback();
    notifyUnbox();
  });
}

export function resetUnboxForTests(): void {
  killActive();
  stopWatch();
  registerUnboxSkip(null);
  resetUnboxPlayback();
  if (gsapApi) {
    gsapApi.globalTimeline.clear();
    gsapApi.ticker.sleep();
  }
}

/** Seek the live timeline. Tests use this to pass a second without a ticker. */
export function advanceUnboxForTests(seconds: number): void {
  let left = seconds;
  while (left > 0.0001 && active) {
    const timeline = active;
    const room = Math.max(0, timeline.duration() - timeline.time());
    if (room <= 0.0001) break;
    const step = Math.min(left, room);
    timeline.time(timeline.time() + step);
    left -= step;
    if (step + 1e-4 < room) break;
    if (active === timeline) break;
  }
}

/** Lets a headless pass seek the sequence without a second geometry path. */
export function installUnboxPreview(): void {
  if (typeof window === "undefined") return;
  (window as Window & { __unbox?: { preview: typeof previewUnbox; play: typeof playUnboxing; skip: typeof skipUnboxing } }).__unbox = {
    preview: previewUnbox,
    play: () => playUnboxing(),
    skip: () => skipUnboxing(),
  };
}

installUnboxPreview();
