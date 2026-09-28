import { describe, expect, it } from "vitest";
import type { FinishId, VariantPart } from "../model/types.ts";
import { allFacts, factsById } from "./descriptors.ts";
import { exampleIls, resolvePartPrice, summarizeBudget, toIls, unitValue } from "./money.ts";
import { rankAssemblySavings, rankCostReductions, suggestAlternatives } from "./similar.ts";
import type { PartFacts } from "./types.ts";
import { capacityFitsVolume, matchingBottleIds, nominalFillMl } from "./volume.ts";

function facts(partial: Partial<PartFacts> & Pick<PartFacts, "id" | "kind">): PartFacts {
  return {
    nameHe: partial.id,
    nameEn: partial.id,
    neck: "FEA15",
    widthMm: 30,
    heightMm: 40,
    depthMm: 20,
    section: "rect",
    profile: "cara",
    material: "glass",
    fillMl: partial.kind === "bottle" ? 50 : null,
    supplierName: null,
    namedSupplier: false,
    ...partial,
  };
}

describe("budget totals", () => {
  it("sums shekel prices and reports remaining budget", () => {
    const summary = summarizeBudget([20, 10], 30);
    expect(summary.totalIls).toBe(30);
    expect(summary.remainingIls).toBe(0);
    expect(summary.over).toBe(false);
    expect(summary.overByIls).toBe(0);
    expect(summary.incomplete).toBe(false);
  });

  it("marks the combination over budget and keeps the shortfall", () => {
    const summary = summarizeBudget([40, 8], 30);
    expect(summary.totalIls).toBe(48);
    expect(summary.remainingIls).toBe(-18);
    expect(summary.over).toBe(true);
    expect(summary.overByIls).toBe(18);
  });

  it("leaves a foreign price out of the shekel total until a rate exists", () => {
    expect(toIls(4, "USD", {})).toEqual({ ils: null, converted: false });
    const open = summarizeBudget([10, null], 30);
    expect(open.totalIls).toBe(10);
    expect(open.incomplete).toBe(true);
    expect(open.over).toBe(false);
    expect(open.excludedCount).toBe(1);

    expect(toIls(4, "USD", { USD: 3.5 })).toEqual({ ils: 14, converted: true });
    const rated = summarizeBudget([10, 14], 30);
    expect(rated.totalIls).toBe(24);
    expect(rated.incomplete).toBe(false);
    expect(rated.remainingIls).toBe(6);
  });

  it("uses the base unit price when every tier starts above one", () => {
    expect(unitValue({ value: 4.5, tiers: [{ qty: 5000, value: 4.2 }, { qty: 20000, value: 3.9 }] }, 1)).toBe(4.5);
    expect(unitValue({ value: 9, tiers: [{ qty: 1, value: 8 }, { qty: 10, value: 7 }] }, 1)).toBe(8);
  });
});

describe("volume filtering", () => {
  it("keeps a bottle within 15% or 2 ml and drops the neighbouring fills", () => {
    expect(capacityFitsVolume(50, 50)).toBe(true);
    expect(capacityFitsVolume(55, 50)).toBe(true);
    expect(capacityFitsVolume(57.5, 50)).toBe(true);
    expect(capacityFitsVolume(58, 50)).toBe(false);
    expect(capacityFitsVolume(30, 50)).toBe(false);
    expect(capacityFitsVolume(100, 50)).toBe(false);
    expect(capacityFitsVolume(7, 5)).toBe(true);
    expect(capacityFitsVolume(8, 5)).toBe(false);
  });

  it("reads a commercial fill before the geometric estimate", () => {
    expect(nominalFillMl({ id: "square-50", tags: ["square", "50"], capacityMl: 125 })).toBe(50);
    expect(nominalFillMl({ id: "cara-50", tags: ["50"], capacityMl: 50, supplier: { name: "Verescence", capacityMl: 50 } })).toBe(50);
    expect(nominalFillMl({ id: "cara-100", tags: ["100"], capacityMl: 100, supplier: { name: "Verescence", capacityMl: 100 } })).toBe(100);
    expect(nominalFillMl({ id: "column-short", tags: ["column"], capacityMl: 80 })).toBe(80);
  });

  it("filters the built-in catalog to the brief and falls back to the nearest fill", () => {
    const bottles = allFacts("bottle").map((bottle) => ({ id: bottle.id, fillMl: bottle.fillMl }));
    const match = matchingBottleIds(bottles, 50, ["cara-50"]);
    expect(match.relaxed).toBe(false);
    expect(match.ids.has("cara-50")).toBe(true);
    expect(match.ids.has("square-50")).toBe(true);
    expect(match.ids.has("cara-100")).toBe(false);
    expect(match.ids.has("bazille-30")).toBe(false);

    const odd = matchingBottleIds(
      [
        { id: "a", fillMl: 30 },
        { id: "b", fillMl: 100 },
      ],
      70,
    );
    expect(odd.relaxed).toBe(true);
    expect([...odd.ids]).toEqual(["b"]);
  });
});

