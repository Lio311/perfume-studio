import { describe, expect, it } from "vitest";
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
    expect(sanitizeSupplierPrice({
      value: 1,
      currency: "USD",
      tiers: [{ minQty: 2, value: 1 }, { qty: 4, value: 0.5 }],
    })).toBeUndefined();
    expect(sanitizeSupplierPrice({ value: 1, currency: "USD", quotedAt: "06-10-2026" })).toBeUndefined();
    expect(sanitizeSupplierPrice({ value: 1, currency: "USD", quotedAt: "2026-02-31" })).toBeUndefined();
    expect(sanitizeSupplierPrice({ value: 1, currency: "USD", note: "cash" })).toBeUndefined();
    expect(sanitizeSupplierPrice([])).toBeUndefined();
    expect(sanitizeSupplierPrice(null)).toBeUndefined();
  });
});
