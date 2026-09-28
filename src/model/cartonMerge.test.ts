import { describe, expect, it, vi } from "vitest";
import { mergePersistedLab, sanitizeDesign } from "../store/hydrate.ts";
import { hydrateBox } from "./boxFields.ts";
import { listClosures } from "./closures/registry.ts";
import { createDefaultDesign } from "./design.ts";
import { computeFit } from "./fit.ts";
import { FINISHES } from "./materials.ts";
import { decodeShare, encodeShare } from "./share.ts";
import type { Design } from "./types.ts";

const FINISH_IDS = new Set(FINISHES.map((item) => item.id));
const STRUCTURES = new Set(listClosures().map((item) => item.id));

/** Same bytes `encodeShare` writes, for a payload that is not a valid design. */
function shareHash(value: unknown): string {
  const json = JSON.stringify(value);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fullyConfiguredBox(): Design {
  const design = createDefaultDesign();
  design.box = hydrateBox({
    variantId: "box-rigid",
    finish: "leather",
    color: "#243044",
    heightMm: 140,
    widthMm: 90,
    depthMm: 70,
    linked: false,
    visible: true,
    structure: "drawer",
    latch: "ribbon",
    liftOff: { variant: "telescope-full", neckMm: 22, lidDepthMm: 48 },
    drawerPull: "notch",
    shape: { type: "polygon", sides: 8 },
    layers: [
      {
        role: "structure",
        structure: "sleeve",
        latch: "none",
        hingeAxis: "",
        doors: 1,
        drawerCount: 1,
        direction: "out",
        neckHeight: 0,
        splitPlaneAngle: 0,
        window: { shape: "rect", transparent: true },
        motion: null,
      },
      {
        role: "structure",
        structure: "drawer",
        latch: "ribbon",
        hingeAxis: "",
        doors: 1,
        drawerCount: 1,
        direction: "out",
        neckHeight: 0,
        splitPlaneAngle: 0,
        window: null,
        motion: null,
      },
    ],
    insertMotion: {
      trayLift: { height: 30, trigger: "lidAngle" },
      pullTab: true,
      extractDirection: "out",
      pose: { tiltAngle: 12, invert: false },
    },
    boardMm: 3.1,
    material: "carton",
    wrap: { color: "#243044", finish: "velvet" },
    ribbon: true,
    pullTab: true,
    outerWrap: "cellophane",
    insert: { material: "velvet-foam", orientation: "lying", clearanceMm: 4 },
  });
  return design;
}

describe("reverted merge", () => {
  it("keeps the carton board and cavity the bad merge dropped from fit", () => {
    const fit = computeFit(createDefaultDesign());
    expect(fit.boardMm).toBeGreaterThan(0);
    expect(fit.floorMm).toBeGreaterThan(0);
    expect(fit.cavityW).toBeGreaterThan(0);
    expect(fit.cavityD).toBeGreaterThan(0);
    expect(fit.cavityH).toBeGreaterThan(0);
    expect(fit.lyingLift).toBeGreaterThan(fit.boardMm);
    expect(fit.insertW).toBeGreaterThan(fit.cavityW);
  });
});

describe("fully configured share link", () => {
  it("round-trips drawer, telescope, ribbon, octagon, and the velvet insert", () => {
    const design = fullyConfiguredBox();
    const back = decodeShare(encodeShare(design));
    expect(back?.box).toEqual(design.box);
    expect(back?.box.structure).toBe("drawer");
    expect(back?.box.latch).toBe("ribbon");
    expect(back?.box.liftOff).toEqual({ variant: "telescope-full", neckMm: 22, lidDepthMm: 48 });
    expect(back?.box.drawerPull).toBe("notch");
    expect(back?.box.shape).toEqual({ type: "polygon", sides: 8 });
    expect(back?.box.layers.map((layer) => layer.structure)).toEqual(["sleeve", "drawer"]);
    expect(back?.box.insert).toEqual({ material: "velvet-foam", orientation: "lying", clearanceMm: 4 });
  });

  it("drops a malformed or hostile box from a share link", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(decodeShare("%%%")).toBeNull();
    expect(decodeShare("bm90LWpzb24")).toBeNull();

    const design = createDefaultDesign();
    const back = decodeShare(shareHash({
      ...design,
      box: {
        variantId: "box-rigid",
        finish: "<script>alert(1)</script>",
        color: "javascript:alert(1)",
        structure: "__proto__",
        latch: "magnet'; DROP TABLE boxes",
        layers: "not-an-array",
        heightMm: Number.POSITIVE_INFINITY,
        widthMm: -9999,
        depthMm: "140",
        boardMm: 999,
        shape: { type: "polygon", sides: 99999 },
        insert: { material: "uranium", orientation: "sideways", clearanceMm: Number.NaN },
        wrap: { color: "red", finish: "chrome" },
        constructor: { prototype: { polluted: true } },
      },
    }));
    warn.mockRestore();

    expect(back).not.toBeNull();
    expect(FINISH_IDS.has(back!.box.finish)).toBe(true);
    expect(back!.box.finish).toBe("matteBlack");
    expect(STRUCTURES.has(back!.box.structure)).toBe(true);
    expect(back!.box.structure).toBe("lift-off");
    expect(back!.box.layers.every((layer) => STRUCTURES.has(layer.structure))).toBe(true);
    expect(back!.box.heightMm).toBeGreaterThanOrEqual(70);
    expect(back!.box.heightMm).toBeLessThanOrEqual(240);
    expect(back!.box.widthMm).toBeGreaterThanOrEqual(40);
    expect(back!.box.widthMm).toBeLessThanOrEqual(160);
    expect(back!.box.shape.type === "polygon" ? back!.box.shape.sides : 0).toBeLessThanOrEqual(12);
    expect(back!.box.insert.material).toBe("eva");
    expect(Object.prototype).not.toHaveProperty("polluted");
  });
});