describe("similar alternatives", () => {
  const finish: FinishId = "gold";

  it("requires the same kind and a compatible neck", () => {
    const current = facts({ id: "bottle-a", kind: "bottle", neck: "FEA15" });
    const catalog = [
      facts({ id: "cap-a", kind: "cap", neck: null, material: "zamac" }),
      facts({ id: "bottle-b", kind: "bottle", neck: "FEA13" }),
      facts({ id: "bottle-c", kind: "bottle", neck: "FEA15", widthMm: 31, heightMm: 41, depthMm: 21 }),
    ];
    const prices: Record<string, number> = { "bottle-a": 80, "bottle-b": 20, "bottle-c": 40, "cap-a": 10 };
    const alts = suggestAlternatives({
      current,
      catalog,
      finish: "clear",
      referenceNeck: "FEA15",
      priceIls: (id) => prices[id] ?? null,
      maxPriceIls: 50,
    });
    expect(alts.map((row) => row.part.id)).toEqual(["bottle-c"]);
  });

  it("ranks the closer part first and drops anything that still misses the budget", () => {
    const current = facts({
      id: "cap-now",
      kind: "cap",
      neck: null,
      section: "circle",
      profile: "cylinder",
      material: "zamac",
      widthMm: 22,
      heightMm: 32,
      depthMm: 22,
    });
    const close = facts({
      id: "cap-close",
      kind: "cap",
      neck: null,
      section: "circle",
      profile: "cylinder",
      material: "other",
      widthMm: 22,
      heightMm: 32,
      depthMm: 22,
    });
    const far = facts({
      id: "cap-far",
      kind: "cap",
      neck: null,
      section: "rect",
      profile: "cube",
      material: "wood",
      widthMm: 40,
      heightMm: 16,
      depthMm: 40,
    });
    const pricey = facts({ ...close, id: "cap-pricey" });
    const prices: Record<string, number> = { "cap-now": 45, "cap-close": 25, "cap-far": 10, "cap-pricey": 44 };
    const alts = suggestAlternatives({
      current,
      catalog: [close, far, pricey],
      finish,
      referenceNeck: "FEA15",
      priceIls: (id) => prices[id] ?? null,
      maxPriceIls: 30,
    });
    expect(alts.map((row) => row.part.id)).toEqual(["cap-close"]);
    expect(alts[0].priceIls).toBe(25);
  });

  it("offers a cheaper built-in cap that fits under the selected zamac cap", () => {
    const caps = allFacts("cap");
    const current = caps.find((cap) => cap.id === "zamac-cyl");
    expect(current).toBeTruthy();
    const priceIls = (id: string) => exampleIls(caps.find((cap) => cap.id === id)!);
    expect(priceIls("zamac-cyl")).toBeGreaterThan(priceIls("cap-cyl-32"));
    const alts = suggestAlternatives({
      current: current!,
      catalog: caps,
      finish,
      referenceNeck: "FEA15",
      priceIls,
      maxPriceIls: priceIls("cap-cyl-32"),
    });
    expect(alts.map((row) => row.part.id)).toContain("cap-cyl-32");
    expect(alts.every((row) => row.priceIls <= priceIls("cap-cyl-32"))).toBe(true);
  });
});

