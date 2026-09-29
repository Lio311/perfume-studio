import { describe, expect, it } from "vitest";
import { boardSurface } from "./materials.tsx";

describe("boardSurface", () => {
  it("matches the carton board the emboss mark sits on", () => {
    expect(boardSurface("carton", "matte")).toEqual({ roughness: 0.86, envMapIntensity: 0.4 });
    expect(boardSurface("carton", "paper-texture")).toEqual({ roughness: 0.86, envMapIntensity: 0.4 });
    expect(boardSurface("rigid", "matte")).toEqual({ roughness: 0.8, envMapIntensity: 0.4 });
    expect(boardSurface("carton", "soft-touch")).toEqual({ roughness: 0.72, envMapIntensity: 0.32 });
    expect(boardSurface("carton", "gloss")).toEqual({ roughness: 0.16, envMapIntensity: 0.9 });
    expect(boardSurface("carton", "velvet")).toEqual({ roughness: 0.82, envMapIntensity: 0.55 });
  });
});