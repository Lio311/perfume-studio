import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("dompurify", () => ({
  default: { sanitize: (value: string) => value },
}));

import { importedPrice, syncRegistry } from "./registry.ts";
import { parsePackFile } from "./supplierDb.ts";

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
    const parsed = parsePackFile(JSON.stringify({
      name: "Legacy",
      parts: [{ id: "legacy-cap", kind: "cap", name: "Old cap", code: "OLD" }],
    }));
    expect(parsed).toBeTruthy();
    expect(parsed!.priceWarnings).toEqual([]);
    expect(parsed!.pack.version).toBeUndefined();
    expect(parsed!.pack.parts).toHaveLength(1);
    expect(parsed!.pack.parts[0].price).toBeUndefined();
    expect(parsed!.pack.parts[0].name).toBe("Old cap");
    syncRegistry([parsed!.pack]);
    expect(importedPrice("legacy-cap")).toBeUndefined();
  });

  it("keeps a valid price, sorts extra breaks, and registers the quote date", () => {
    const parsed = parsePackFile(JSON.stringify({
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
    expect(parsed!.priceWarnings).toEqual([]);
    expect(parsed!.pack.parts[0].price).toEqual({
      value: 4.5,
      currency: "USD",
      moq: 5000,
      tiers: [
        { minQty: 10000, value: 4.2 },
        { minQty: 20000, value: 3.9 },
      ],
      quotedAt: "2026-09-01",
    });
    syncRegistry([parsed!.pack]);
    expect(importedPrice("aurora-cap")).toMatchObject({ value: 4.5, currency: "USD", moq: 5000, quotedAt: "2026-09-01" });
  });

  it("drops an invalid price, names the reason, and still imports the part", () => {
    const parsed = parsePackFile(JSON.stringify({
      name: "Mixed",
      parts: [
        { ...basePart, id: "text", price: { value: "4", currency: "USD" } },
        { ...basePart, id: "zero", price: { value: 0, currency: "ILS" } },
        { ...basePart, id: "words", price: { value: 4, currency: "dollar" } },
        { ...basePart, id: "fraction-moq", price: { value: 4, currency: "AED", moq: 1.5 } },
        { ...basePart, id: "old-tier", price: { value: 4, currency: "ILS", tiers: [{ qty: 10, value: 3 }] } },
        { ...basePart, id: "base-tier", price: { value: 4, currency: "ILS", moq: 100, tiers: [{ minQty: 100, value: 4 }] } },
        { ...basePart, id: "stale", price: { value: 4, currency: "ILS", quotedAt: "yesterday" } },
        { ...basePart, id: "good", price: { value: 12, currency: "ILS" } },
      ],
    }));
    expect(parsed!.pack.parts.map((part) => part.id)).toEqual(["text", "zero", "words", "fraction-moq", "old-tier", "base-tier", "stale", "good"]);
    expect(parsed!.pack.parts.slice(0, 7).every((part) => part.price === undefined)).toBe(true);
    expect(parsed!.pack.parts[7].price).toEqual({ value: 12, currency: "ILS" });
    expect(parsed!.priceWarnings).toEqual([
      { partId: "text", reason: "value" },
      { partId: "zero", reason: "value" },
      { partId: "words", reason: "currency" },
      { partId: "fraction-moq", reason: "moq" },
      { partId: "old-tier", reason: "tiers" },
      { partId: "base-tier", reason: "tiers" },
      { partId: "stale", reason: "quotedAt" },
    ]);
  });

  it("keeps unknown pack fields so a later version can ride along", () => {
    const parsed = parsePackFile(JSON.stringify({
      name: "Scan",
      version: 2,
      source: "scan",
      parts: [{ ...basePart, measurements: [{ name: "height", mm: 32 }] }],
    }));
    expect(parsed!.pack.version).toBe(2);
    expect((parsed!.pack as { source?: string }).source).toBe("scan");
    expect((parsed!.pack.parts[0] as { measurements?: unknown[] }).measurements).toEqual([{ name: "height", mm: 32 }]);
    expect(parsed!.pack.parts[0].price).toBeUndefined();
    expect(parsed!.priceWarnings).toEqual([]);
  });
});
