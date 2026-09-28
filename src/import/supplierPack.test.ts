import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("dompurify", () => ({
  default: { sanitize: (value: string) => value },
}));

import minimalText from "./fixtures/a-minimal-v1-pack.json?raw";
import v2Text from "./fixtures/b-v2-bottle-photo-cap-scan-price.json?raw";
import invalidText from "./fixtures/c-invalid-pack.json?raw";
import { importedMeta, isVariantPart, syncRegistry, type SupplierPart } from "./registry.ts";
import { parsePackFile, serializePack } from "./supplierDb.ts";
import { applyVariant, createDefaultDesign } from "../model/design.ts";
import { boxById, capById, listFor } from "../model/catalog.ts";
import { computeFit } from "../model/fit.ts";
import { neckRadius } from "../model/necks.ts";
import type { NeckId } from "../model/types.ts";

const base: SupplierPart = {
  id: "part-1",
  kind: "cap",
  code: "CAP-1",
  name: "CAP-1 · Aurora",
  neck: "FEA15",
  widthMm: 30,
  heightMm: 32,
  depthMm: 30,
  capacityMl: null,
  profile: "cylinder",
  color: "#c4a15a",
  thumb: "",
  page: 1,
};

function packWith(part: Record<string, unknown>) {
  return JSON.stringify({
    id: "sup-test",
    name: "Test Supplier",
    createdAt: 10,
    parts: [{ ...base, ...part }],
  });
}

describe("parsePackFile", () => {
  afterEach(() => syncRegistry([]));

  it("imports the minimal v1 pack unchanged", () => {
    const result = parsePackFile(minimalText);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack).toEqual(JSON.parse(minimalText));
  });

  it("imports a v2 pack with future fields and round-trips supplier, version, and source", () => {
    const raw = JSON.parse(v2Text) as {
      version: number;
      source: string;
      supplier: { company: string };
      generator: { name: string };
      parts: Array<{ price?: unknown; scan?: unknown; measurements?: unknown; mesh?: unknown }>;
    };
    const result = parsePackFile(v2Text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack).toEqual(raw);
    expect(result.pack.version).toBe(2);
    expect(result.pack.source).toBe("scan");
    expect(result.pack.supplier).toEqual(raw.supplier);
    expect(result.pack.parts[0]).toMatchObject({ price: raw.parts[0].price, scan: raw.parts[0].scan, measurements: raw.parts[0].measurements });
    expect(result.pack.parts[1]).toMatchObject({ price: raw.parts[1].price });

    const again = parsePackFile(serializePack(result.pack));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.pack.version).toBe(2);
    expect(again.pack.source).toBe("scan");
    expect(again.pack.supplier).toEqual(raw.supplier);
    expect((again.pack as { generator?: unknown }).generator).toEqual(raw.generator);
    expect(again.pack.parts.map((part) => (part as { price?: unknown }).price)).toEqual(raw.parts.map((part) => part.price));
  });

  it("keeps a price object exactly, including a shape this lab does not interpret", () => {
    const price = { value: 0, currency: "usd", tiers: [{ minQty: 0, value: 0.4 }, { qty: 10, value: 1 }] };
    const mesh = { format: "glb", units: "mm", upAxis: "y", origin: "base-center", url: "https://example.com/cap.glb" };
    const result = parsePackFile(packWith({ price, mesh }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.parts[0]).toMatchObject({ price, mesh });
  });

  it("rejects the invalid sample pack with a Hebrew error", () => {
    const result = parsePackFile(invalidText);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.he).toContain("נדחה");
    expect(result.error.he).toContain("lid");
    expect(result.error.he).toContain("לא יהפוך לקופסה");
    expect(result.error.he).toContain("FEA16");
    expect(result.error.he).toContain("widthMm");
    expect(result.error.he).toContain("#rrggbb");
    expect(result.error.en).toContain("will not become a box");
  });

  it("rejects an unknown kind, an unsupported neck, a negative millimetre, and a bad colour on their own", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ kind: "lid" }, "lid"],
      [{ neck: "FEA16" }, "FEA16"],
      [{ widthMm: -3 }, "widthMm"],
      [{ color: "gold" }, "#rrggbb"],
    ];
    for (const [patch, token] of cases) {
      const result = parsePackFile(packWith(patch));
      expect(result.ok, JSON.stringify(patch)).toBe(false);
      if (result.ok) continue;
      expect(result.error.he).toContain("נדחה");
      expect(result.error.he).toContain(token);
    }
  });

  it("rejects the whole file when one part is valid and another is not", () => {
    const result = parsePackFile(JSON.stringify({
      id: "sup-mix",
      name: "Mixed",
      createdAt: 1,
      parts: [base, { ...base, id: "bad", code: "BAD", kind: "lid" }],
    }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.he).toContain("BAD");
    expect(result.error.he).toContain("lid");
  });

  it("accepts a null neck and rejects a file that is not JSON", () => {
    const ok = parsePackFile(packWith({ kind: "label", profile: "label", neck: null }));
    expect(ok.ok).toBe(true);
    const missing = parsePackFile("{");
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.error.he).toBe("הקובץ אינו חבילת ספק.");
  });
});

describe("syncRegistry and selection", () => {
  afterEach(() => syncRegistry([]));

  it("skips an unknown kind instead of registering it as a box", () => {
    const design = createDefaultDesign();
    const boxBefore = design.box.variantId;
    const messages = syncRegistry([{
      id: "sup",
      name: "Broken",
      createdAt: 1,
      parts: [{ ...base, id: "lid-1", code: "X1", kind: "lid" as SupplierPart["kind"] }],
    }]);
    expect(messages.join(" ")).toContain("lid");
    expect(messages.join(" ")).toContain("קופסה");
    expect(isVariantPart("lid")).toBe(false);
    expect(boxById("lid-1").id).not.toBe("lid-1");
    expect(listFor("box").some((entry) => entry.id === "lid-1")).toBe(false);
    applyVariant(design, "lid", "lid-1");
    expect(design.box.variantId).toBe(boxBefore);
  });

  it("does not apply an unsupported neck, and a bad neck cannot crash the fit", () => {
    const design = createDefaultDesign();
    const neckBefore = design.bottle.neck;
    const messages = syncRegistry([{
      id: "sup",
      name: "Broken",
      createdAt: 1,
      parts: [{ ...base, id: "bad-neck", code: "N16", neck: "FEA16" as NeckId }],
    }]);
    expect(messages.join(" ")).toContain("FEA16");
    expect(capById("bad-neck").id).toBe("bad-neck");
    expect(importedMeta("bad-neck")?.neck).toBeNull();
    applyVariant(design, "cap", "bad-neck");
    expect(design.cap.variantId).toBe("bad-neck");
    expect(design.bottle.neck).toBe(neckBefore);
    expect(() => computeFit(design)).not.toThrow();

    design.bottle.neck = "FEA16" as NeckId;
    expect(computeFit(design).neckR).toBe(neckRadius("FEA15"));
    expect(neckRadius("FEA18")).toBe(9);
    expect(neckRadius("FEA16" as NeckId)).toBe(neckRadius("FEA15"));
  });
});