describe("cost-reduction ranking", () => {
  it("ranks a large saving on a small change ahead of a tiny saving", () => {
    const current = facts({ id: "now", kind: "bottle", widthMm: 50, heightMm: 70, depthMm: 40, namedSupplier: true, supplierName: "House" });
    const smallChange = facts({ id: "small", kind: "bottle", widthMm: 51, heightMm: 72, depthMm: 41 });
    const tinySaving = facts({ id: "tiny", kind: "bottle", widthMm: 50, heightMm: 70, depthMm: 40, section: "circle", profile: "classic" });
    const prices: Record<string, number> = { now: 80, small: 50, tiny: 74 };
    const ranked = rankCostReductions({
      current,
      catalog: [tinySaving, smallChange],
      finish: "clear",
      referenceNeck: "FEA15",
      priceIls: (id) => prices[id] ?? null,
    });
    expect(ranked.map((row) => row.to.id)[0]).toBe("small");
    expect(ranked[0].savingIls).toBe(30);
    expect(ranked[0].delta.rss).toBeGreaterThan(0);
    expect(ranked[0].ratio).toBeGreaterThan(ranked[1]?.ratio ?? 0);
  });

  it("drops a cheap part whose shape change is large", () => {
    const current = facts({ id: "square", kind: "bottle" });
    const round = facts({
      id: "round",
      kind: "bottle",
      section: "circle",
      profile: "sphere",
      material: "wood",
      widthMm: 80,
      heightMm: 20,
      depthMm: 80,
    });
    const ranked = rankCostReductions({
      current,
      catalog: [round],
      finish: "clear",
      referenceNeck: "FEA15",
      priceIls: (id) => (id === "square" ? 90 : 10),
    });
    expect(ranked).toEqual([]);
  });

  it("suggests a similar square bottle with a millimetre gap and a lower example price", () => {
    const bottles = allFacts("bottle");
    const cara = factsById("bottle", "cara-50");
    expect(cara).toBeTruthy();
    const priceIls = (id: string) => {
      const row = bottles.find((bottle) => bottle.id === id);
      return row ? exampleIls(row) : null;
    };
    const ranked = rankCostReductions({
      current: cara!,
      catalog: bottles,
      finish: "clear",
      referenceNeck: cara!.neck,
      priceIls,
      volumeMl: 50,
    });
    const square = ranked.find((row) => row.to.id === "square-50");
    expect(square).toBeTruthy();
    expect(square!.savingIls).toBeGreaterThanOrEqual(5);
    expect(square!.delta.rss).toBeLessThan(30);
    expect(ranked.map((row) => row.to.id)).not.toContain("round-50");
    expect(ranked.map((row) => row.to.id)).not.toContain("cara-100");
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].ratio).toBeGreaterThanOrEqual(ranked[i].ratio);
  });

  it("merges slots and still orders by saving-to-change ratio", () => {
    const bottle = factsById("bottle", "cara-50")!;
    const cap = factsById("cap", "zamac-cyl")!;
    const byKind = new Map<VariantPart, PartFacts[]>();
    const priceIls = (id: string) => {
      const row = allFacts(id.startsWith("cap") || id.startsWith("zamac") ? "cap" : "bottle").find((part) => part.id === id);
      return row ? exampleIls(row) : null;
    };
    const ranked = rankAssemblySavings({
      currents: [bottle, cap],
      catalog: (kind) => {
        const cached = byKind.get(kind);
        if (cached) return cached;
        const next = allFacts(kind);
        byKind.set(kind, next);
        return next;
      },
      finishOf: (part) => (part.kind === "cap" ? "gold" : "clear"),
      referenceNeck: "FEA15",
      priceIls,
      volumeMl: 50,
    });
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.some((row) => row.from.id === "cara-50" || row.from.id === "zamac-cyl")).toBe(true);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].ratio).toBeGreaterThanOrEqual(ranked[i].ratio);
  });
});

describe("resolved prices", () => {
  it("labels a built-in price as an example and prefers a user override, then an import", () => {
    const row = facts({ id: "square-50", kind: "bottle" });
    const example = resolvePartPrice(row, undefined, undefined, {});
    expect(example.source).toBe("example");
    expect(example.currency).toBe("ILS");
    expect(example.value % 5).toBe(0);

    const imported = resolvePartPrice(row, { value: 4, currency: "usd" }, undefined, {});
    expect(imported).toMatchObject({ source: "import", currency: "USD", value: 4, ils: null, converted: false });

    const rated = resolvePartPrice(row, { value: 4, currency: "USD" }, undefined, { USD: 4 });
    expect(rated.ils).toBe(16);
    expect(rated.converted).toBe(true);

    const user = resolvePartPrice(row, { value: 4, currency: "USD" }, { value: 22, currency: "ILS" }, { USD: 4 });
    expect(user).toMatchObject({ source: "user", currency: "ILS", value: 22, ils: 22, converted: false });
  });

  it("charges a named house bottle more than a similar studio bottle", () => {
    const house = exampleIls(factsById("bottle", "cara-50")!);
    const studio = exampleIls(factsById("bottle", "square-50")!);
    expect(house).toBeGreaterThan(studio);
    expect(exampleIls(factsById("cap", "zamac-cyl")!)).toBeGreaterThan(exampleIls(factsById("cap", "cap-cyl-32")!));
  });
});
