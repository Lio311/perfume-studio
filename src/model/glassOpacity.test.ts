import { describe, expect, it } from "vitest";
import { mappedGlassOpacity, renderedGlassOpacity } from "./materials.ts";

describe("renderedGlassOpacity", () => {
  it("uses the owner's tinted and frosted alpha curve", () => {
    expect(mappedGlassOpacity(0)).toBeCloseTo(0.15);
    expect(mappedGlassOpacity(0.4)).toBeCloseTo(0.49);
    expect(mappedGlassOpacity(1)).toBeCloseTo(1);
    expect(renderedGlassOpacity("tinted", 0.4)).toBeCloseTo(mappedGlassOpacity(0.4));
    expect(renderedGlassOpacity("frosted", 0)).toBeCloseTo(0.15);
    expect(renderedGlassOpacity("frosted", 1)).toBeCloseTo(1);
  });

  it("keeps clear glass on the slider value and defaults unchanged", () => {
    expect(renderedGlassOpacity("clear", 0.4)).toBeCloseTo(0.4);
    expect(renderedGlassOpacity("clear")).toBeCloseTo(0.14);
    expect(renderedGlassOpacity("tinted")).toBeCloseTo(0.32);
    expect(renderedGlassOpacity("frosted")).toBeCloseTo(0.45);
    expect(renderedGlassOpacity("gold", 0.4)).toBeNull();
  });
});