import { describe, expect, it, vi } from "vitest";
import { applyVariant, createDefaultDesign, hydrateDesign } from "./design.ts";
import { computeFit } from "./fit.ts";
import { decodeShare, encodeShare } from "./share.ts";
import type { BoxState, CapProfileName, Design } from "./types.ts";
import {
  cavityFromDesign,
  DEFAULT_INSERT_MOTION,
  deriveCavity,
  deriveEnvelope,
  hydrateBox,
  renderedShape,
  sleeveOverActive,
  trayLiftMm,
  validateBoxFields,
  withSleeveOver,
  type CavityInput,
} from "./boxFields.ts";

function cavityInput(overrides: Partial<CavityInput> = {}): CavityInput {
  return {
    bottleH: 80,
    bottleW: 40,
    bottleD: 28,
    profile: "cara",
    shoulder: 0.22,
    neckR: 7.5,
    capH: 24,
    capW: 22,
    capD: 22,
    capBottom: 74,
    capProfile: "cylinder" satisfies CapProfileName,
    includeCap: true,
    pumpBase: 76,
    actuatorH: 14,
    actuatorR: 6,
    nozzle: 4,
    includePump: false,
    clearanceMm: 2,
    orientation: "standing",
    ...overrides,
  };
}

describe("box pack defaults and migration", () => {
  it("opens a new design on a sleeve over a lift-off box, with the magnet off", () => {
    const box = createDefaultDesign().box;
    expect(box.structure).toBe("lift-off");
    expect(box.latch).toBe("none");
    expect(box.liftOff).toEqual({ variant: "shoulder-neck", neckMm: 14, lidDepthMm: 28 });
    expect(box.drawerPull).toBe("none");
    expect(box.shape).toEqual({ type: "rect" });
    expect(sleeveOverActive(box.layers)).toBe(true);
    expect(box.layers.map((layer) => layer.structure)).toEqual(["sleeve", "lift-off"]);
    expect(box.layers.every((layer) => layer.latch === "none")).toBe(true);
    expect(box.insertMotion.trayLift).toEqual({ height: 0, trigger: "lidAngle" });
    expect(box.insert.orientation).toBe("standing");
    expect(box.material).toBe("rigid");
    expect(validateBoxFields(box)).toEqual([]);
  });

  it("fills closure and insert when a saved box never had them", () => {
    const legacy = {
      variantId: "box-rigid",
      finish: "matteBlack" as const,
      color: "#14161c",
      heightMm: 110,
      widthMm: 70,
      depthMm: 55,
      linked: true,
      visible: true,
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const box = hydrateBox(legacy);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    expect(box.structure).toBe("lift-off");
    expect(box.latch).toBe("none");
    expect(box.liftOff.variant).toBe("shoulder-neck");
    expect(box.insert.orientation).toBe("standing");
    expect(box.insert.material).toBe("eva");
    expect(box.outerWrap).toBe("none");
    expect(box.ribbon).toBe(false);
    expect(box.shape.type).toBe("rect");
    expect(box.layers).toHaveLength(1);
    expect(box.insertMotion.trayLift.height).toBe(0);
    expect(validateBoxFields(box)).toEqual([]);
    const design = hydrateDesign({ ...createDefaultDesign(), box: legacy as BoxState });
    expect(design.box.structure).toBe("lift-off");
    expect(design.box.insert.orientation).toBe("standing");
  });

  it("keeps a catalog finish and replaces a finish outside the enum", () => {
    const legacy = {
      variantId: "box-rigid",
      color: "#14161c",
      heightMm: 110,
      widthMm: 70,
      depthMm: 55,
      linked: true,
      visible: true,
    };
    expect(hydrateBox({ ...legacy, finish: "leather" }).finish).toBe("leather");
    expect(hydrateBox({ ...legacy, finish: "soft-touch" as BoxState["finish"] }).finish).toBe("matteBlack");
    expect(hydrateBox({ ...legacy, finish: "<script>" as BoxState["finish"] }).finish).toBe("matteBlack");
  });

  it("maps a saved magnetic closure onto a hinged lid with a magnet, without a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const box = hydrateBox({ closure: "magnetic" });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    expect(box.structure).toBe("hinged-lid");
    expect(box.latch).toBe("magnet");
    const book = hydrateBox({ closure: "book" });
    expect(book.structure).toBe("book");
    expect(book.latch).toBe("none");
  });

  it("keeps a tube layer beside a sleeve, with no magnet", () => {
    const tube = hydrateBox({
      layers: [{ closure: "sleeve" }, { closure: "tube" }],
    } as unknown as Partial<BoxState>);
    expect(tube.layers.map((layer) => layer.structure)).toEqual(["sleeve", "tube"]);
    expect(sleeveOverActive(tube.layers)).toBe(true);
    expect(tube.structure).toBe("tube");
    expect(tube.latch).toBe("none");
    expect(validateBoxFields(tube)).toEqual([]);
  });

  it("drops a magnet latch that the sleeve cannot use", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const box = hydrateBox({ structure: "sleeve", latch: "magnet" });
    expect(box.structure).toBe("sleeve");
    expect(box.latch).toBe("none");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("sleeve"));
    warn.mockRestore();
  });

  it("maps a catalog form onto the structure and its preset latch", () => {
    const design = createDefaultDesign();
    applyVariant(design, "box", "box-magnetic");
    expect(design.box.structure).toBe("hinged-lid");
    expect(design.box.latch).toBe("magnet");
    applyVariant(design, "box", "box-drawer");
    expect(design.box.structure).toBe("drawer");
    expect(design.box.latch).toBe("none");
    applyVariant(design, "box", "box-coffret");
    expect(design.box.structure).toBe("book");
    expect(design.box.latch).toBe("none");
    expect(design.box.layers.at(-1)?.structure).toBe("book");
    expect(design.box.layers.at(-1)?.latch).toBe("none");
    applyVariant(design, "box", "box-tube");
    expect(design.box.structure).toBe("tube");
    expect(design.box.latch).toBe("none");
    expect(design.box.layers.at(-1)?.structure).toBe("tube");
    expect(design.box.insert.orientation).toBe("standing");
  });
});

