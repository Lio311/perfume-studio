import gsap from "gsap";

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
  heroAt: number;
  sheenAt: number;
  sheenUp: number;
  sheenDown: number;
  sweepAt: number;
  sweep: number;
}

function shot(total: number, openAt: number, open: number): UnboxPlan {
  const heroAt = total - 1.05;
  return {
    total,
    ribbonAt: 0.05,
    ribbonOut: 0.32,
    ribbonBack: 0.4,
    openAt,
    open,
    openEase: "none",
    heroAt,
    sheenAt: heroAt - 1.4,
    sheenUp: 0.5,
    sheenDown: 0.75,
    sweepAt: heroAt - 1.4,
    sweep: 1.2,
  };
}

const PLANS: Record<string, UnboxPlan> = {
  "lift-off": shot(6.2, 0.08, 4.95),
  drawer: shot(6.0, 0.06, 4.8),
  "hinged-lid": shot(6.3, 0.08, 5.05),
  tube: shot(6.15, 0.08, 4.9),
  book: shot(6.05, 0.08, 4.8),
  sleeve: shot(6.0, 0.06, 4.75),
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
  timeline.to(driver, { ribbon: 0, duration: plan.ribbonBack, ease: "power2.in" }, plan.ribbonAt + plan.ribbonOut);
  timeline.to(driver, { openAmount: 1, duration: plan.open, ease: plan.openEase }, plan.openAt);
  timeline.to(driver, { camera: 1, duration: plan.heroAt, ease: "power1.inOut" }, 0);
  timeline.to(driver, { sheen: 1, duration: plan.sheenUp, ease: "sine.inOut" }, plan.sheenAt);
  timeline.to(driver, { sheen: 0, duration: plan.sheenDown, ease: "sine.out" }, plan.sheenAt + plan.sheenUp);
  timeline.to(driver, { sweep: 1, duration: plan.sweep, ease: "none" }, plan.sweepAt);
  timeline.addLabel("ribbon", plan.ribbonAt);
  timeline.addLabel("open", plan.openAt);
  timeline.addLabel("reveal", plan.heroAt);
  timeline.addLabel("hero", plan.total);
  return { timeline, driver, plan };
}
