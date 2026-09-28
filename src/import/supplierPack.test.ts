import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("dompurify", () => ({
  default: { sanitize: (value: string) => value },
}));

import minimalText from "./fixtures/a-minimal-v1-pack.json?raw";
import v2Text from "./fixtures/b-v2-bottle-photo-cap-scan-price.json?raw";
import invalidText from "./fixtures/c-invalid-pack.json?raw";
import { formatPackNotice } from "./notices.ts";
import { MAX_PACK_BYTES } from "./packValidate.ts";
import { importedMeta, isVariantPart, syncRegistry, type SupplierPart } from "./registry.ts";
import { parsePackFile, reviveStoredPack, serializePack } from "./supplierDb.ts";
import { sanitizeSupplierPrice } from "../model/price.ts";
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
    expect(result.warnings).toEqual([]);
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
    expect(result.warnings).toEqual([]);
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

  it("drops an invalid price with a warning and still imports the part", () => {
    const price = { value: 0, currency: "usd", tiers: [{ minQty: 0, value: 0.4 }, { qty: 10, value: 1 }] };
    const mesh = { format: "glb", units: "mm", upAxis: "y", origin: "base-center", url: "https://example.com/cap.glb" };
    const result = parsePackFile(packWith({ price, mesh }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.parts[0]).toMatchObject({ id: "part-1", mesh });
    expect(result.pack.parts[0]).not.toHaveProperty("price");
    expect(result.warnings.map((notice) => notice.type === "priceIssue" ? notice.code : notice.type)).toEqual([
      "price_value",
      "price_currency",
    ]);
    expect(formatPackNotice("he", result.warnings[0])).toContain("המחיר");
    expect(formatPackNotice("en", result.warnings[0])).toContain("price");
    expect(formatPackNotice("he", result.warnings[0])).toContain("CAP-1");
  });

  it("drops a tier that is not above moq and keeps the repaired price", () => {
    const result = parsePackFile(packWith({
      price: {
        value: 0.48,
        currency: "USD",
        moq: 5000,
        tiers: [
          { minQty: 5000, value: 0.48 },
          { minQty: 20000, value: 0.41 },
          { minQty: 50000, value: 0.36 },
        ],
      },
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.pack.parts[0] as { price?: unknown }).price).toEqual({
      value: 0.48,
      currency: "USD",
      moq: 5000,
      tiers: [
        { minQty: 20000, value: 0.41 },
        { minQty: 50000, value: 0.36 },
      ],
    });
    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: "priceIssue",
        ref: "CAP-1",
        path: "tiers[0].minQty",
        code: "tier_not_above_moq",
      }),
    ]);
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
    expect(missing.error.en).toBe("That file is not a supplier pack.");
  });

  it("rejects a file over 5 MB before parsing it", () => {
    const text = `{"name":"Big"${" ".repeat(MAX_PACK_BYTES)}`;
    expect(text.length).toBeGreaterThan(MAX_PACK_BYTES);
    const result = parsePackFile(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.he).toContain("5");
    expect(result.error.en).toContain("5 MB");
    expect(result.error.he).not.toBe("הקובץ אינו חבילת ספק.");
  });

  it("caps the rejection at the first 10 problems", () => {
    const parts = Array.from({ length: 12 }, (_, index) => ({
      ...base,
      id: `bad-${index + 1}`,
      code: `E${String(index + 1).padStart(2, "0")}`,
      color: "nope",
    }));
    const result = parsePackFile(JSON.stringify({ id: "sup-many", name: "Many", createdAt: 1, parts }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.en).toContain("E10");
    expect(result.error.en).not.toContain("E11");
    expect(result.error.en).not.toContain("E12");
    expect(result.error.en).toContain("and 2 more");
    expect(result.error.he).toContain("ועוד 2");
  });

  it("type-checks version, source, and supplier", () => {
    const asText = (extra: Record<string, unknown>) => JSON.stringify({
      id: "sup-meta",
      name: "Meta",
      createdAt: 1,
      parts: [base],
      ...extra,
    });
    const versionText = parsePackFile(asText({ version: "2" }));
    expect(versionText.ok).toBe(false);
    if (!versionText.ok) expect(versionText.error.en).toContain("integer 2");
    const versionOne = parsePackFile(asText({ version: 1 }));
    expect(versionOne.ok).toBe(false);
    const source = parsePackFile(asText({ source: "email" }));
    expect(source.ok).toBe(false);
    if (!source.ok) expect(source.error.en).toContain("pdf, photo, scan");
    const supplier = parsePackFile(asText({ supplier: "Gulf" }));
    expect(supplier.ok).toBe(false);
    if (!supplier.ok) expect(supplier.error.en).toContain("supplier must be an object");
    const ok = parsePackFile(asText({ version: 2, source: "manual", supplier: { company: "Meta" } }));
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.pack.version).toBe(2);
    expect(ok.pack.source).toBe("manual");
    expect(ok.pack.supplier).toEqual({ company: "Meta" });
  });

  it("strips prototype keys from the pack and from optional objects", () => {
    const text = JSON.stringify({
      id: "sup-proto",
      name: "Proto",
      createdAt: 1,
      parts: [{
        ...base,
        mesh: { format: "glb" },
        scan: { method: "photo-lathe" },
      }],
    }).replace(
      '"createdAt":1',
      '"createdAt":1,"__proto__":{"polluted":true},"constructor":{"polluted":true},"prototype":{"polluted":true}',
    ).replace(
      '"format":"glb"',
      '"format":"glb","__proto__":{"polluted":true},"constructor":{"bad":true},"prototype":{"bad":true}',
    );
    const result = parsePackFile(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
    expect(Object.hasOwn(result.pack, "__proto__")).toBe(false);
    expect(Object.hasOwn(result.pack, "constructor")).toBe(false);
    expect(Object.hasOwn(result.pack, "prototype")).toBe(false);
    const mesh = (result.pack.parts[0] as { mesh?: Record<string, unknown> }).mesh;
    expect(mesh).toMatchObject({ format: "glb" });
    expect(mesh && Object.hasOwn(mesh, "__proto__")).toBe(false);
    expect(mesh && Object.hasOwn(mesh, "constructor")).toBe(false);
    expect(mesh && Object.hasOwn(mesh, "prototype")).toBe(false);
    const scan = (result.pack.parts[0] as { scan?: Record<string, unknown> }).scan;
    expect(scan).toEqual({ method: "photo-lathe" });
  });

  it("rejects a duplicate id, a built-in catalog id, and out-of-range lathe or millimetres", () => {
    const duplicate = parsePackFile(JSON.stringify({
      id: "sup-dup",
      name: "Dup",
      createdAt: 1,
      parts: [base, { ...base, code: "CAP-2" }],
    }));
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.en).toContain("duplicated");

    const builtin = parsePackFile(packWith({ id: "cara-50", code: "CARA" }));
    expect(builtin.ok).toBe(false);
    if (!builtin.ok) expect(builtin.error.he).toContain("cara-50");

    const lathe = parsePackFile(packWith({ lathe: [0, 1.2, 1.3] }));
    expect(lathe.ok).toBe(false);
    if (!lathe.ok) expect(lathe.error.en).toContain("1.2");

    const tall = parsePackFile(packWith({ heightMm: 500 }));
    expect(tall.ok).toBe(false);
    if (!tall.ok) expect(tall.error.en).toContain("between 10 and 78");

    const edge = parsePackFile(packWith({ lathe: [0, 1.2] }));
    expect(edge.ok).toBe(true);
  });

  it("drops a non-object mesh and keeps a valid price exactly", () => {
    const price = { value: 1.25, currency: "EUR", moq: 1, tiers: [{ minQty: 2, value: 1.25 }, { minQty: 10, value: 1.1 }], quotedAt: "2026-10-06" };
    const result = parsePackFile(packWith({ price, mesh: "glb", measurements: [{ key: "heightMm", value: 32 }] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.pack.parts[0] as { price?: unknown }).price).toEqual(price);
    expect(result.pack.parts[0]).not.toHaveProperty("mesh");
    expect(result.warnings.some((notice) => notice.type === "droppedField" && notice.field === "mesh")).toBe(true);
    expect(sanitizeSupplierPrice(price)).toEqual({ price, issues: [] });
    expect(sanitizeSupplierPrice({ value: 0, currency: "USD" }).price).toBeUndefined();
    expect(sanitizeSupplierPrice({ value: 1, currency: "usd" }).price).toBeUndefined();
    const duplicate = sanitizeSupplierPrice({ value: 1, currency: "USD", tiers: [{ minQty: 5, value: 1 }, { minQty: 5, value: 0.9 }] });
    expect(duplicate.price?.tiers).toEqual([{ minQty: 5, value: 1 }]);
    expect(duplicate.issues.map((item) => item.code)).toEqual(["tier_not_ascending"]);
    expect(sanitizeSupplierPrice({ value: 1, currency: "USD", quotedAt: "2026-02-31" }).price).toBeUndefined();
    expect(sanitizeSupplierPrice({ value: 1, currency: "USD", extra: true }).price).toBeUndefined();
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
    }]).map((notice) => formatPackNotice("he", notice));
    expect(messages.join(" ")).toContain("lid");
    expect(messages.join(" ")).toContain("קופסה");
    expect(formatPackNotice("en", { type: "unknownKind", ref: "X1", kind: "lid" })).toContain("box");
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
    }]).map((notice) => `${formatPackNotice("he", notice)} ${formatPackNotice("en", notice)}`);
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

