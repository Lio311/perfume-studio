import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { afterEach, describe, expect, it, vi } from "vitest";
import schemaText from "../../schema/supplier-pack.schema.json?raw";

vi.mock("dompurify", () => ({
  default: { sanitize: (value: string) => value },
}));

import minimalText from "./fixtures/a-minimal-v1-pack.json?raw";
import v2Text from "./fixtures/b-v2-bottle-photo-cap-scan-price.json?raw";
import invalidText from "./fixtures/c-invalid-pack.json?raw";
import { capPackNotices, formatPackNotice, type PackNotice } from "./notices.ts";
import { bdi, FIELD_LABEL, ltr } from "./fieldText.ts";
import { duplicateSlugIssues, issuesForDraft, KIND_DEFAULT_MM, MAX_PACK_BYTES } from "./packValidate.ts";
import { codeSlug, importedMeta, isVariantPart, partFromDraft, syncRegistry, type SupplierPack, type SupplierPart } from "./registry.ts";
import { adoptLoadedSuppliers, downloadPack, exportPackDocument, parsePackFile, reviveStoredPack, serializePack } from "./supplierDb.ts";
import { sanitizeSupplierPrice } from "../model/price.ts";
import { applyVariant, createDefaultDesign } from "../model/design.ts";
import { mergeShareDesign } from "../model/share.ts";
import { boxById, capById, listFor } from "../model/catalog.ts";
import { computeFit } from "../model/fit.ts";
import { neckRadius } from "../model/necks.ts";
import type { NeckId } from "../model/types.ts";

const validateSupplierPack = (() => {
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  return ajv.compile(JSON.parse(schemaText) as object);
})();

function schemaErrors(text: string): string {
  const data: unknown = JSON.parse(text);
  return validateSupplierPack(data) ? "" : JSON.stringify(validateSupplierPack.errors);
}

function exportLoose(pack: object) {
  return exportPackDocument(pack as SupplierPack);
}

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
    const capPrice = raw.parts[1]?.price as { moq: number; tiers: Array<{ minQty: number }> };
    expect(capPrice.tiers.every((tier) => tier.minQty > capPrice.moq)).toBe(true);
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
    ]);
    expect(result.warnings[0]).toMatchObject({ severity: "warning" });
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
        severity: "warning",
      }),
    ]);
    expect(formatPackNotice("he", result.warnings[0])).toContain(FIELD_LABEL.he.moq);
    expect(formatPackNotice("he", result.warnings[0])).toContain(`מדרגה ${ltr(1)}`);
    expect(formatPackNotice("en", result.warnings[0])).toContain(FIELD_LABEL.en.moq);
    expect(formatPackNotice("en", result.warnings[0])).toContain(ltr("CAP-1"));
  });

  it("rejects the invalid sample pack with a Hebrew error", () => {
    const result = parsePackFile(invalidText);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.he).toContain("נדחה");
    expect(result.error.he).toContain("lid");
    expect(result.error.he).toContain("לא יהפוך לקופסה");
    expect(result.error.he).toContain("FEA16");
    expect(result.error.he).toContain("רוחב");
    expect(result.error.he).toContain("#rrggbb");
    expect(result.error.en).toContain("will not become a box");
  });

  it("rejects an unknown kind, an unsupported neck, a negative millimetre, and a bad colour on their own", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ kind: "lid" }, "lid"],
      [{ neck: "FEA16" }, "FEA16"],
      [{ widthMm: -3 }, "רוחב"],
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
      parts: [base, { ...base, id: "bad", code: "BAD", name: "", kind: "lid" }],
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
      name: "",
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
    if (!source.ok) {
      expect(source.error.en).toContain(ltr("pdf"));
      expect(source.error.en).toContain(ltr("photo"));
      expect(source.error.en).toContain(ltr("scan"));
      expect(source.error.en).toContain(ltr("manual"));
    }
    const supplier = parsePackFile(asText({ supplier: "Gulf" }));
    expect(supplier.ok).toBe(false);
    if (!supplier.ok) expect(supplier.error.en).toContain("Supplier must be an object");
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
    if (!tall.ok) {
      expect(tall.error.en).toContain("Height must be between");
      expect(tall.error.en).toContain("\u206810\u2069");
      expect(tall.error.en).toContain("\u206878\u2069");
    }

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
    expect(sanitizeSupplierPrice({ value: 1, currency: "usd" }).price).toEqual({ value: 1, currency: "USD" });
    const duplicate = sanitizeSupplierPrice({ value: 1, currency: "USD", tiers: [{ minQty: 5, value: 1 }, { minQty: 5, value: 0.9 }] });
    expect(duplicate.price?.tiers).toEqual([{ minQty: 5, value: 1 }]);
    expect(duplicate.issues.map((item) => item.code)).toEqual(["tier_not_ascending"]);
    const dated = sanitizeSupplierPrice({ value: 1, currency: "USD", quotedAt: "2026-02-31" });
    expect(dated.price).toEqual({ value: 1, currency: "USD" });
    expect(dated.issues.map((item) => item.code)).toEqual(["price_quoted_at"]);
    const extra = sanitizeSupplierPrice({ value: 1, currency: "USD", extra: true });
    expect(extra.price).toEqual({ value: 1, currency: "USD" });
    expect(extra.unpriced).toBeUndefined();
    expect(extra.issues.map((item) => item.code)).toEqual(["price_unknown_field"]);
  });
});

