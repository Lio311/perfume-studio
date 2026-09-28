import { describe, expect, it } from "vitest";
import { canvasHasWebgl } from "./webgl.ts";

describe("webgl probe", () => {
  it("treats a missing or throwing context as unavailable", () => {
    expect(canvasHasWebgl(() => null)).toBe(false);
    expect(canvasHasWebgl(() => {
      throw new Error("WebGL unsupported");
    })).toBe(false);
    expect(canvasHasWebgl((kind) => (kind === "webgl" ? {} : null))).toBe(true);
    expect(canvasHasWebgl((kind) => (kind === "webgl2" ? {} : null))).toBe(true);
  });
});