describe("box field validation", () => {
  it("rejects unknown enums and sizes outside the range", () => {
    const box = createDefaultDesign().box;
    const bad = validateBoxFields({
      ...box,
      structure: "hinge",
      latch: "magnet",
      boardMm: 12,
      liftOff: { variant: "no-such", neckMm: 1, lidDepthMm: 400 },
      drawerPull: "loop" as BoxState["drawerPull"],
      insert: { ...box.insert, clearanceMm: 0 },
    });
    expect(bad.map((issue) => issue.path)).toEqual(expect.arrayContaining(["structure", "boardMm", "insert", "liftOff", "drawerPull"]));
    const sleeve = validateBoxFields({ ...box, structure: "sleeve", latch: "magnet" });
    expect(sleeve.map((issue) => issue.path)).toContain("latch");
    const sides = validateBoxFields({ ...box, shape: { type: "polygon", sides: 2 } });
    expect(sides.map((issue) => issue.path)).toContain("shape");
  });

  it("clamps an out-of-range board back into the legal range", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const box = hydrateBox({ ...createDefaultDesign().box, boardMm: 20, structure: "nope" });
    expect(box.boardMm).toBe(4.5);
    expect(box.structure).toBe("lift-off");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("nope"));
    warn.mockRestore();
    expect(validateBoxFields(box)).toEqual([]);
  });
});