describe("loaded supplier packs", () => {
  it("adopts { packs, warnings } only when the lab has no suppliers yet", () => {
    const warning = { type: "droppedPack" as const };
    expect(adoptLoadedSuppliers({ packs: [], warnings: [warning] }, 0)).toBe(true);
    expect(adoptLoadedSuppliers({ packs: [{ id: "sup" }], warnings: [] }, 0)).toBe(true);
    expect(adoptLoadedSuppliers({ packs: [], warnings: [] }, 0)).toBe(false);
    expect(adoptLoadedSuppliers({ packs: [{ id: "sup" }], warnings: [warning] }, 1)).toBe(false);

    const parsed = parsePackFile(minimalText);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(adoptLoadedSuppliers({ packs: [parsed.pack], warnings: parsed.warnings }, 0)).toBe(true);
  });
});

describe("capPackNotices", () => {
  it("shows the first 20 warnings and one more-line", () => {
    const notices: PackNotice[] = Array.from({ length: 25 }, (_, index) => ({
      type: "droppedPart",
      ref: `P${index}`,
    }));
    const lines = capPackNotices(notices, "en");
    expect(lines).toHaveLength(21);
    expect(lines[0]).toContain("P0");
    expect(lines[19]).toContain("P19");
    expect(lines[20]).toBe("+5 more");
    expect(capPackNotices(notices, "he")[20]).toBe("ועוד 5");
    expect(capPackNotices(notices.slice(0, 3), "en")).toHaveLength(3);
  });
});

