import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("dompurify", () => ({
  default: { sanitize: (value: string) => value },
}));

import { capPriceWarnings, normalizeStoredPack } from "./packPrice.ts";
import { importedPrice, syncRegistry } from "./registry.ts";
import { parsePackFile } from "./supplierDb.ts";
import { factsById } from "../budget/descriptors.ts";
import { resolvePartPrice, summarizeBudget } from "../budget/money.ts";

const basePart = {
  id: "aurora-cap",
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

function read(text: string) {
  const result = parsePackFile(text);
  expect(result).toBeTruthy();
  return result!;
}

describe("parsePackFile prices", () => {
  afterEach(() => syncRegistry([]));

  it("imports an old pack that has no price field", () => {
    const parsed = read(JSON.stringify({
      name: "Legacy",
      parts: [{ id: "legacy-cap", kind: "cap", name: "Old cap", code: "OLD" }],
    }));
    expect(parsed.warnings).toEqual([]);
    expect(parsed.pack.version).toBeUndefined();
    expect(parsed.pack.parts).toHaveLength(1);
    expect(parsed.pack.parts[0].price).toBeUndefined();
    expect(parsed.pack.parts[0].name).toBe("Old cap");
    syncRegistry([parsed.pack]);
    expect(importedPrice("legacy-cap")).toBeUndefined();
  });

  it("keeps breaks in the written order and drops a later break that is not higher", () => {
    const parsed = read(JSON.stringify({
      id: "aurora",
      name: "Aurora",
      createdAt: 10,
      parts: [{
        ...basePart,
        price: {
          value: 4.5,
          currency: "usd",
          moq: 5000,
          tiers: [
            { minQty: 10000, value: 4.2 },
            { minQty: 20000, value: 3.9 },
          ],
          quotedAt: "2026-09-01",
        },
      }],
    }));
    expect(parsed.warnings).toEqual([]);
    expect(parsed.pack.parts[0].price).toEqual({
      value: 4.5,
      currency: "USD",
      moq: 5000,
      tiers: [
        { minQty: 10000, value: 4.2 },
        { minQty: 20000, value: 3.9 },
      ],
      quotedAt: "2026-09-01",
    });
    syncRegistry([parsed.pack]);
    expect(importedPrice("aurora-cap")).toMatchObject({ value: 4.5, currency: "USD", moq: 5000, quotedAt: "2026-09-01" });

    const reversed = read(JSON.stringify({
      name: "Aurora",
      parts: [{
        ...basePart,
        price: {
          value: 4.5,
          currency: "USD",
          moq: 5000,
          tiers: [
            { minQty: 20000, value: 3.9 },
            { minQty: 10000, value: 4.2 },
          ],
        },
      }],
    }));
    expect(reversed.pack.parts[0].price?.tiers).toEqual([{ minQty: 20000, value: 3.9 }]);
    expect(reversed.warnings).toEqual([{ partId: "aurora-cap", reason: "tierDropped" }]);
  });

  it("reads a legacy qty break as minQty only when minQty is absent", () => {
    const parsed = read(JSON.stringify({
      name: "Legacy tiers",
      parts: [
        { ...basePart, id: "from-qty", price: { value: 4, currency: "ILS", tiers: [{ qty: 10, value: 3 }, { qty: 2, value: 3.5 }] } },
        { ...basePart, id: "min-wins", price: { value: 4, currency: "ILS", tiers: [{ minQty: 5, qty: 9, value: 2 }] } },
        { ...basePart, id: "bad-min", price: { value: 4, currency: "ILS", tiers: [{ minQty: "5", qty: 10, value: 3 }] } },
      ],
    }));
    expect(parsed.pack.parts[0].price?.tiers).toEqual([{ minQty: 10, value: 3 }]);
    expect(parsed.pack.parts[1].price?.tiers).toEqual([{ minQty: 5, value: 2 }]);
    expect(parsed.pack.parts[2].price).toEqual({ value: 4, currency: "ILS" });
    expect(parsed.warnings).toEqual([
      { partId: "from-qty", reason: "tierDropped" },
      { partId: "bad-min", reason: "tierDropped" },
    ]);
    syncRegistry([parsed.pack]);
    expect(importedPrice("from-qty")?.tiers).toEqual([{ minQty: 10, value: 3 }]);
    expect(JSON.stringify(parsed.pack)).not.toContain('"qty"');
  });

  it("stores shekel and dollar aliases as ILS and USD", () => {
    const parsed = read(JSON.stringify({
      name: "Aliases",
      parts: [
        { ...basePart, id: "shekel", price: { value: 5, currency: "₪" } },
        { ...basePart, id: "nis", price: { value: 5, currency: "NIS" } },
        { ...basePart, id: "shekel-word", price: { value: 5, currency: "ש״ח" } },
        { ...basePart, id: "ils", price: { value: 5, currency: "ils" } },
        { ...basePart, id: "usd", price: { value: 5, currency: "usd" } },
        { ...basePart, id: "dollar-sign", price: { value: 5, currency: "$" } },
      ],
    }));
    expect(parsed.warnings).toEqual([]);
    for (const id of ["shekel", "nis", "shekel-word", "ils"]) {
      expect(parsed.pack.parts.find((part) => part.id === id)?.price).toEqual({ value: 5, currency: "ILS" });
    }
    for (const id of ["usd", "dollar-sign"]) {
      expect(parsed.pack.parts.find((part) => part.id === id)?.price).toEqual({ value: 5, currency: "USD" });
    }
    const blank = read(JSON.stringify({
      name: "Blank",
      parts: [{ ...basePart, id: "blank", price: { value: 4, currency: "" } }],
    }));
    expect(blank.pack.parts[0].price).toBeUndefined();
    expect(blank.warnings).toEqual([{ partId: "blank", reason: "currency" }]);
  });

  it("drops an invalid base price, and drops only the bad tier", () => {
    const parsed = read(JSON.stringify({
      name: "Mixed",
      parts: [
        { ...basePart, id: "text", price: { value: "4", currency: "USD" } },
        { ...basePart, id: "zero", price: { value: 0, currency: "ILS" } },
        { ...basePart, id: "words", price: { value: 4, currency: "dollar" } },
        { ...basePart, id: "fraction-moq", price: { value: 4, currency: "AED", moq: 1.5 } },
        { ...basePart, id: "zero-tier", price: { value: 4, currency: "ILS", tiers: [{ minQty: 2, value: 0 }] } },
        { ...basePart, id: "low-qty", price: { value: 4, currency: "ILS", tiers: [{ minQty: 0, value: 3 }] } },
        { ...basePart, id: "stale", price: { value: 4, currency: "ILS", quotedAt: "yesterday" } },
        { ...basePart, id: "good", price: { value: 12, currency: "ILS", moq: 100, tiers: [{ minQty: 1, value: 11 }, { minQty: 100, value: 9 }] } },
      ],
    }));
    expect(parsed.pack.parts.map((part) => part.id)).toEqual(["text", "zero", "words", "fraction-moq", "zero-tier", "low-qty", "stale", "good"]);
    expect(parsed.pack.parts[0].price).toBeUndefined();
    expect(parsed.pack.parts[1].price).toBeUndefined();
    expect(parsed.pack.parts[2].price).toEqual({ value: 4, currency: "dollar" });
    expect(parsed.pack.parts[3].price).toBeUndefined();
    expect(parsed.pack.parts[4].price).toEqual({ value: 4, currency: "ILS" });
    expect(parsed.pack.parts[5].price).toEqual({ value: 4, currency: "ILS" });
    expect(parsed.pack.parts[6].price).toBeUndefined();
    expect(parsed.pack.parts[7].price).toEqual({ value: 12, currency: "ILS", moq: 100 });
    expect(parsed.warnings).toEqual([
      { partId: "text", reason: "value" },
      { partId: "zero", reason: "value" },
      { partId: "fraction-moq", reason: "moq" },
      { partId: "zero-tier", reason: "tierDropped" },
      { partId: "low-qty", reason: "tierDropped" },
      { partId: "stale", reason: "quotedAt" },
      { partId: "good", reason: "tierDropped" },
      { partId: "good", reason: "tierDropped" },
    ]);
  });

  it("drops a break that is not above moq or the previous break, and keeps a more expensive one", () => {
    const parsed = read(JSON.stringify({
      name: "Breaks",
      parts: [{
        ...basePart,
        id: "breaks",
        price: {
          value: 10,
          currency: "ILS",
          moq: 100,
          tiers: [
            { minQty: 100, value: 9 },
            { minQty: 500, value: 8 },
            { minQty: 500, value: 7 },
            { minQty: 1000, value: 8.5 },
          ],
        },
      }],
    }));
    expect(parsed.pack.parts[0].price).toEqual({
      value: 10,
      currency: "ILS",
      moq: 100,
      tiers: [
        { minQty: 500, value: 8 },
        { minQty: 1000, value: 8.5 },
      ],
    });
    expect(parsed.warnings).toEqual([
      { partId: "breaks", reason: "tierDropped" },
      { partId: "breaks", reason: "tierDropped" },
      { partId: "breaks", reason: "tierRose" },
    ]);
    syncRegistry([parsed.pack]);
    expect(importedPrice("breaks")?.tiers).toEqual([
      { minQty: 500, value: 8 },
      { minQty: 1000, value: 8.5 },
    ]);
  });

  it("rewrites a stored legacy qty break to minQty so a re-export does not write qty", () => {
    const normalized = normalizeStoredPack({
      id: "old",
      name: "Old",
      createdAt: 1,
      parts: [{ ...basePart, id: "stored", price: { value: 4, currency: "ils", tiers: [{ qty: 10, value: 3 }] } }],
    });
    expect(normalized.changed).toBe(true);
    expect(normalized.pack.parts[0].price).toEqual({
      value: 4,
      currency: "ILS",
      tiers: [{ minQty: 10, value: 3 }],
    });
    expect(JSON.stringify(normalized.pack)).not.toContain('"qty"');
    expect(capPriceWarnings([1, 2, 3], (hidden) => hidden, 2)).toEqual([1, 2, 1]);
  });

  it("does not mark a pack changed when a warning leaves the stored price as it was", () => {
    const price = { value: 4, currency: "ILS", tiers: [{ minQty: 10, value: 5 }] };
    const kept = normalizeStoredPack({
      id: "rose-pack",
      name: "Rose",
      createdAt: 1,
      parts: [{ ...basePart, id: "rose", price }],
    });
    expect(kept.warnings).toEqual([{ partId: "rose", reason: "tierRose" }]);
    expect(kept.changed).toBe(false);
    expect(kept.pack.parts[0].price).toEqual(price);

    const first = normalizeStoredPack({
      id: "drop-pack",
      name: "Drop",
      createdAt: 1,
      parts: [{ ...basePart, id: "low", price: { value: 4, currency: "ILS", tiers: [{ minQty: 1, value: 3 }] } }],
    });
    expect(first.changed).toBe(true);
    const second = normalizeStoredPack(first.pack);
    expect(second.changed).toBe(false);
    expect(second.warnings).toEqual([]);
  });

  it("does not invent a price for a pack part with no price or a dropped price", () => {
    const missing = read(JSON.stringify({
      name: "No price",
      parts: [{ ...basePart, id: "pack-missing" }],
    }));
    const dropped = read(JSON.stringify({
      name: "Bad price",
      parts: [{ ...basePart, id: "pack-dropped", price: { value: 0, currency: "ILS" } }],
    }));
    expect(dropped.warnings).toEqual([{ partId: "pack-dropped", reason: "value" }]);
    expect(dropped.pack.parts[0].price).toBeUndefined();
    syncRegistry([missing.pack, dropped.pack]);

    const missingFacts = factsById("cap", "pack-missing");
    const droppedFacts = factsById("cap", "pack-dropped");
    const builtin = factsById("cap", "cap-cyl-32");
    expect(missingFacts?.fromPack).toBe(true);
    expect(droppedFacts?.fromPack).toBe(true);
    expect(builtin?.fromPack).toBe(false);
    expect(resolvePartPrice(missingFacts!, importedPrice("pack-missing"), undefined, {})).toBeNull();
    expect(resolvePartPrice(droppedFacts!, importedPrice("pack-dropped"), undefined, {})).toBeNull();
    const example = resolvePartPrice(builtin!, undefined, undefined, {});
    expect(example?.source).toBe("example");
    const summary = summarizeBudget(["unpriced", "unpriced", example!.ils], 100);
    expect(summary.unpricedCount).toBe(2);
    expect(summary.totalIls).toBe(example!.ils);
  });

  it("keeps unknown pack fields so a later version can ride along", () => {
    const parsed = read(JSON.stringify({
      name: "Scan",
      version: 2,
      source: "scan",
      parts: [{ ...basePart, measurements: [{ name: "height", mm: 32 }] }],
    }));
    expect(parsed.pack.version).toBe(2);
    expect((parsed.pack as { source?: string }).source).toBe("scan");
    expect((parsed.pack.parts[0] as { measurements?: unknown[] }).measurements).toEqual([{ name: "height", mm: 32 }]);
    expect(parsed.pack.parts[0].price).toBeUndefined();
    expect(parsed.warnings).toEqual([]);
  });
});
