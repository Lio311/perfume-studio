import gsap from "gsap";
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
import { buildUnboxTimeline, type UnboxDriver } from "./timelines.ts";

let active: gsap.core.Timeline | null = null;
let pending: gsap.core.Timeline | null = null;

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

function settle(): void {
  const play = getUnboxPlayback();
  play.openAmount = 1;
  play.ribbon = 0;
  play.sheen = 0;
  play.sweep = 1;
  play.camera = 1;
  play.phase = "idle";
  play.cameraToken += 1;
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
  notifyUnbox();
}

function playMain(driver: UnboxDriver, timeline: gsap.core.Timeline): void {
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

/**
 * Play the cinematic open. Reduced motion jumps to the open pose.
 * A replay closes the carton first, then plays, so the lid does not pop.
 */
export function playUnboxing(options?: { reducedMotion?: boolean }): void {
  const reduced = options?.reducedMotion ?? prefersReducedMotion();
  killActive();
  if (reduced) {
    settle();
    return;
  }
  const built = buildUnboxTimeline(closureId());
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
export function previewUnbox(progress: number): void {
  killActive();
  const built = buildUnboxTimeline(closureId());
  const amount = Math.min(1, Math.max(0, progress));
  built.timeline.pause();
  built.timeline.progress(amount);
  writeDriver(built.driver);
  if (amount >= 0.999) {
    built.timeline.kill();
    settle();
    return;
  }
  const play = getUnboxPlayback();
  play.phase = "playing";
  play.runToken += 1;
  active = built.timeline;
  notifyUnbox();
}

export function resetUnboxForTests(): void {
  killActive();
  registerUnboxSkip(null);
  resetUnboxPlayback();
  gsap.globalTimeline.clear();
  gsap.ticker.sleep();
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
