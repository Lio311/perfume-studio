import { describe, expect, it } from "vitest";
import { assignClearGlassFade, bottleGlassSetting, clearGlassFade, renderedGlassOpacity } from "../model/materials.ts";
import { createDefaultDesign } from "../model/design.ts";
import { dampOpacity, writeBottleGlassFrame, type BottleGlassMaterial } from "./materialFade.ts";

function glassMat(partial: Partial<BottleGlassMaterial> = {}): BottleGlassMaterial {
  return {
    opacity: 1,
    transparent: false,
    depthWrite: true,
    userData: {},
    ...partial,
  };
}

describe("first-mount bottle glass", () => {
  it("writes the default clear fade onto a uniform that still holds 0", () => {
    const uniforms = { uFade: { value: 0 } };
    expect(assignClearGlassFade(uniforms, undefined)).toBeCloseTo(1);
    expect(uniforms.uFade.value).toBeCloseTo(clearGlassFade(undefined));
  });

  it("snaps the first PartShell write from uFade 0 and then damps", () => {
    const design = createDefaultDesign();
    design.bottle.visible = true;
    const setting = bottleGlassSetting(design.bottle.finish, design.bottle.opacity);
    const mat = glassMat({ uniforms: { uFade: { value: 0 } } });

    expect(writeBottleGlassFrame(mat, setting, false, 0.016)).toBe(true);
    expect(mat.uniforms?.uFade?.value).toBeCloseTo(1);
    expect(mat.depthWrite).toBe(false);
    expect(mat.transparent).toBe(true);

    mat.uniforms!.uFade!.value = 0;
    const damped = dampOpacity(0, 1, 7, 0.016);
    writeBottleGlassFrame(mat, setting, false, 0.016);
    expect(mat.uniforms?.uFade?.value).toBeCloseTo(damped);
    expect(mat.uniforms?.uFade?.value).toBeLessThan(0.5);
    expect(mat.depthWrite).toBe(false);
  });

  it("keeps depthWrite off for frosted and tinted glass once opacity passes one half", () => {
    const frostedAlpha = renderedGlassOpacity("frosted", 0.5);
    expect(frostedAlpha).toBeGreaterThan(0.5);
    const frosted = glassMat();
    writeBottleGlassFrame(frosted, { fade: null, alpha: frostedAlpha }, false, 0.016);
    expect(frosted.depthWrite).toBe(false);
    expect(frosted.opacity).toBeCloseTo(frostedAlpha ?? 0);

    const tintedAlpha = renderedGlassOpacity("tinted", 0.6);
    expect(tintedAlpha).toBeGreaterThan(0.5);
    const tinted = glassMat({ userData: { baseOpacity: 1 } });
    tinted.opacity = 1;
    writeBottleGlassFrame(tinted, { fade: null, alpha: tintedAlpha }, false, 0.016);
    expect(tinted.depthWrite).toBe(false);
    expect(tinted.opacity).toBeLessThan(1);
    expect(tinted.opacity).toBeGreaterThan(0.5);
  });
});