describe("hostile box in storage", () => {
  it("replaces a malformed box and ignores live fields smuggled in the blob", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const missing = sanitizeDesign({ box: "not-a-box" });
    expect(missing.box.structure).toBe("lift-off");
    expect(FINISH_IDS.has(missing.box.finish)).toBe(true);

    const hostile = sanitizeDesign({
      box: {
        variantId: "box-rigid",
        finish: { toString: () => "gold" },
        structure: ["drawer"],
        latch: 0,
        layers: [null, 1, { role: "nope", structure: "constructor", latch: null }],
        heightMm: "140",
        widthMm: 1e20,
        depthMm: -1,
        color: "#ffffff",
        linked: "yes",
        visible: 1,
        boardMm: "thick",
        insertMotion: "rise",
        shape: "octagon",
      },
    });
    warn.mockRestore();

    expect(FINISH_IDS.has(hostile.box.finish)).toBe(true);
    expect(hostile.box.finish).toBe("matteBlack");
    expect(STRUCTURES.has(hostile.box.structure)).toBe(true);
    expect(hostile.box.layers.length).toBeGreaterThan(0);
    expect(hostile.box.layers.every((layer) => STRUCTURES.has(layer.structure))).toBe(true);
    expect(hostile.box.widthMm).toBeLessThanOrEqual(160);
    expect(hostile.box.widthMm).toBeGreaterThanOrEqual(40);
    expect(Number.isFinite(hostile.box.heightMm)).toBe(true);
    expect(Number.isFinite(hostile.box.boardMm)).toBe(true);
    expect(hostile.box.shape.type).toBe("rect");

    const current = {
      design: createDefaultDesign(),
      theme: "dark" as const,
      lang: "he" as const,
      chat: [],
      saved: [],
      pending: [],
      compareIds: [],
      past: [],
      future: [],
      cutaway: false,
      quality: "fallback" as const,
      tierLock: false,
      packNotices: [] as const,
    };
    const merged = mergePersistedLab({
      design: { box: null },
      cutaway: true,
      quality: "high",
      tierLock: true,
      packNotices: [{ kind: "dropped" }],
    }, current);
    expect(merged.design.box.structure).toBe("lift-off");
    expect(merged.cutaway).toBe(false);
    expect(merged.quality).toBe("fallback");
    expect(merged.tierLock).toBe(false);
    expect(merged.packNotices).toEqual([]);
    expect(Object.prototype).not.toHaveProperty("polluted");
  });
});
