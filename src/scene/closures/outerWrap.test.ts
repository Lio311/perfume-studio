import { describe, expect, it } from "vitest";
import { outerWrapMaterialProps } from "./outerWrap.ts";

describe("outer wrap material", () => {
  it("keeps sleeve and paper opaque and tissue and cellophane thin", () => {
    const cellophane = outerWrapMaterialProps("cellophane", "#9aa0a6", "high");
    const sleeve = outerWrapMaterialProps("sleeve", "#9aa0a6", "high");
    const paper = outerWrapMaterialProps("sleeve", "#e7d3b0", "high");
    const tissue = outerWrapMaterialProps("tissue", "#e7d3b0", "high");
    expect(cellophane.transparent).toBe(true);
    expect(cellophane.opacity).toBeCloseTo(0.18);
    expect(sleeve.opacity).toBe(1);
    expect(sleeve.transparent).toBe(false);
    expect(sleeve.transmission).toBe(0);
    expect(sleeve.depthWrite).toBe(true);
    expect(sleeve.color).toBe("#9aa0a6");
    expect(paper.opacity).toBe(1);
    expect(paper.transparent).toBe(false);
    expect(paper.color).toBe("#e7d3b0");
    expect(cellophane.opacity).toBeCloseTo(0.18);
    expect(tissue.transparent).toBe(true);
    expect(tissue.opacity).toBeCloseTo(0.55);
    expect(paper.opacity).toBe(1);
  });
});