describe("layers, shape, and insert motion", () => {
  it("reads the sample stack: polygon, sleeve over a two-door book, rising tray", () => {
    const box = hydrateBox({
      shape: { type: "polygon", sides: 8 },
      layers: [
        { closure: "sleeve", window: null },
        { closure: "book", doors: 2, hingeAxis: "vertical", magnetic: true },
        { insert: { trayLift: { height: 30, trigger: "lidAngle" }, tiltAngle: 0 } },
      ],
    } as unknown as Partial<BoxState>);
    expect(box.shape).toEqual({ type: "polygon", sides: 8 });
    expect(box.layers.map((layer) => layer.structure)).toEqual(["sleeve", "book"]);
    expect(box.layers[1]).toMatchObject({ doors: 2, hingeAxis: "vertical", latch: "magnet" });
    expect(box.structure).toBe("book");
    expect(box.latch).toBe("magnet");
    expect(box.insertMotion.trayLift).toEqual({ height: 30, trigger: "lidAngle" });
    expect(box.insertMotion.pose.tiltAngle).toBe(0);
    expect(validateBoxFields(box)).toEqual([]);
  });

  it("warns once for an unknown shape and draws a non-lift-off polygon or cylinder as a rect", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(hydrateBox({ shape: { type: "cone" } as unknown as BoxState["shape"] }).shape).toEqual({ type: "rect" });
    expect(renderedShape({ type: "cylinder" }, "lift-off")).toEqual({ type: "cylinder" });
    expect(renderedShape({ type: "polygon", sides: 8 }, "lift-off")).toEqual({ type: "polygon", sides: 8 });
    expect(renderedShape({ type: "rect" }, "tube")).toEqual({ type: "cylinder" });
    expect(renderedShape({ type: "cylinder" }, "book")).toEqual({ type: "rect" });
    expect(renderedShape({ type: "cylinder" }, "book")).toEqual({ type: "rect" });
    expect(renderedShape({ type: "polygon", sides: 8 }, "book")).toEqual({ type: "rect" });
    expect(renderedShape({ type: "polygon", sides: 8 }, "book")).toEqual({ type: "rect" });
    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages.filter((message) => message.includes("cone"))).toHaveLength(1);
    expect(messages.filter((message) => message.includes("lift-off only"))).toHaveLength(1);
    expect(messages.filter((message) => message.includes("polygon"))).toHaveLength(1);
    warn.mockRestore();
  });

  it("stacks a sleeve over the current preset and lifts only lift-off and book", () => {
    const box = createDefaultDesign().box;
    const covered = withSleeveOver(box, true);
    expect(sleeveOverActive(covered)).toBe(true);
    expect(covered[0]?.structure).toBe("sleeve");
    expect(covered[1]?.structure).toBe("lift-off");
    const bare = withSleeveOver({ ...box, layers: covered }, false);
    expect(bare).toHaveLength(1);
    expect(bare[0]?.structure).toBe("lift-off");
    const rise = { ...DEFAULT_INSERT_MOTION, trayLift: { height: 30, trigger: "lidAngle" } };
    expect(trayLiftMm("lift-off", rise, 1, false)).toBe(30);
    expect(trayLiftMm("book", rise, 0.5, false)).toBe(15);
    expect(trayLiftMm("sleeve", rise, 1, false)).toBe(0);
    const pulled = { ...DEFAULT_INSERT_MOTION, trayLift: { height: 30, trigger: "ribbonPull" } };
    expect(trayLiftMm("lift-off", pulled, 1, false)).toBe(0);
    expect(trayLiftMm("book", pulled, 1, true)).toBe(30);
  });
});

describe("insert cavity", () => {
  it("seats a standing bottle in a well and a lying bottle along its axis", () => {
    const standing = deriveCavity(cavityInput());
    const lying = deriveCavity(cavityInput({ orientation: "lying" }));
    expect(standing.orientation).toBe("standing");
    expect(standing.heightMm).toBe(80);
    expect(standing.widthMm).toBeGreaterThan(40);
    expect(standing.depthMm).toBeGreaterThan(28);
    expect(lying.depthMm).toBeGreaterThan(standing.depthMm);
    expect(lying.heightMm).toBeLessThan(standing.heightMm);
    expect(lying.widthMm).toBeCloseTo(standing.widthMm, 4);
    expect(standing.samples.length).toBeGreaterThan(8);
  });

  it("widens the well for a wider cap and for a pump that sticks out", () => {
    const narrow = deriveCavity(cavityInput({ capW: 18, capD: 18 }));
    const wide = deriveCavity(cavityInput({ capW: 70, capD: 48 }));
    expect(wide.widthMm).toBeGreaterThan(narrow.widthMm);
    expect(wide.depthMm).toBeGreaterThan(narrow.depthMm);
    const bare = deriveCavity(cavityInput({ includePump: false, bottleW: 30, bottleD: 20 }));
    const pumped = deriveCavity(cavityInput({ includePump: true, bottleW: 30, bottleD: 20, actuatorR: 18, nozzle: 16 }));
    expect(pumped.widthMm).toBeGreaterThan(bare.widthMm);
  });

  it("derives the carton from the insert unless a supplier size is fixed", () => {
    const design = createDefaultDesign();
    const standing = cavityFromDesign(design, "standing");
    const lying = cavityFromDesign(design, "lying");
    expect(lying.depthMm).toBeGreaterThan(standing.depthMm);
    expect(lying.heightMm).toBeLessThan(standing.heightMm);
    const envelope = deriveEnvelope(standing, design.box.boardMm);
    expect(envelope.outerW).toBeGreaterThan(envelope.cavity.widthMm);
    expect(envelope.outerH).toBeGreaterThan(envelope.cavity.stackMm);
    design.box.linked = false;
    design.box.widthMm = 90;
    design.box.depthMm = 64;
    design.box.heightMm = 150;
    const fixed = computeFit(design);
    expect(fixed.boxW).toBe(90);
    expect(fixed.boxD).toBe(64);
    expect(fixed.boxH).toBe(150);
    design.box.linked = true;
    const linked = computeFit(design);
    expect(linked.boxW).not.toBe(90);
    expect(linked.boxW).toBeGreaterThan(linked.cavityW);
  });
});

