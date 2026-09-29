import { afterEach, describe, expect, it } from "vitest";
import gsap from "gsap";
import { listClosures, openPose, poseAt } from "../../model/closures/registry.ts";
import { closureDims } from "../../model/closures/types.ts";
import { buildUnboxTimeline } from "./timelines.ts";

const SAMPLE = { w: 80, h: 120, d: 70, boardMm: 2.2 };

afterEach(() => {
  gsap.globalTimeline.clear();
  gsap.ticker.sleep();
});

describe("cinematic unboxing timelines", () => {
  it("builds a 4–7s timeline per closure whose end pose is the open pose", () => {
    for (const spec of listClosures()) {
      const built = buildUnboxTimeline(spec.id);
      expect(built.timeline.paused(), spec.id).toBe(true);
      expect(built.timeline.duration(), spec.id).toBeGreaterThanOrEqual(4);
      expect(built.timeline.duration(), spec.id).toBeLessThanOrEqual(7);
      expect(built.timeline.duration(), spec.id).toBeCloseTo(built.plan.total, 1);
      expect(built.timeline.labels.ribbon, spec.id).toBeCloseTo(built.plan.ribbonAt);
      expect(built.timeline.labels.open, spec.id).toBeCloseTo(built.plan.openAt);
      expect(built.timeline.labels.reveal, spec.id).toBeGreaterThan(built.plan.openAt);
      expect(built.driver.openAmount, spec.id).toBe(0);

      const peak = built.plan.ribbonAt + built.plan.ribbonOut;
      built.timeline.time(peak);
      expect(built.driver.ribbon, spec.id).toBeGreaterThan(0.85);

      const mid = built.plan.openAt + built.plan.open * 0.45;
      built.timeline.time(mid);
      expect(built.driver.openAmount, spec.id).toBeGreaterThan(0.05);
      expect(built.driver.openAmount, spec.id).toBeLessThan(0.98);

      built.timeline.progress(1);
      expect(built.driver.openAmount, spec.id).toBeCloseTo(1, 5);
      expect(built.driver.ribbon, spec.id).toBeCloseTo(0, 4);
      expect(built.driver.sheen, spec.id).toBeCloseTo(0, 4);
      expect(built.driver.camera, spec.id).toBeCloseTo(1, 4);
      expect(built.driver.sweep, spec.id).toBeCloseTo(1, 4);
      const dims = closureDims(SAMPLE, spec);
      expect(poseAt(spec, dims, built.driver.openAmount), spec.id).toEqual(openPose(spec, dims));
      built.timeline.kill();
    }
  });

  it("uses the lift-off timeline for rect, cylinder, and octagon cartons", () => {
    const spec = listClosures().find((item) => item.id === "lift-off");
    if (!spec) throw new Error("lift-off");
    const layouts = [
      { variant: "shoulder-neck", neckMm: 14, lidDepthMm: 28 },
      { variant: "telescope-full" },
      { variant: "telescope-partial", lidDepthMm: 32 },
    ];
    const duration = buildUnboxTimeline("lift-off").timeline.duration();
    for (const layout of layouts) {
      const built = buildUnboxTimeline("lift-off");
      expect(built.timeline.duration()).toBeCloseTo(duration);
      built.timeline.progress(1);
      const dims = closureDims(SAMPLE, spec, layout);
      expect(poseAt(spec, dims, built.driver.openAmount)).toEqual(openPose(spec, dims));
      built.timeline.kill();
    }
  });

  it("falls back to the lift-off timeline for an unknown closure", () => {
    const known = buildUnboxTimeline("lift-off");
    const unknown = buildUnboxTimeline("petal-box");
    expect(unknown.timeline.duration()).toBeCloseTo(known.timeline.duration());
    unknown.timeline.progress(1);
    expect(unknown.driver.openAmount).toBeCloseTo(1);
    known.timeline.kill();
    unknown.timeline.kill();
  });
});
