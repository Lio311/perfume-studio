import gsap from "gsap";
import { UNBOX_CAMERA_SPLIT } from "./playback.ts";

/**
 * One paused GSAP timeline per closure. It tweens the same openAmount the pose
 * loop already reads, so the last frame is the open pose. Ribbon, sheen, and
 * camera are flourish tracks that rest at the open state's values.
 */
export interface UnboxDriver {
  openAmount: number;
  ribbon: number;
  sheen: number;
  sweep: number;
  camera: number;
}

export interface UnboxPlan {
  total: number;
  ribbonAt: number;
  ribbonOut: number;
  ribbonBack: number;
  openAt: number;
  open: number;
  openEase: string;
  approach: number;
  heroAt: number;
  hero: number;
  sheenAt: number;
  sheenUp: number;
  sheenDown: number;
  sweepAt: number;
  sweep: number;
}

const PLANS: Record<string, UnboxPlan> = {
  "lift-off": {
    total: 6.4,
    ribbonAt: 0.25,
    ribbonOut: 0.7,
    ribbonBack: 1,
    openAt: 1.15,
    open: 3.15,
    openEase: "power2.inOut",
    approach: 1.15,
    heroAt: 4.05,
    hero: 2.15,
    sheenAt: 4.6,
    sheenUp: 0.7,
    sheenDown: 0.9,
    sweepAt: 4.6,
    sweep: 1.6,
  },
  drawer: {
    total: 5.6,
    ribbonAt: 0.15,
    ribbonOut: 0.5,
    ribbonBack: 0.75,
    openAt: 0.8,
    open: 2.7,
    openEase: "power2.out",
    approach: 1,
    heroAt: 3.35,
    hero: 2.05,
    sheenAt: 3.9,
    sheenUp: 0.6,
    sheenDown: 0.9,
    sweepAt: 3.9,
    sweep: 1.5,
  },
  "hinged-lid": {
    total: 6.6,
    ribbonAt: 0.2,
    ribbonOut: 0.55,
    ribbonBack: 0.9,
    openAt: 0.85,
    open: 3.7,
    openEase: "power1.inOut",
    approach: 1.1,
    heroAt: 4.35,
    hero: 2.05,
    sheenAt: 4.7,
    sheenUp: 0.7,
    sheenDown: 0.95,
    sweepAt: 4.7,
    sweep: 1.65,
  },
  tube: {
    total: 6.2,
    ribbonAt: 0.3,
    ribbonOut: 0.75,
    ribbonBack: 1,
    openAt: 1.3,
    open: 3.05,
    openEase: "power2.inOut",
    approach: 1.2,
    heroAt: 4.15,
    hero: 1.85,
    sheenAt: 4.45,
    sheenUp: 0.65,
    sheenDown: 0.9,
    sweepAt: 4.45,
    sweep: 1.55,
  },
  book: {
    total: 5.8,
    ribbonAt: 0.2,
    ribbonOut: 0.6,
    ribbonBack: 0.85,
    openAt: 1,
    open: 2.85,
    openEase: "power2.inOut",
    approach: 1.05,
    heroAt: 3.7,
    hero: 1.9,
    sheenAt: 4.05,
    sheenUp: 0.6,
    sheenDown: 0.85,
    sweepAt: 4.05,
    sweep: 1.45,
  },
  sleeve: {
    total: 5.4,
    ribbonAt: 0.2,
    ribbonOut: 0.55,
    ribbonBack: 0.8,
    openAt: 0.9,
    open: 2.55,
    openEase: "power2.inOut",
    approach: 0.95,
    heroAt: 3.3,
    hero: 1.9,
    sheenAt: 3.7,
    sheenUp: 0.55,
    sheenDown: 0.85,
    sweepAt: 3.7,
    sweep: 1.4,
  },
};

export function unboxPlan(id: string): UnboxPlan {
  return PLANS[id] ?? PLANS["lift-off"]!;
}

export function createUnboxDriver(): UnboxDriver {
  return { openAmount: 0, ribbon: 0, sheen: 0, sweep: 0, camera: 0 };
}

export function buildUnboxTimeline(id: string, driver = createUnboxDriver()): {
  timeline: gsap.core.Timeline;
  driver: UnboxDriver;
  plan: UnboxPlan;
} {
  const plan = unboxPlan(id);
  const timeline = gsap.timeline({ paused: true });
  const hold = { t: 0 };
  timeline.to(hold, { t: 1, duration: plan.total, ease: "none" }, 0);
  timeline.to(driver, { ribbon: 1, duration: plan.ribbonOut, ease: "power2.out" }, plan.ribbonAt);
  timeline.to(driver, { ribbon: 0, duration: plan.ribbonBack, ease: "power2.inOut" }, plan.ribbonAt + plan.ribbonOut);
  timeline.to(driver, { openAmount: 1, duration: plan.open, ease: plan.openEase }, plan.openAt);
  timeline.to(driver, { camera: UNBOX_CAMERA_SPLIT, duration: plan.approach, ease: "power2.inOut" }, 0);
  timeline.to(driver, { camera: 1, duration: plan.hero, ease: "power3.inOut" }, plan.heroAt);
  timeline.to(driver, { sheen: 1, duration: plan.sheenUp, ease: "sine.inOut" }, plan.sheenAt);
  timeline.to(driver, { sheen: 0, duration: plan.sheenDown, ease: "sine.out" }, plan.sheenAt + plan.sheenUp);
  timeline.to(driver, { sweep: 1, duration: plan.sweep, ease: "none" }, plan.sweepAt);
  timeline.addLabel("ribbon", plan.ribbonAt);
  timeline.addLabel("open", plan.openAt);
  timeline.addLabel("reveal", plan.heroAt);
  timeline.addLabel("hero", plan.total);
  return { timeline, driver, plan };
}