describe("share link", () => {
  it("round-trips the new fields and still reads a link that omits them", () => {
    const design = createDefaultDesign();
    design.box.structure = "book";
    design.box.latch = "magnet";
    design.box.liftOff = { variant: "telescope-partial", neckMm: 18, lidDepthMm: 36 };
    design.box.drawerPull = "ribbon";
    design.box.ribbon = true;
    design.box.pullTab = true;
    design.box.outerWrap = "tissue";
    design.box.material = "carton";
    design.box.boardMm = 1.2;
    design.box.wrap = { color: "#6b3c32", finish: "velvet" };
    design.box.insert = { material: "velvet-foam", orientation: "lying", clearanceMm: 3.5 };
    design.box.shape = { type: "polygon", sides: 8 };
    design.box.layers = withSleeveOver(design.box, true);
    design.box.insertMotion = { ...DEFAULT_INSERT_MOTION, trayLift: { height: 24, trigger: "lidAngle" }, pose: { tiltAngle: 12, invert: false } };
    const back = decodeShare(encodeShare(design));
    expect(back?.box.structure).toBe("book");
    expect(back?.box.latch).toBe("magnet");
    expect(back?.box.liftOff).toEqual({ variant: "telescope-partial", neckMm: 18, lidDepthMm: 36 });
    expect(back?.box.drawerPull).toBe("ribbon");
    expect(back?.box.ribbon).toBe(true);
    expect(back?.box.pullTab).toBe(true);
    expect(back?.box.outerWrap).toBe("tissue");
    expect(back?.box.material).toBe("carton");
    expect(back?.box.boardMm).toBe(1.2);
    expect(back?.box.wrap).toEqual({ color: "#6b3c32", finish: "velvet" });
    expect(back?.box.insert).toEqual({ material: "velvet-foam", orientation: "lying", clearanceMm: 3.5 });
    expect(back?.box.shape).toEqual({ type: "polygon", sides: 8 });
    expect(back?.box.layers.map((layer) => layer.structure)).toEqual(["sleeve", "book"]);
    expect(back?.box.insertMotion.trayLift).toEqual({ height: 24, trigger: "lidAngle" });
    expect(back?.box.insertMotion.pose.tiltAngle).toBe(12);

    const legacy = createDefaultDesign();
    const oldBox = {
      variantId: legacy.box.variantId,
      finish: legacy.box.finish,
      color: legacy.box.color,
      heightMm: legacy.box.heightMm,
      widthMm: legacy.box.widthMm,
      depthMm: legacy.box.depthMm,
      linked: legacy.box.linked,
      visible: legacy.box.visible,
    };
    const restored = decodeShare(encodeShare({ ...legacy, box: oldBox as Design["box"] }));
    expect(restored?.box.structure).toBe("lift-off");
    expect(restored?.box.liftOff.variant).toBe("shoulder-neck");
    expect(restored?.box.drawerPull).toBe("none");
    expect(restored?.box.insert.orientation).toBe("standing");
    expect(restored?.box.shape.type).toBe("rect");
    expect(restored?.box.insertMotion.trayLift.height).toBe(0);
    expect(restored?.bottle.variantId).toBe(legacy.bottle.variantId);
    expect(decodeShare("%%%")).toBeNull();
  });
});
