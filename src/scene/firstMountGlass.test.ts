import { describe, expect, it } from "vitest";
import { createDefaultDesign } from "../model/design.ts";
import { bottleGlassSetting, clearGlassFade, usesFlatGlassAlpha } from "../model/materials.ts";
import { glassOpacityThisFrame } from "./materialFade.ts";

describe("first-mount bottle glass", () => {
  it("keeps a visible default Cara 50 at full clear fade even if the material still holds uFade 0", () => {
    const design = createDefaultDesign();
    design.bottle.visible = true;

    expect(design.bottle.variantId).toBe("cara-50");
    expect(design.bottle.finish).toBe("clear");
    expect(design.bottle.opacity).toBeUndefined();

    const setting = bottleGlassSetting(design.bottle.finish, design.bottle.opacity);
    expect(setting.fade).toBeCloseTo(1);
    expect(setting.fade).toBeGreaterThan(0);
    expect(clearGlassFade(design.bottle.opacity)).toBeCloseTo(1);
    expect(usesFlatGlassAlpha(design.bottle.finish, design.bottle.opacity)).toBe(false);

    const first = glassOpacityThisFrame(0, setting.fade ?? 0, false);
    expect(first.baseOpacity).toBeCloseTo(1);
    expect(first.target).toBeCloseTo(1);
  });
});
