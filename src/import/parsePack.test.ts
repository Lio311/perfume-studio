import { describe, expect, it, vi } from "vitest";

vi.mock("dompurify", () => ({
  default: { sanitize: (value: string) => value },
}));
import { budgetAmount, resolvePartPrice } from "../budget/money.ts";
import { summarizeBudget } from "../budget/money.ts";
import type { PartFacts } from "../budget/types.ts";
import { parsePackFile } from "./supplierDb.ts";
import { preparedPartCode } from "./registry.ts";

function facts(id: string): PartFacts {
  return {
    id,
    kind: "cap",
    nameHe: id,
    nameEn: id,
    neck: "FEA15",
    widthMm: 30,
    heightMm: 32,
    depthMm: 30,
    section: "circle",
    profile: "cylinder",
    material: "plastic",
    fillMl: null,
    supplierName: "Aurora",
    namedSupplier: true,
    fromPack: true,
  };
}

describe("imported prices in a budget total", () => {
  it("uses the prepared part code and counts a missing currency as unpriced", () => {
    expect(preparedPartCode("A 1", "cap", 0)).toEqual({ code: "A 1", slug: "a-1" });
    const parsed = parsePackFile(JSON.stringify({
      name: "Mixed",
      parts: [
        { id: "priced", kind: "cap", code: "A 1", name: "Priced", neck: "FEA15", widthMm: 30, heightMm: 32, depthMm: 30, capacityMl: null, profile: "cylinder", color: "#c4a15a", thumb: "", page: 1, price: { value: 10, currency: "₪" } },
        { id: "plain", kind: "cap", code: "B", name: "Plain", neck: "FEA15", widthMm: 30, heightMm: 32, depthMm: 30, capacityMl: null, profile: "cylinder", color: "#c4a15a", thumb: "", page: 1 },
        { id: "mystery", kind: "cap", code: "C", name: "Mystery", neck: "FEA15", widthMm: 30, heightMm: 32, depthMm: 30, capacityMl: null, profile: "cylinder", color: "#c4a15a", thumb: "", page: 1, price: { value: 7.5, currency: "dollar" } },
        { id: "blank", kind: "cap", code: "D", name: "Blank", neck: "FEA15", widthMm: 30, heightMm: 32, depthMm: 30, capacityMl: null, profile: "cylinder", color: "#c4a15a", thumb: "", page: 1, price: { value: 9 } },
      ],
    }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const byId = new Map(parsed.pack.parts.map((part) => [part.id, part]));
    const priced = resolvePartPrice(facts("priced"), byId.get("priced")?.price, undefined, {});
    const plain = resolvePartPrice(facts("plain"), byId.get("plain")?.price, undefined, {});
    const mystery = resolvePartPrice(facts("mystery"), byId.get("mystery")?.price, undefined, {});
    const blank = resolvePartPrice(facts("blank"), byId.get("blank")?.price, undefined, {});
    expect(priced).toMatchObject({ currency: "ILS", ils: 10 });
    expect(plain).toBeNull();
    expect(mystery?.unknownCurrency).toBe(true);
    expect(blank).toMatchObject({ value: 9, unknownCurrency: true, currency: "" });
    const summary = summarizeBudget([priced, plain, mystery, blank].map((price) => budgetAmount(price)), 100);
    expect(summary.totalIls).toBe(10);
    expect(summary.unpricedCount).toBe(3);
    expect(summary.excludedCount).toBe(0);
  });
});
