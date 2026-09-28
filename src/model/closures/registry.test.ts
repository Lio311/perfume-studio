import { describe, expect, it, vi } from "vitest";
import { builderIds } from "../../scene/closures/registry.ts";
import { closureTimeline } from "../../scene/closures/stages.ts";
import { listClosures, openPose, resolveClosure, stagePose } from "./registry.ts";
import { closureDims } from "./types.ts";

const SAMPLE = { w: 80, h: 120, d: 70, boardMm: 2.2 };

describe("closure registry", () => {
  it("loads every entry with labels, parts, limits, and named stages", () => {
    const specs = listClosures();
    expect(specs.map((spec) => spec.id)).toEqual(["magnetic", "lift-off", "sleeve", "drawer", "book"]);
    for (const spec of specs) {
      expect(spec.label.he.length).toBeGreaterThan(0);
      expect(spec.label.en.length).toBeGreaterThan(0);
      expect(spec.parts.length).toBeGreaterThan(0);
      expect(spec.stages.length).toBeGreaterThan(0);
      for (const part of spec.parts) {
        expect(part.channels.length).toBeGreaterThan(0);
        for (const channel of part.channels) {
          const dims = closureDims(SAMPLE, spec);
          const closed = channel.closed(dims);
          const open = channel.open(dims);
          const lo = Math.min(channel.min(dims), channel.max(dims));
          const hi = Math.max(channel.min(dims), channel.max(dims));
          expect(closed).toBeGreaterThanOrEqual(lo);
          expect(closed).toBeLessThanOrEqual(hi);
          expect(open).toBeGreaterThanOrEqual(lo);
          expect(open).toBeLessThanOrEqual(hi);
        }
      }
    }
  });

  it("pairs each entry with a geometry builder of the same id", () => {
    expect(builderIds().sort()).toEqual(listClosures().map((spec) => spec.id).sort());
  });

  it("describes the magnetic open pose and keeps the lid closed during the unlatch stage", () => {
    const spec = listClosures().find((item) => item.id === "magnetic");
    if (!spec) throw new Error("magnetic");
    const dims = closureDims(SAMPLE, spec);
    const open = openPose(spec, dims);
    expect(open.find((sample) => sample.group === "lid")?.value).toBeCloseTo(-1.22);
    expect(open.find((sample) => sample.group === "flap")?.value).toBeCloseTo(0.18);
    const unlatch = stagePose(spec, dims, "unlatch");
    expect(unlatch.find((sample) => sample.group === "flap")?.value).toBeCloseTo(0.18);
    expect(unlatch.find((sample) => sample.group === "lid")?.value).toBe(0);
    const timeline = closureTimeline(spec);
    expect(timeline.paused()).toBe(true);
    expect(timeline.labels.unlatch).toBe(0);
    expect(timeline.labels.raise).toBe(1);
    timeline.kill();
  });

  it("warns once and falls back to lift-off for an unknown id", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveClosure("petal-box").id).toBe("lift-off");
    expect(resolveClosure("petal-box").id).toBe("lift-off");
    expect(resolveClosure(undefined).id).toBe("lift-off");
    expect(resolveClosure("").id).toBe("lift-off");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("petal-box"));
    warn.mockRestore();
  });
});
