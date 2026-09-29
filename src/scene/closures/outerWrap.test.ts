import { describe, expect, it } from "vitest";
import { createOuterWrapMaterial, swapOuterWrapMaterial } from "./outerWrap.ts";

describe("outer wrap material", () => {
  it("mints a fresh opaque material when the sleeve replaces cellophane", () => {
    const cellophane = createOuterWrapMaterial("cellophane", "#9aa0a6", "high");
    const sleeve = swapOuterWrapMaterial(cellophane, "sleeve", "#9aa0a6", "high");
    const paper = swapOuterWrapMaterial(sleeve, "sleeve", "#e7d3b0", "high");
    expect(sleeve).not.toBe(cellophane);
    expect(paper).not.toBe(sleeve);
    expect(cellophane.transparent).toBe(true);
    expect(cellophane.opacity).toBeCloseTo(0.18);
    expect(sleeve.opacity).toBe(1);
    expect(sleeve.transparent).toBe(false);
    expect(sleeve.transmission).toBe(0);
    expect(sleeve.depthWrite).toBe(true);
    expect(sleeve.color.getHexString()).toBe("9aa0a6");
    expect(paper.opacity).toBe(1);
    expect(paper.transparent).toBe(false);
    expect(paper.color.getHexString()).toBe("e7d3b0");
    expect(cellophane.opacity).toBeCloseTo(0.18);
    const tissue = swapOuterWrapMaterial(paper, "tissue", "#e7d3b0", "high");
    expect(tissue).not.toBe(paper);
    expect(tissue.transparent).toBe(true);
    expect(tissue.opacity).toBeCloseTo(0.55);
    expect(paper.opacity).toBe(1);
  });
});
