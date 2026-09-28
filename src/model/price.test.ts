import { describe, expect, it } from "vitest";
import { tx } from "../i18n/copy.ts";
import { sanitizeSupplierPrice, type PriceIssue } from "./price.ts";

const clean = {
  value: 0.48,
  currency: "USD",
  moq: 5000,
  tiers: [
    { minQty: 20000, value: 0.41 },
    { minQty: 50000, value: 0.36 },
  ],
  quotedAt: "2026-10-06",
};

function codes(issues: PriceIssue[]): string[] {
  return issues.map((item) => item.code);
}

describe("sanitizeSupplierPrice", () => {
  it("keeps a canonical price and returns no issues", () => {
    const result = sanitizeSupplierPrice(clean);
    expect(result.issues).toEqual([]);
    expect(result.price).toEqual(clean);
    expect(JSON.stringify(result.price)).not.toContain('"qty"');
    expect(sanitizeSupplierPrice({ value: 1, currency: "EUR" })).toEqual({
      price: { value: 1, currency: "EUR" },
      issues: [],
    });
  });

  it("drops a tier at or below moq and keeps the rest of the price", () => {
    const result = sanitizeSupplierPrice({
      value: 0.48,
      currency: "USD",
      moq: 5000,
      tiers: [
        { minQty: 5000, value: 0.48 },
        { minQty: 20000, value: 0.41 },
        { minQty: 50000, value: 0.36 },
      ],
    });
    expect(result.price).toEqual({
      value: 0.48,
      currency: "USD",
      moq: 5000,
      tiers: [
        { minQty: 20000, value: 0.41 },
        { minQty: 50000, value: 0.36 },
      ],
    });
    expect(result.issues).toEqual([
      expect.objectContaining({
        path: "tiers[0].minQty",
        code: "tier_not_above_moq",
      }),
    ]);
    expect(result.issues[0].he).toContain("moq");
    expect(result.issues[0].en).toContain("moq");
  });

  it("drops a tier that does not ascend and keeps the ones that do", () => {
    const result = sanitizeSupplierPrice({
      value: 1,
      currency: "USD",
      tiers: [
        { minQty: 10, value: 1 },
        { minQty: 2, value: 0.5 },
        { minQty: 30, value: 0.4 },
      ],
    });
    expect(result.price).toEqual({
      value: 1,
      currency: "USD",
      tiers: [
        { minQty: 10, value: 1 },
        { minQty: 30, value: 0.4 },
      ],
    });
    expect(codes(result.issues)).toEqual(["tier_not_ascending"]);
    expect(result.issues[0].path).toBe("tiers[1].minQty");

    const duplicate = sanitizeSupplierPrice({
      value: 1,
      currency: "USD",
      tiers: [
        { minQty: 5, value: 1 },
        { minQty: 5, value: 0.9 },
      ],
    });
    expect(duplicate.price?.tiers).toEqual([{ minQty: 5, value: 1 }]);
    expect(codes(duplicate.issues)).toEqual(["tier_not_ascending"]);
  });

  it("keeps a tier whose value rises and reports it", () => {
    const result = sanitizeSupplierPrice({
      value: 1,
      currency: "USD",
      moq: 1,
      tiers: [
        { minQty: 10, value: 0.8 },
        { minQty: 20, value: 0.9 },
      ],
    });
    expect(result.price).toEqual({
      value: 1,
      currency: "USD",
      moq: 1,
      tiers: [
        { minQty: 10, value: 0.8 },
        { minQty: 20, value: 0.9 },
      ],
    });
    expect(result.issues).toEqual([
      expect.objectContaining({ path: "tiers[1].value", code: "tier_value_rose" }),
    ]);
    expect(result.issues[0].he).toContain("המחיר");
    expect(result.issues[0].en).toContain("higher");
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
    expect(price.issues).toEqual([]);
    expect(price.price).toEqual({
      value: 1.5,
      currency: "USD",
      tiers: [
        { minQty: 10, value: 1.2 },
        { minQty: 100, value: 0.9 },
      ],
    });
    expect(JSON.stringify(price.price)).not.toContain('"qty"');

    expect(sanitizeSupplierPrice({
      value: 1,
      currency: "USD",
      tiers: [{ minQty: 2, value: 1 }, { qty: 4, value: 0.8 }],
    }).price).toEqual({
      value: 1,
      currency: "USD",
      tiers: [{ minQty: 2, value: 1 }, { minQty: 4, value: 0.8 }],
    });

    const both = sanitizeSupplierPrice({
      value: 2,
      currency: "EUR",
      tiers: [{ minQty: 5, qty: 9, value: 1.1 }],
    });
    expect(both.issues).toEqual([]);
    expect(both.price).toEqual({
      value: 2,
      currency: "EUR",
      tiers: [{ minQty: 5, value: 1.1 }],
    });
  });

  it("drops an invalid tier and keeps the price", () => {
    const result = sanitizeSupplierPrice({
      value: 1,
      currency: "USD",
      tiers: [{ qty: 0, value: 1 }],
    });
    expect(result.price).toEqual({ value: 1, currency: "USD" });
    expect(codes(result.issues)).toEqual(["tier_below_min"]);
    expect(result.issues[0]).toMatchObject({ path: "tiers[0].minQty", severity: "warning" });

    const empty = sanitizeSupplierPrice({ value: 1, currency: "USD", tiers: [] });
    expect(empty.price).toEqual({ value: 1, currency: "USD" });
    expect(empty.issues).toEqual([]);

    const notArray = sanitizeSupplierPrice({ value: 1, currency: "USD", tiers: {} });
    expect(notArray.price).toEqual({ value: 1, currency: "USD" });
    expect(codes(notArray.issues)).toEqual(["price_tiers"]);
  });

  it("requires minQty of at least 2 when moq is absent, and does not sort tiers", () => {
    const low = sanitizeSupplierPrice({
      value: 1,
      currency: "USD",
      tiers: [
        { minQty: 1, value: 0.5 },
        { minQty: 10, value: 0.4 },
      ],
    });
    expect(low.price?.tiers).toEqual([{ minQty: 10, value: 0.4 }]);
    expect(codes(low.issues)).toEqual(["tier_below_min"]);

    const unsorted = sanitizeSupplierPrice({
      value: 1,
      currency: "USD",
      tiers: [
        { minQty: 30, value: 0.4 },
        { minQty: 10, value: 0.8 },
      ],
    });
    expect(unsorted.price?.tiers).toEqual([{ minQty: 30, value: 0.4 }]);
    expect(codes(unsorted.issues)).toEqual(["tier_not_ascending"]);
  });

  it("does not read qty when a non-numeric minQty is present", () => {
    const result = sanitizeSupplierPrice({
      value: 1,
      currency: "USD",
      tiers: [{ minQty: "10", qty: 20, value: 0.5 }],
    });
    expect(result.price).toEqual({ value: 1, currency: "USD" });
    expect(result.issues[0]).toMatchObject({ path: "tiers[0].minQty", code: "tier_min_qty", severity: "warning" });
  });

  it("keeps a tier that costs more than the previous price and warns", () => {
    const result = sanitizeSupplierPrice({
      value: 1,
      currency: "USD",
      tiers: [{ minQty: 5, value: 1.2 }],
    });
    expect(result.price?.tiers).toEqual([{ minQty: 5, value: 1.2 }]);
    expect(result.issues[0]).toMatchObject({
      path: "tiers[0].value",
      code: "tier_value_rose",
      severity: "warning",
    });
  });

  it("stores an ISO currency, including shekel spellings and lowercase codes", () => {
    expect(sanitizeSupplierPrice({ value: 1, currency: "usd" })).toEqual({
      price: { value: 1, currency: "USD" },
      issues: [],
    });
    expect(sanitizeSupplierPrice({ value: 2, currency: "₪" }).price?.currency).toBe("ILS");
    expect(sanitizeSupplierPrice({ value: 2, currency: "nis" }).price?.currency).toBe("ILS");
    expect(sanitizeSupplierPrice({ value: 1, currency: "US" }).price).toBeUndefined();
    expect(sanitizeSupplierPrice({ value: 1, currency: "USD", note: "cash" })).toEqual({
      price: { value: 1, currency: "USD" },
      issues: [],
    });
  });

  it("returns structured warnings and no price when the base quote is invalid", () => {
    const zero = sanitizeSupplierPrice({ value: 0, currency: "USD" });
    expect(zero.price).toBeUndefined();
    expect(codes(zero.issues)).toEqual(["price_value"]);
    expect(zero.issues[0]).toMatchObject({ path: "value", code: "price_value", severity: "warning" });
    expect(zero.issues[0].he).toContain("המחיר");
    expect(zero.issues[0].en).toContain("price");

    const again = sanitizeSupplierPrice({ value: 1, currency: "EUR" });
    expect(again.issues).toEqual([]);
    expect(zero.issues).toHaveLength(1);

    expect(sanitizeSupplierPrice({ value: -1, currency: "USD" }).price).toBeUndefined();
    expect(sanitizeSupplierPrice({ value: Number.POSITIVE_INFINITY, currency: "USD" }).price).toBeUndefined();
    expect(codes(sanitizeSupplierPrice({ value: 1, currency: "USD", moq: 0 }).issues)).toEqual(["price_moq"]);
    expect(codes(sanitizeSupplierPrice({ value: 1, currency: "USD", moq: 1.5 }).issues)).toEqual(["price_moq"]);
    expect(codes(sanitizeSupplierPrice({ value: 1, currency: "USD", quotedAt: "06-10-2026" }).issues)).toEqual(["price_quoted_at"]);
    expect(codes(sanitizeSupplierPrice({ value: 1, currency: "USD", quotedAt: "2026-02-31" }).issues)).toEqual(["price_quoted_at"]);
    expect(sanitizeSupplierPrice({
      value: 1,
      currency: "USD",
      quotedAt: "2026-10-06T11:42:00+04:00",
    }).price?.quotedAt).toBe("2026-10-06T11:42:00+04:00");
    expect(sanitizeSupplierPrice([]).issues[0]).toMatchObject({ path: "", code: "price_invalid", severity: "warning" });
    expect(sanitizeSupplierPrice(null).price).toBeUndefined();
    expect(sanitizeSupplierPrice(undefined).price).toBeUndefined();
  });

  it("treats a missing price as absent copy, not zero", () => {
    expect(sanitizeSupplierPrice(undefined).price).toBeUndefined();
    expect(sanitizeSupplierPrice({ value: 0, currency: "USD" }).price).toBeUndefined();
    expect(tx("he").noPrice).toBe("אין מחיר");
    expect(tx("en").noPrice).toBe("No price");
  });
});
