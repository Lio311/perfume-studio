import { describe, expect, it } from "vitest";
import { createDefaultDesign } from "./design.ts";
import { decodeShareDesign, encodeShareDesign, mergeShareDesign } from "./share.ts";

describe("share links", () => {
  it("round-trips a design, including Hebrew label text", () => {
    const design = createDefaultDesign();
    design.label.text = "אור נואר";
    design.step = 3;
    const decoded = decodeShareDesign(encodeShareDesign(design));
    expect(decoded).toEqual(design);
  });

  it("fills liquid and label when an older payload omits them", () => {
    const defaults = createDefaultDesign();
    const decoded = mergeShareDesign({
      bottle: { variantId: "diamond-50", visible: true },
      cap: { visible: true },
    });
    expect(decoded).not.toBeNull();
    expect(decoded?.bottle.variantId).toBe("diamond-50");
    expect(decoded?.bottle.visible).toBe(true);
    expect(decoded?.bottle.heightMm).toBe(defaults.bottle.heightMm);
    expect(decoded?.cap.visible).toBe(true);
    expect(decoded?.cap.variantId).toBe(defaults.cap.variantId);
    expect(decoded?.liquid).toEqual(defaults.liquid);
    expect(decoded?.label).toEqual(defaults.label);
    expect(decoded?.pump).toEqual(defaults.pump);
    expect(decoded?.collar).toEqual(defaults.collar);
    expect(decoded?.box).toEqual(defaults.box);
    expect(decoded?.step).toBeUndefined();
    expect(decoded?.liquid.fill).toBeTypeOf("number");
    expect(decoded?.label.text).toBeTypeOf("string");
  });

  it("keeps valid partial fields and drops mistyped ones", () => {
    const defaults = createDefaultDesign();
    const decoded = mergeShareDesign({
      bottle: {},
      liquid: "nope",
      label: { text: "אור", scale: "big", visible: true },
      step: Number.NaN,
    });
    expect(decoded?.liquid).toEqual(defaults.liquid);
    expect(decoded?.label.text).toBe("אור");
    expect(decoded?.label.scale).toBe(defaults.label.scale);
    expect(decoded?.label.visible).toBe(true);
    expect(decoded?.label.variantId).toBe(defaults.label.variantId);
    expect(decoded?.step).toBeUndefined();
  });

  it("returns null for malformed hashes and non-design payloads", () => {
    expect(decodeShareDesign("%%%")).toBeNull();
    expect(decodeShareDesign("not base64")).toBeNull();
    expect(mergeShareDesign(null)).toBeNull();
    expect(mergeShareDesign([])).toBeNull();
    expect(mergeShareDesign("bottle")).toBeNull();
    expect(mergeShareDesign({ foo: 1 })).toBeNull();
    const junk = btoa(unescape(encodeURIComponent("[]"))).replace(/=+$/g, "");
    expect(decodeShareDesign(junk)).toBeNull();
  });

  it("decodes a hash that is missing padding", () => {
    const design = createDefaultDesign();
    design.liquid = { color: "#112233", fill: 0.4, visible: true };
    const hash = encodeShareDesign(design);
    expect(hash.endsWith("=")).toBe(false);
    expect(decodeShareDesign(hash)?.liquid).toEqual(design.liquid);
  });
});
