import { describe, expect, it, vi } from "vitest";
import { builderIds } from "../../scene/closures/registry.ts";
import { closureTimeline } from "../../scene/closures/stages.ts";
import { listClosures, openDriver, openPose, packById, poseAt, resolveClosure, stagePose } from "./registry.ts";
import { closureDims, ease01, readMotions } from "./types.ts";

const SAMPLE = { w: 80, h: 120, d: 70, boardMm: 2.2 };

describe("closure registry", () => {
  it("loads every structure with a preset, latches, parts, and named stages", () => {
    const specs = listClosures();
    expect(specs.map((spec) => spec.id)).toEqual(["hinged-lid", "lift-off", "sleeve", "drawer", "book"]);
    expect(specs.map((spec) => spec.preset.label.he)).toEqual(["מגנט", "לחיצה", "הזזה", "מגירה", "ספר"]);
    for (const spec of specs) {
      expect(spec.label.he.length).toBeGreaterThan(0);
      expect(spec.label.en.length).toBeGreaterThan(0);
      expect(spec.preset.label.en.length).toBeGreaterThan(0);
      expect(spec.latches.length).toBeGreaterThan(0);
      expect(spec.parts.length).toBeGreaterThan(0);
      expect(spec.stages.length).toBeGreaterThan(0);
      for (const part of spec.parts) {
        expect(part.motion.duration).toBeGreaterThan(0);
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

  it("keeps magnet off the sleeve and the matchbox drawer", () => {
    const sleeve = listClosures().find((spec) => spec.id === "sleeve");
    const drawer = listClosures().find((spec) => spec.id === "drawer");
    const book = listClosures().find((spec) => spec.id === "book");
    expect(sleeve?.latches).not.toContain("magnet");
    expect(drawer?.latches).not.toContain("magnet");
    expect(book?.latches).toContain("magnet");
    expect(book?.preset.latch).toBe("magnet");
    expect(packById("magnetic")).toMatchObject({ structure: { id: "hinged-lid" }, latch: "magnet" });
    expect(packById("magnet")?.latch).toBe("magnet");
  });

  it("maps one openAmount through per-group delay and ease", () => {
    const spec = listClosures().find((item) => item.id === "hinged-lid");
    if (!spec) throw new Error("hinged-lid");
    const dims = closureDims(SAMPLE, spec);
    const driver = openDriver(spec);
    expect(driver.param).toBe("openAmount");
    expect(driver.from).toBe(0);
    expect(driver.to).toBe(1);
    const flap = driver.groups.find((group) => group.id === "flap");
    const lid = driver.groups.find((group) => group.id === "lid");
    if (!flap || !lid) throw new Error("hinged groups");
    expect(flap).toMatchObject({ delay: 0, ease: "power2.out" });
    expect(lid.delay).toBeGreaterThan(flap.delay);
    expect(ease01(0.5, "power2.out")).toBeCloseTo(1 - 0.5 ** 3);
    expect(ease01(0.5, "power2.inOut")).toBeCloseTo(0.5);

    const early = poseAt(spec, dims, 0.2);
    expect(early.find((sample) => sample.group === "flap")?.value).not.toBeCloseTo(Math.PI / 2);
    expect(early.find((sample) => sample.group === "lid")?.value).toBe(0);
    const open = openPose(spec, dims);
    expect(open.find((sample) => sample.group === "lid")?.value).toBeCloseTo(-1.22);
    expect(open.find((sample) => sample.group === "flap")?.value).toBeCloseTo(0.18);

    const unlatch = stagePose(spec, dims, "unlatch");
    expect(unlatch.find((sample) => sample.group === "flap")?.value).toBeCloseTo(0.18);
    expect(unlatch.find((sample) => sample.group === "lid")?.value).toBe(0);
    const timeline = closureTimeline(spec);
    expect(timeline.paused()).toBe(true);
    expect(timeline.labels.unlatch).toBe(flap?.delay);
    expect(timeline.labels.raise).toBe(lid?.delay);
    timeline.kill();
  });

  it("builds the shoulder-neck, full telescope, and partial telescope from the lift-off entry", () => {
    const spec = listClosures().find((item) => item.id === "lift-off");
    if (!spec) throw new Error("lift-off");
    const shoulder = closureDims(SAMPLE, spec, { variant: "shoulder-neck", neckMm: 14, lidDepthMm: 28 });
    expect(shoulder.neckH).toBeGreaterThan(0);
    expect(shoulder.baseH + shoulder.neckH + shoulder.lidH).toBeCloseTo(SAMPLE.h, 4);
    const full = closureDims(SAMPLE, spec, { variant: "telescope-full" });
    expect(full.neckH).toBe(0);
    expect(full.lidH).toBe(SAMPLE.h);
    expect(full.baseH).toBe(SAMPLE.h);
    const partial = closureDims(SAMPLE, spec, { variant: "telescope-partial", lidDepthMm: 32 });
    expect(partial.neckH).toBe(0);
    expect(partial.lidH).toBeLessThan(SAMPLE.h * 0.6);
    expect(partial.baseH).toBe(SAMPLE.h);
    expect(spec.liftOff?.defaults.variant).toBe("shoulder-neck");
  });

  it("keeps unfold, rotate, and flaps as data on an entry", () => {
    const motions = readMotions({
      motions: [
        { type: "unfold", params: { wallCount: 4, fallAngle: 90, stagger: 0.12 } },
        { type: "rotate", params: { pivotPoint: "center", rotationAxis: "y", rotationAngle: 180 } },
        { type: "flaps", params: { flapCount: 4, foldOrder: ["front", "left", "right", "back"] } },
      ],
    });
    expect(motions.map((motion) => motion.type)).toEqual(["unfold", "rotate", "flaps"]);
    expect(motions[0]?.params).toEqual({ wallCount: 4, fallAngle: 90, stagger: 0.12 });
    expect(motions[1]?.params).toMatchObject({ rotationAxis: "y", rotationAngle: 180 });
    expect(motions[2]?.params.foldOrder).toEqual(["front", "left", "right", "back"]);
    expect(motions[2]?.params.flapCount).toBe(4);
  });

  it("warns once and falls back to lift-off for an unknown id", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveClosure("petal-box").id).toBe("lift-off");
    expect(resolveClosure("petal-box").id).toBe("lift-off");
    expect(resolveClosure(undefined).id).toBe("lift-off");
    expect(resolveClosure("").id).toBe("lift-off");
    expect(resolveClosure("magnetic").id).toBe("hinged-lid");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("petal-box"));
    warn.mockRestore();
  });
});
