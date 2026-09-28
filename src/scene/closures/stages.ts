import gsap from "gsap";
import { openDriver } from "../../model/closures/registry.ts";
import type { ClosureSpec } from "../../model/closures/types.ts";

/**
 * Paused timeline that tweens one openAmount from 0 to 1.
 * Per-group delay and ease stay on the structure entry (`openDriver`); PR-2 does not
 * invent them. Labels mark each group and each named stage at that group's delay.
 * Nothing plays until that pass calls play() after a user gesture.
 */
export function closureTimeline(spec: ClosureSpec): gsap.core.Timeline {
  const driver = { openAmount: 0 };
  const timeline = gsap.timeline({ paused: true });
  timeline.to(driver, { openAmount: 1, duration: 1, ease: "none" }, 0);
  for (const group of openDriver(spec).groups) {
    timeline.addLabel(group.id, group.delay);
  }
  for (const stage of spec.stages) {
    const part = spec.parts.find((item) => stage.groups.includes(item.id));
    if (part) timeline.addLabel(stage.id, part.motion.delay);
  }
  return timeline;
}
