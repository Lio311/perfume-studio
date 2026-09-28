import gsap from "gsap";
import type { ClosureSpec } from "../../model/closures/types.ts";

/**
 * Paused timeline with one label per stage. PR-2 inserts the tweens at these labels.
 * Nothing plays until that pass calls play() after a user gesture.
 */
export function closureTimeline(spec: ClosureSpec): gsap.core.Timeline {
  const timeline = gsap.timeline({ paused: true });
  spec.stages.forEach((stage, index) => {
    timeline.addLabel(stage.id, index);
  });
  return timeline;
}
