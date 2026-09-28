import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("dompurify", () => ({
  default: { sanitize: (value: string) => value },
}));

import { importedPrice, syncRegistry } from "./registry.ts";
import { consumePriceWarnings, parsePackFile } from "./supplierDb.ts";

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

describe("parsePackFile prices", () => {
  afterEach(() => syncRegistry([]));

  it("imports an old pack that has no price field", () => {
    const pack = parsePackFile(JSON.stringify({
      name: "Legacy",
      parts: [{ id: "legacy-cap", kind: "cap", name: "Old cap", code: "OLD" }],
    }));
    expect(pack).toBeTruthy();
    expect(consumePriceWarnings()).toEqual([]);
    expect(pack!.version).toBeUndefined();
    expect(pack!.parts).toHaveLength(1);
    expect(pack!.parts[0].price).toBeUndefined();
    expect(pack!.parts[0].name).toBe("Old cap");
    syncRegistry([pack!]);
    expect(importedPrice("legacy-cap")).toBeUndefined();
  });

  it("keeps a valid price, sorts extra breaks, and registers the quote date", () => {
    const pack = parsePackFile(JSON.stringify({
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
            { minQty: 20000, value: 3.9 },
            { minQty: 10000, value: 4.2 },
          ],
          quotedAt: "2026-09-01",
        },
      }],
    }));
    expect(consumePriceWarnings()).toEqual([]);
    expect(pack!.parts[0].price).toEqual({
      value: 4.5,
      currency: "USD",
      moq: 5000,
      tiers: [
        { minQty: 10000, value: 4.2 },
        { minQty: 20000, value: 3.9 },
      ],
      quotedAt: "2026-09-01",
    });
    syncRegistry([pack!]);
    expect(importedPrice("aurora-cap")).toMatchObject({ value: 4.5, currency: "USD", moq: 5000, quotedAt: "2026-09-01" });
  });

  it("reads a legacy qty break as minQty when minQty is absent", () => {
    const pack = parsePackFile(JSON.stringify({
      name: "Legacy tiers",
      parts: [
        { ...basePart, id: "from-qty", price: { value: 4, currency: "ILS", tiers: [{ qty: 10, value: 3 }, { qty: 2, value: 3.5 }] } },
        { ...basePart, id: "min-wins", price: { value: 4, currency: "ILS", tiers: [{ minQty: 5, qty: 9, value: 2 }] } },
      ],
    }));
    expect(consumePriceWarnings()).toEqual([]);
    expect(pack!.parts[0].price?.tiers).toEqual([{ minQty: 2, value: 3.5 }, { minQty: 10, value: 3 }]);
    expect(pack!.parts[1].price?.tiers).toEqual([{ minQty: 5, value: 2 }]);
    syncRegistry([pack!]);
    expect(importedPrice("from-qty")?.tiers).toEqual([{ minQty: 2, value: 3.5 }, { minQty: 10, value: 3 }]);
  });

  it("drops an invalid price, names the reason, and still imports the part", () => {
    const pack = parsePackFile(JSON.stringify({
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
    expect(pack!.parts.map((part) => part.id)).toEqual(["text", "zero", "words", "fraction-moq", "zero-tier", "low-qty", "stale", "good"]);
    expect(pack!.parts.slice(0, 7).every((part) => part.price === undefined)).toBe(true);
    expect(pack!.parts[7].price).toEqual({
      value: 12,
      currency: "ILS",
      moq: 100,
    });
    expect(consumePriceWarnings()).toEqual([
      { partId: "text", reason: "value" },
      { partId: "zero", reason: "value" },
      { partId: "words", reason: "currency" },
      { partId: "fraction-moq", reason: "moq" },
      { partId: "zero-tier", reason: "tiers" },
      { partId: "low-qty", reason: "tiers" },
      { partId: "stale", reason: "quotedAt" },
      { partId: "good", reason: "tierDropped" },
      { partId: "good", reason: "tierDropped" },
    ]);
  });

  it("drops a break that is not above moq or the previous break, and keeps a more expensive one", () => {
    const pack = parsePackFile(JSON.stringify({
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
    expect(pack!.parts[0].price).toEqual({
      value: 10,
      currency: "ILS",
      moq: 100,
      tiers: [
        { minQty: 500, value: 8 },
        { minQty: 1000, value: 8.5 },
      ],
    });
    expect(consumePriceWarnings()).toEqual([
      { partId: "breaks", reason: "tierDropped" },
      { partId: "breaks", reason: "tierDropped" },
      { partId: "breaks", reason: "tierRose" },
    ]);
    syncRegistry([pack!]);
    expect(importedPrice("breaks")?.tiers).toEqual([
      { minQty: 500, value: 8 },
      { minQty: 1000, value: 8.5 },
    ]);
  });

  it("keeps unknown pack fields so a later version can ride along", () => {
    const pack = parsePackFile(JSON.stringify({
      name: "Scan",
      version: 2,
      source: "scan",
      parts: [{ ...basePart, measurements: [{ name: "height", mm: 32 }] }],
    }));
    expect(pack!.version).toBe(2);
    expect((pack as { source?: string }).source).toBe("scan");
    expect((pack!.parts[0] as { measurements?: unknown[] }).measurements).toEqual([{ name: "height", mm: 32 }]);
    expect(pack!.parts[0].price).toBeUndefined();
    expect(consumePriceWarnings()).toEqual([]);
  });
});
