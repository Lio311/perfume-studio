import { describe, expect, it } from "vitest";
import { tx } from "../i18n/copy.ts";
import { sanitizeSupplierPrice } from "./price.ts";

const valid = {
  value: 0.62,
  currency: "USD",
  moq: 10000,
  tiers: [
    { minQty: 5000, value: 0.48 },
    { minQty: 20000, value: 0.41 },
  ],
  quotedAt: "2026-10-06",
};

describe("sanitizeSupplierPrice", () => {
  it("keeps a canonical price and rebuilds only the known fields", () => {
    expect(sanitizeSupplierPrice(valid)).toEqual(valid);
    expect(sanitizeSupplierPrice({ value: 1, currency: "EUR" })).toEqual({ value: 1, currency: "EUR" });
  });

  it("rejects a non-positive value, a lowercase currency, unsorted tiers, and a bad date", () => {
    expect(sanitizeSupplierPrice({ value: 0, currency: "USD" })).toBeUndefined();
    expect(sanitizeSupplierPrice({ value: -1, currency: "USD" })).toBeUndefined();
    expect(sanitizeSupplierPrice({ value: 1, currency: "usd" })).toBeUndefined();
    expect(sanitizeSupplierPrice({ value: 1, currency: "US" })).toBeUndefined();
    expect(sanitizeSupplierPrice({ value: 1, currency: "USD", moq: 0 })).toBeUndefined();
    expect(sanitizeSupplierPrice({ value: 1, currency: "USD", moq: 1.5 })).toBeUndefined();
    expect(sanitizeSupplierPrice({
      value: 1,
      currency: "USD",
      tiers: [{ minQty: 10, value: 1 }, { minQty: 2, value: 0.5 }],
    })).toBeUndefined();
    expect(sanitizeSupplierPrice({ value: 1, currency: "USD", tiers: [{ qty: 0, value: 1 }] })).toBeUndefined();
    expect(sanitizeSupplierPrice({ value: 1, currency: "USD", quotedAt: "06-10-2026" })).toBeUndefined();
    expect(sanitizeSupplierPrice({ value: 1, currency: "USD", quotedAt: "2026-02-31" })).toBeUndefined();
    expect(sanitizeSupplierPrice({ value: 1, currency: "USD", note: "cash" })).toBeUndefined();
    expect(sanitizeSupplierPrice([])).toBeUndefined();
    expect(sanitizeSupplierPrice(null)).toBeUndefined();
    expect(sanitizeSupplierPrice(undefined)).toBeUndefined();
  });

  it("reads a legacy qty tier as minQty and always writes minQty", () => {
    const price = sanitizeSupplierPrice({
      value: 1.5,
      currency: "USD",
      tiers: [
        { qty: 10, value: 1.2 },
        { qty: 100, value: 0.9 },
      ],
    });
    expect(price).toEqual({
      value: 1.5,
      currency: "USD",
      tiers: [
        { minQty: 10, value: 1.2 },
        { minQty: 100, value: 0.9 },
      ],
    });
    expect(price?.tiers?.every((tier) => !("qty" in tier))).toBe(true);
    expect(JSON.stringify(price)).not.toContain('"qty"');

    expect(sanitizeSupplierPrice({
      value: 1,
      currency: "USD",
      tiers: [{ minQty: 2, value: 1 }, { qty: 4, value: 0.8 }],
    })).toEqual({
      value: 1,
      currency: "USD",
      tiers: [{ minQty: 2, value: 1 }, { minQty: 4, value: 0.8 }],
    });

    expect(sanitizeSupplierPrice({
      value: 2,
      currency: "EUR",
      tiers: [{ minQty: 5, qty: 9, value: 1.1 }],
    })).toEqual({
      value: 2,
      currency: "EUR",
      tiers: [{ minQty: 5, value: 1.1 }],
    });
  });

  it("treats a missing price as absent copy, not zero", () => {
    expect(sanitizeSupplierPrice(undefined)).toBeUndefined();
    expect(sanitizeSupplierPrice({ value: 0, currency: "USD" })).toBeUndefined();
    expect(tx("he").noPrice).toBe("אין מחיר");
    expect(tx("en").noPrice).toBe("No price");
  });
});
