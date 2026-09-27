import { describe, expect, it } from "vitest";
import { CATALOG_COUNTS } from "../model/catalog.ts";
import { BOTTLES } from "../model/bottles.ts";
import { CAPS } from "../model/caps.ts";
import { LOGOS } from "../model/logos.ts";
import { bottleRadii } from "../model/sample.ts";
import { NECKS, neckRadius } from "../model/necks.ts";
import { computeFit } from "../model/fit.ts";
import { createDefaultDesign } from "../model/design.ts";
import { interpretUtterance, type InterpretContext } from "./interpret.ts";

const ctx: InterpretContext = {
  lang: "he",
  selected: null,
  bottleId: "cara-50",
  capId: "cap-cyl-32",
  labelId: "lg-foil-diamond",
  pumpId: "pump-crimp",
  collarId: "col-crimp",
  boxId: "box-rigid",
};

function types(text: string) {
  return interpretUtterance(text, ctx).commands.map((command) => command.type);
}

describe("catalog", () => {
  it("ships the requested range of variants", () => {
    expect(CATALOG_COUNTS.bottle).toBeGreaterThanOrEqual(40);
    expect(CATALOG_COUNTS.bottle).toBeLessThanOrEqual(60);
    expect(CATALOG_COUNTS.cap).toBeGreaterThanOrEqual(48);
    expect(CATALOG_COUNTS.label).toBeGreaterThanOrEqual(48);
    expect(CATALOG_COUNTS.pump).toBeGreaterThanOrEqual(8);
    expect(CATALOG_COUNTS.collar).toBeGreaterThanOrEqual(8);
    expect(CATALOG_COUNTS.box).toBeGreaterThanOrEqual(6);
    expect(new Set(BOTTLES.map((b) => b.id)).size).toBe(BOTTLES.length);
    expect(new Set(CAPS.map((b) => b.id)).size).toBe(CAPS.length);
    expect(new Set(LOGOS.map((b) => b.id)).size).toBe(LOGOS.length);
  });

  it("locks the Cara 50 neck to FEA 15", () => {
    const cara = BOTTLES.find((b) => b.id === "cara-50");
    expect(cara).toMatchObject({ heightMm: 67.6, widthMm: 51, depthMm: 43, neck: "FEA15" });
    const top = bottleRadii(67.6, 67.6, 51, 43, "cara", 0.13, neckRadius("FEA15"));
    expect(top.rx).toBeCloseTo(7.5, 1);
    expect(top.rz).toBeCloseTo(7.5, 1);
  });

  it("seats the FEA 15 ferrule and lists Coverpla Bazille", () => {
    expect(NECKS.FEA15.ferrule).toEqual({ innerMm: 15.35, outerMm: 16.3, heightMinMm: 5.5, heightMaxMm: 7.9 });
    expect(BOTTLES.find((b) => b.id === "bazille-30")).toMatchObject({ heightMm: 64, widthMm: 39.2, depthMm: 39.2, neck: "FEA15" });
    expect(BOTTLES.find((b) => b.id === "bazille-50")).toMatchObject({ heightMm: 75.8, widthMm: 46.8, depthMm: 46.8, neck: "FEA15" });
    expect(BOTTLES.find((b) => b.id === "bazille-100")).toMatchObject({ heightMm: 90.9, widthMm: 57, depthMm: 57, neck: "FEA15" });
    const fit = computeFit(createDefaultDesign(), false);
    expect(fit.collarInner * 2).toBeCloseTo(15.35, 2);
    expect(fit.collarOuter * 2).toBeCloseTo(16.3, 2);
    expect(fit.collarHeight).toBeGreaterThanOrEqual(5.5);
    expect(fit.collarHeight).toBeLessThanOrEqual(7.9);
    expect(NECKS.FEA13.ferrule).toEqual({ innerMm: 13.35, outerMm: 14.3, heightMinMm: 4.7, heightMaxMm: 7.1 });
    expect(NECKS.FEA17.ferrule).toEqual({ innerMm: 16.9, outerMm: 17.9, heightMinMm: 5.9, heightMaxMm: 8.3 });
    expect(NECKS.FEA18.ferrule).toEqual({ innerMm: 18.6, outerMm: 19.6, heightMinMm: 5.5, heightMaxMm: 8.3 });
    expect(NECKS.FEA20.ferrule).toEqual({ innerMm: 20.1, outerMm: 21.1, heightMinMm: 5.6, heightMaxMm: 9.0 });
    expect(BOTTLES.find((b) => b.id === "cube-50")).toMatchObject({ heightMm: 54.9, widthMm: 46, depthMm: 46, neck: "FEA15" });
    expect(BOTTLES.find((b) => b.id === "linton-100")).toMatchObject({ heightMm: 135, widthMm: 59, depthMm: 29.3, neck: "FEA15" });
    expect(createDefaultDesign().cap).toMatchObject({ variantId: "cap-cube-tall", heightMm: 34.5, widthMm: 30, finish: "gold" });
  });
});

describe("parser", () => {
  it("understands the trade-show phrases", () => {
    const cap = interpretUtterance("make the cap matte black and taller", ctx);
    expect(cap.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "finish", part: "cap", finish: "matteBlack" }),
      expect.objectContaining({ type: "nudge", part: "cap", axis: "height" }),
    ]));

    const square = interpretUtterance("change the bottle to square frosted glass", ctx);
    expect(square.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "variant", part: "bottle" }),
      expect.objectContaining({ type: "finish", part: "bottle", finish: "frosted" }),
    ]));

    expect(interpretUtterance("remove the box", ctx).commands).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "visible", part: "box", visible: false })]),
    );
    expect(interpretUtterance("make the liquid pink", ctx).commands).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "color", part: "liquid", color: "#f3c9d6" })]),
    );
    expect(types("explode")).toContain("explode");
    expect(types("rotate")).toContain("rotate");
    expect(interpretUtterance("תחליף את הפקק לשחור מט", ctx).commands).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "finish", part: "cap", finish: "matteBlack" })]),
    );
    expect(interpretUtterance("תגדיל את הבקבוק", ctx).commands).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "nudge", part: "bottle" })]),
    );
    expect(interpretUtterance("תסיר את הקופסה", ctx).commands).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "visible", part: "box", visible: false })]),
    );
    expect(interpretUtterance("זכוכית חלבית", ctx).commands).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "finish", part: "bottle", finish: "frosted" })]),
    );
    expect(interpretUtterance("פקק זהב", ctx).commands).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "finish", part: "cap", finish: "gold" })]),
    );
    expect(interpretUtterance("תפרק", ctx).commands).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "explode", value: true })]),
    );
    expect(interpretUtterance("next cap", ctx).commands).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "cycle", part: "cap", dir: 1 })]),
    );
    expect(interpretUtterance("פקק הבא", ctx).commands).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "cycle", part: "cap", dir: 1 })]),
    );
    expect(interpretUtterance("FEA 18", ctx).commands).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "neck", neck: "FEA18" })]),
    );
  });
});