describe("reviveStoredPack", () => {
  afterEach(() => syncRegistry([]));

  it("keeps a valid stored pack, including price, mesh, scan, and measurements", () => {
    const raw = JSON.parse(v2Text);
    const revived = reviveStoredPack(raw);
    expect(revived.warnings).toEqual([]);
    expect(revived.pack).toEqual(raw);
    expect(reviveStoredPack(JSON.parse(minimalText))).toEqual({ pack: JSON.parse(minimalText), warnings: [] });
  });

  it("drops a bad stored part with a warning and keeps the valid one", () => {
    const revived = reviveStoredPack({
      id: "sup-old",
      name: "Stored",
      createdAt: 4,
      parts: [
        base,
        { ...base, id: "lid-1", code: "LID", kind: "lid" },
        { ...base, id: "cara-50", code: "BUILT" },
        { ...base, id: "neck-16", code: "N16", neck: "FEA16" },
      ],
    });
    expect(revived.pack?.parts.map((part) => part.id)).toEqual(["part-1"]);
    expect(revived.warnings.map((notice) => notice.type === "droppedPart" ? notice.ref : notice.type)).toEqual(["LID", "BUILT", "N16"]);
    expect(formatPackNotice("en", revived.warnings[0])).toContain("LID");
    const notices = syncRegistry(revived.pack ? [revived.pack] : []);
    expect(notices).toEqual([]);
    expect(() => computeFit(createDefaultDesign())).not.toThrow();
  });

  it("drops only an invalid stored price and a bad version field", () => {
    const revived = reviveStoredPack({
      id: "sup-old",
      name: "Stored",
      createdAt: 4,
      version: "2",
      source: "scan",
      parts: [{ ...base, price: { value: 1, currency: "usd" } }],
    });
    expect(revived.pack?.version).toBeUndefined();
    expect(revived.pack?.source).toBe("scan");
    expect(revived.pack?.parts).toHaveLength(1);
    expect(revived.pack?.parts[0]).not.toHaveProperty("price");
    expect(revived.warnings).toEqual([
      { type: "droppedMeta", field: "version" },
      expect.objectContaining({
        type: "priceIssue",
        ref: "CAP-1",
        path: "currency",
        code: "price_currency",
      }),
    ]);
  });

  it("removes a stored pack that is not a pack", () => {
    expect(reviveStoredPack(null).warnings).toEqual([{ type: "droppedPack" }]);
    expect(reviveStoredPack(null).pack).toBeNull();
  });
});