describe("syncRegistry and selection", () => {
  afterEach(() => syncRegistry([]));

  it("keeps imported supplier ids in the catalog a share link checks", () => {
    syncRegistry([{
      id: "sup",
      name: "Share Glass",
      createdAt: 1,
      parts: [
        { ...base, id: "supplier-flask", code: "B1", kind: "bottle" },
        { ...base, id: "supplier-cap", code: "C1", kind: "cap" },
        { ...base, id: "lid-1", code: "L1", kind: "lid" as SupplierPart["kind"] },
      ],
    }]);
    const decoded = mergeShareDesign({
      bottle: { variantId: "supplier-flask" },
      cap: { variantId: "supplier-cap" },
      box: { variantId: "lid-1" },
    });
    expect(decoded?.bottle.variantId).toBe("supplier-flask");
    expect(decoded?.cap.variantId).toBe("supplier-cap");
    expect(decoded?.box.variantId).toBe(createDefaultDesign().box.variantId);
    expect(listFor("bottle").some((entry) => entry.id === "supplier-flask")).toBe(true);
    expect(listFor("box").some((entry) => entry.id === "lid-1")).toBe(false);
  });

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
    expect(formatPackNotice("en", revived.warnings[0])).toContain("lid");
    const notices = syncRegistry(revived.pack ? [revived.pack] : []);
    expect(notices).toEqual([]);
    expect(() => computeFit(createDefaultDesign())).not.toThrow();
  });

  it("keeps a stored price when only the currency is unrecognized", () => {
    const revived = reviveStoredPack({
      id: "sup-old",
      name: "Stored",
      createdAt: 4,
      version: "2",
      source: "scan",
      parts: [{ ...base, price: { value: 1, currency: "usd1" } }],
    });
    expect(revived.pack?.version).toBeUndefined();
    expect(revived.pack?.source).toBe("scan");
    expect(revived.pack?.parts).toHaveLength(1);
    expect((revived.pack?.parts[0] as { price?: { value: number; currency?: string; currencyText?: string } }).price).toEqual({ value: 1, currencyText: "usd1" });
    expect((revived.pack?.parts[0] as { price?: { unpriced?: boolean } }).price).not.toHaveProperty("unpriced");
    expect(revived.warnings).toEqual([
      { type: "droppedMeta", field: "version" },
      expect.objectContaining({
        type: "priceIssue",
        ref: "CAP-1",
        path: "currency",
        code: "price_currency",
      }),
    ]);
    expect(formatPackNotice("he", revived.warnings[1])).toContain("מטבע לא ידוע");
    expect(formatPackNotice("he", revived.warnings[1])).toContain("usd1");
    expect(formatPackNotice("en", revived.warnings[1])).toContain("Unknown currency");
    expect(formatPackNotice("en", revived.warnings[1])).toContain("usd1");
  });

  it("builds a valid lab row, exports only schema fields, and imports that export", () => {
    const built = {
      id: "sup-lab",
      name: "Lab Supplier",
      createdAt: 20,
      generator: { name: "Perfume Studio", extra: true },
      hiddenParts: [{ id: "hidden", code: "H", name: "Hidden", he: "מוסתר", en: "hidden" }],
      parts: [{
        ...base,
        id: "sup-lab-cap",
        code: "CAP-A",
        name: "CAP-A · Lab Supplier",
        widthMm: KIND_DEFAULT_MM.cap.widthMm,
        heightMm: KIND_DEFAULT_MM.cap.heightMm,
        depthMm: KIND_DEFAULT_MM.cap.depthMm,
        note: "scratch",
        price: { value: 1.25, currency: "usd", extra: true },
      }],
    };
    expect(issuesForDraft({
      id: "manual-1",
      kind: "cap",
      code: "CAP-A",
      neck: "FEA15",
      ...KIND_DEFAULT_MM.cap,
      capacityMl: null,
      profile: "cylinder",
      page: 1,
    })).toEqual([]);
    const shortBottle = issuesForDraft({
      id: "manual-2",
      kind: "bottle",
      code: "B",
      neck: "FEA15",
      widthMm: 30,
      heightMm: 32,
      depthMm: 30,
      capacityMl: null,
      profile: "bottle",
      page: 1,
    });
    expect(shortBottle.find((item) => item.field === "heightMm")).toEqual({
      field: "heightMm",
      he: `גובה חייב להיות בין ${bdi(48)} ל־${bdi(180)} מ״מ`,
      en: `Height must be between ${bdi(48)} and ${bdi(180)} mm`,
    });
    expect(shortBottle.find((item) => item.field === "heightMm")?.he.startsWith("החלק")).toBe(false);
    expect(issuesForDraft({
      id: "manual-3",
      kind: "cap",
      code: "",
      neck: "FEA15",
      ...KIND_DEFAULT_MM.cap,
      capacityMl: null,
      profile: "cylinder",
    }).some((item) => item.field === "code")).toBe(true);

    const exported = exportPackDocument(built);
    expect(exported.warnings.map((notice) => notice.type)).toEqual(["droppedPart"]);
    const document = JSON.parse(exported.text) as { generator?: unknown; hiddenParts?: unknown; parts: Array<{ note?: unknown; price?: unknown }> };
    expect(document.generator).toEqual({ name: "Perfume Studio" });
    expect(document.hiddenParts).toBeUndefined();
    expect(document.parts[0].note).toBeUndefined();
    expect(document.parts[0].price).toEqual({ value: 1.25, currency: "USD" });
    const again = parsePackFile(exported.text);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.warnings).toEqual([]);
    expect(again.pack.parts[0]).toMatchObject({ id: "sup-lab-cap", kind: "cap", widthMm: 30, heightMm: 32, depthMm: 30 });

    const unpriced = exportPackDocument({
      ...built,
      parts: [{ ...built.parts[0], price: { value: 2, currency: "dollar" } }],
    });
    expect(JSON.parse(unpriced.text).parts[0].price).toBeUndefined();
    expect(unpriced.warnings[0]).toMatchObject({
      type: "priceIssue",
      en: expect.stringContaining("dollar"),
      he: expect.stringContaining("dollar"),
    });
    const reimported = parsePackFile(unpriced.text);
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    expect(reimported.pack.parts[0]).not.toHaveProperty("price");
  });

  it("validates lab exports against the shared supplier-pack schema", () => {
    const roundTrip = exportLoose({
      id: "sup-lab",
      name: "Lab Supplier",
      createdAt: 20,
      version: 2,
      source: "manual",
      generator: { name: "Perfume Studio", version: "1.0.0" },
      parts: [{
        ...base,
        id: "sup-lab-cap",
        code: "CAP-A",
        name: "CAP-A · Lab Supplier",
        widthMm: KIND_DEFAULT_MM.cap.widthMm,
        heightMm: KIND_DEFAULT_MM.cap.heightMm,
        depthMm: KIND_DEFAULT_MM.cap.depthMm,
        price: { value: 1.25, currency: "usd", moq: 100, quotedAt: "2026-10-06T11:42:00Z" },
      }],
    });
    expect(roundTrip.warnings).toEqual([]);
    expect(schemaErrors(roundTrip.text)).toBe("");
    const imported = parsePackFile(roundTrip.text);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const again = exportPackDocument(imported.pack);
    expect(again.warnings).toEqual([]);
    expect(schemaErrors(again.text)).toBe("");
    expect(JSON.parse(again.text).parts[0].price).toEqual({
      value: 1.25,
      currency: "USD",
      moq: 100,
      quotedAt: "2026-10-06",
    });

    const unknownCurrency = exportLoose({
      id: "sup-lab",
      name: "Lab Supplier",
      createdAt: 20,
      parts: [{ ...base, price: { value: 2, currency: "dollar" } }],
    });
    expect(JSON.parse(unknownCurrency.text).parts[0].price).toBeUndefined();
    expect(unknownCurrency.warnings[0]).toMatchObject({
      type: "priceIssue",
      en: expect.stringContaining("dollar"),
    });
    expect(schemaErrors(unknownCurrency.text)).toBe("");

    const unknownKeys = exportLoose({
      id: "sup-lab",
      name: "Lab Supplier",
      createdAt: 20,
      scratch: true,
      generator: { name: "Perfume Studio", extra: true },
      supplier: { company: "Lab", secret: "no" },
      parts: [{
        ...base,
        note: "scratch",
        appearance: { finish: "gold" },
        names: { he: "פקק", en: "Cap", extra: true },
        price: { value: 1.25, currency: "USD", extra: true, currencyText: "USD" },
        scan: {
          method: "manual",
          capturedAt: "2026-10-06T10:15:00Z",
          extra: true,
          neckSuggestion: { confirmedByUser: true, verifiedBySupplier: false },
        },
      }],
    });
    expect(unknownKeys.warnings).toEqual([]);
    expect(schemaErrors(unknownKeys.text)).toBe("");
    const cleaned = JSON.parse(unknownKeys.text) as {
      scratch?: unknown;
      generator: { name: string; extra?: unknown };
      supplier: { company: string; secret?: unknown };
      parts: Array<{ note?: unknown; appearance?: unknown; names: { extra?: unknown }; price: { extra?: unknown; currencyText?: unknown }; scan: { extra?: unknown; neckSuggestion: { verifiedBySupplier?: unknown } } }>;
    };
    expect(cleaned.scratch).toBeUndefined();
    expect(cleaned.generator).toEqual({ name: "Perfume Studio" });
    expect(cleaned.supplier).toEqual({ company: "Lab" });
    expect(cleaned.parts[0].note).toBeUndefined();
    expect(cleaned.parts[0].appearance).toBeUndefined();
    expect(cleaned.parts[0].names).toEqual({ he: "פקק", en: "Cap" });
    expect(cleaned.parts[0].price).toEqual({ value: 1.25, currency: "USD" });
    expect(cleaned.parts[0].scan.extra).toBeUndefined();
    expect(cleaned.parts[0].scan.neckSuggestion.verifiedBySupplier).toBeUndefined();
  });

  it("does not mutate the record it reads", () => {
    const raw = { id: "main-era", name: "Old", createdAt: 1, parts: [{ id: "only", kind: "cap" }] };
    const before = structuredClone(raw);
    const revived = reviveStoredPack(raw);
    expect(raw).toEqual(before);
    expect(revived.pack?.parts).toEqual([]);
    expect(revived.pack?.hiddenParts?.[0].en).toContain("Missing");
  });

  it("hides a stored value that is not a pack", () => {
    expect(reviveStoredPack(null).warnings).toEqual([{ type: "droppedPack" }]);
    expect(reviveStoredPack(null).pack).toBeNull();
  });

  it("keeps a pack-level failure visible so it can be deleted", () => {
    const revived = reviveStoredPack({ id: "broken-pack", name: "Broken", createdAt: 4, parts: "nope" });
    expect(revived.pack).toMatchObject({ id: "broken-pack", name: "Broken", parts: [] });
    expect(revived.pack?.hiddenParts?.[0].en.length).toBeGreaterThan(0);
    expect(revived.warnings).toEqual([{ type: "droppedPack" }]);
  });

  it("flags two draft codes that slug to the same part id", () => {
    expect(codeSlug("A-1")).toBe(codeSlug("a 1"));
    const supplier = { id: "sup-lab", name: "Lab" };
    const draft = {
      id: "row",
      page: 1,
      kind: "cap" as const,
      neck: "FEA15" as const,
      widthMm: 30,
      heightMm: 32,
      depthMm: 30,
      capacityMl: null,
      profile: "cylinder" as const,
      crop: { x: 0, y: 0, w: 1, h: 1 },
      confidence: 0.2,
      manual: true,
    };
    const first = partFromDraft({ ...draft, code: "A-1" }, supplier, 0);
    const second = partFromDraft({ ...draft, code: "a 1" }, supplier, 1);
    expect(first.id).toBe(second.id);
    const rows = [
      { id: "row-1", code: "A-1", kind: "cap" },
      { id: "row-2", code: "a 1", kind: "cap" },
    ];
    const issue = duplicateSlugIssues(rows[0], rows)[0];
    expect(issue.field).toBe("code");
    expect(issue.he).toBe(`הקוד ${ltr("A-1")} מתנגש עם ${ltr("a 1")} (שורה ${ltr(2)}).`);
    expect(issue.en).toBe(`Code ${ltr("A-1")} clashes with ${ltr("a 1")} (row ${ltr(2)}).`);
    expect(duplicateSlugIssues(rows[1], rows)[0].he).toContain(ltr("A-1"));
    expect(duplicateSlugIssues(rows[0], [rows[0]])).toEqual([]);
  });

  it("formats price and pack notices without a part prefix", () => {
    const neck = formatPackNotice("he", { type: "badNeck", ref: "N 1", neck: "FEA16" });
    expect(neck.startsWith(ltr("N 1"))).toBe(true);
    expect(neck).toContain("·");
    expect(neck.startsWith("החלק")).toBe(false);
    expect(neck).toContain(ltr("FEA16"));
    expect(neck).toContain(ltr("FEA13"));
    expect(neck).toContain(ltr("FEA20"));
    const neckEn = formatPackNotice("en", { type: "badNeck", ref: "N 1", neck: "FEA16" });
    expect(neckEn.startsWith("Part")).toBe(false);
    expect(neckEn).toContain(ltr("FEA20"));
    const dropped = formatPackNotice("he", { type: "droppedPart", ref: "A 1" });
    expect(dropped.startsWith(ltr("A 1"))).toBe(true);
    expect(dropped.startsWith("החלק")).toBe(false);
    expect(formatPackNotice("en", { type: "droppedPart", ref: "A 1" }).startsWith("Part")).toBe(false);
    expect(formatPackNotice("he", { type: "droppedMeta", field: "createdAt" })).toBe(
      "השדה תאריך יצירה הוסר מהחבילה כי אינו בפורמט הנדרש.",
    );
    expect(formatPackNotice("en", { type: "droppedMeta", field: "createdAt" })).toContain("Created date");
    expect(formatPackNotice("he", { type: "droppedMeta", field: "version" })).toContain("גרסה");
    expect(formatPackNotice("en", { type: "droppedMeta", field: "version" })).not.toContain("{field}");
    expect(formatPackNotice("en", { type: "unknownKind", ref: "X1", kind: "lid" }).startsWith(ltr("X1"))).toBe(true);
    expect(formatPackNotice("he", { type: "droppedField", ref: "C 1", field: "mesh" })).toContain(FIELD_LABEL.he.mesh);
    expect(formatPackNotice("en", { type: "droppedField", ref: "C 1", field: "mesh" })).toContain(FIELD_LABEL.en.mesh);
    expect(formatPackNotice("he", { type: "droppedField", ref: "C 1", field: "scan" })).toContain(FIELD_LABEL.he.scan);
    expect(formatPackNotice("en", { type: "droppedField", ref: "C 1", field: "scan" })).toContain("Scan");
    expect(formatPackNotice("he", { type: "droppedField", ref: "C 1", field: "measurements" })).toContain(FIELD_LABEL.he.measurements);
    expect(formatPackNotice("en", { type: "droppedField", ref: "C 1", field: "measurements" })).toContain("Measurements");
    expect(formatPackNotice("he", { type: "droppedField", ref: "C 1", field: "mesh" })).not.toContain("mesh");
  });

  it("does not list an unreadable pack as a dropped part", () => {
    const revived = reviveStoredPack({ id: "broken-pack", name: "Broken", createdAt: 4, parts: "nope" });
    expect(revived.pack?.unreadable).toBe(true);
    const exported = exportPackDocument(revived.pack!);
    expect(exported.text).toBe("");
    expect(exported.warnings).toEqual([{ type: "unreadableExport" }]);
    expect(downloadPack(revived.pack!)).toEqual([{ type: "unreadableExport" }]);
    expect(formatPackNotice("he", exported.warnings[0])).toContain("לא יוצאה");
    expect(formatPackNotice("en", exported.warnings[0])).toContain("not exported");
  });

  it("reports a bad envelope field by its key", () => {
    const revived = reviveStoredPack({
      id: "meta",
      name: "Meta",
      createdAt: "yesterday",
      version: "2",
      source: "email",
      supplier: "Gulf",
      parts: [base],
    });
    expect(revived.warnings.filter((notice) => notice.type === "droppedMeta")).toEqual([
      { type: "droppedMeta", field: "createdAt" },
      { type: "droppedMeta", field: "version" },
      { type: "droppedMeta", field: "source" },
      { type: "droppedMeta", field: "supplier" },
    ]);
  });

  it("warns that hidden parts were left out of an export", () => {
    const hidden = {
      id: "qa-bottle",
      code: "B30",
      name: "Short bottle",
      he: "גובה חייב להיות בין 48 ל־180 מ״מ",
      en: "Height must be between 48 and 180 mm",
    };
    const exported = exportLoose({
      id: "sup-lab",
      name: "Lab Supplier",
      createdAt: 20,
      parts: [base],
      hiddenParts: [hidden],
    });
    expect(JSON.parse(exported.text).parts).toHaveLength(1);
    expect(JSON.parse(exported.text).hiddenParts).toBeUndefined();
    expect(exported.warnings).toHaveLength(1);
    expect(exported.warnings[0]).toMatchObject({ type: "droppedPart", ref: "B30" });
    expect(exported.warnings[0].type === "droppedPart" && exported.warnings[0].he).toContain("Short bottle");
    expect(exported.warnings[0].type === "droppedPart" && exported.warnings[0].he).toContain("גובה");
    const many = exportLoose({
      id: "sup-lab",
      name: "Lab Supplier",
      createdAt: 20,
      parts: [base],
      hiddenParts: Array.from({ length: 9 }, (_, index) => ({ ...hidden, id: `h-${index}` })),
    });
    expect(many.warnings).toHaveLength(1);
    expect(many.warnings[0].type === "droppedPart" && many.warnings[0].en).toContain("9");
  });
});
