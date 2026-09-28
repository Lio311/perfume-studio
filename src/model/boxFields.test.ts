import { describe, expect, it } from "vitest";
import { applyVariant, createDefaultDesign, hydrateDesign } from "./design.ts";
import { computeFit } from "./fit.ts";
import { decodeShare, encodeShare } from "./share.ts";
import type { BoxState, CapProfileName, Design } from "./types.ts";
import {
  cavityFromDesign,
  deriveCavity,
  deriveEnvelope,
  hydrateBox,
  validateBoxFields,
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
  it("opens a new design on a lift-off lid and a standing insert", () => {
    const box = createDefaultDesign().box;
    expect(box.closure).toBe("lift-off");
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
    const box = hydrateBox(legacy);
    expect(box.closure).toBe("lift-off");
    expect(box.insert.orientation).toBe("standing");
    expect(box.insert.material).toBe("eva");
    expect(box.outerWrap).toBe("none");
    expect(box.ribbon).toBe(false);
    expect(validateBoxFields(box)).toEqual([]);
    const design = hydrateDesign({ ...createDefaultDesign(), box: legacy as BoxState });
    expect(design.box.closure).toBe("lift-off");
    expect(design.box.insert.orientation).toBe("standing");
  });

  it("maps a catalog form onto the closure when that box is chosen", () => {
    const design = createDefaultDesign();
    applyVariant(design, "box", "box-magnetic");
    expect(design.box.closure).toBe("magnetic");
    applyVariant(design, "box", "box-drawer");
    expect(design.box.closure).toBe("drawer");
    applyVariant(design, "box", "box-coffret");
    expect(design.box.closure).toBe("book");
    expect(design.box.insert.orientation).toBe("standing");
  });
});

describe("box field validation", () => {
  it("rejects unknown enums and sizes outside the range", () => {
    const box = createDefaultDesign().box;
    const bad = validateBoxFields({ ...box, closure: "hinge" as BoxState["closure"], boardMm: 12, insert: { ...box.insert, clearanceMm: 0 } });
    expect(bad.map((issue) => issue.path)).toEqual(expect.arrayContaining(["closure", "boardMm", "insert"]));
  });

  it("clamps an out-of-range board back into the legal range", () => {
    const box = hydrateBox({ ...createDefaultDesign().box, boardMm: 20, closure: "nope" as BoxState["closure"] });
    expect(box.boardMm).toBe(4.5);
    expect(box.closure).toBe("lift-off");
    expect(validateBoxFields(box)).toEqual([]);
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
    design.box.closure = "book";
    design.box.ribbon = true;
    design.box.pullTab = true;
    design.box.outerWrap = "tissue";
    design.box.material = "carton";
    design.box.boardMm = 1.2;
    design.box.wrap = { color: "#6b3c32", finish: "velvet" };
    design.box.insert = { material: "velvet-foam", orientation: "lying", clearanceMm: 3.5 };
    const back = decodeShare(encodeShare(design));
    expect(back?.box.closure).toBe("book");
    expect(back?.box.ribbon).toBe(true);
    expect(back?.box.pullTab).toBe(true);
    expect(back?.box.outerWrap).toBe("tissue");
    expect(back?.box.material).toBe("carton");
    expect(back?.box.boardMm).toBe(1.2);
    expect(back?.box.wrap).toEqual({ color: "#6b3c32", finish: "velvet" });
    expect(back?.box.insert).toEqual({ material: "velvet-foam", orientation: "lying", clearanceMm: 3.5 });

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
    expect(restored?.box.closure).toBe("lift-off");
    expect(restored?.box.insert.orientation).toBe("standing");
    expect(restored?.bottle.variantId).toBe(legacy.bottle.variantId);
    expect(decodeShare("%%%")).toBeNull();
  });
});
