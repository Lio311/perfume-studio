import { useMemo } from "react";
import { allFacts, factsById } from "../budget/descriptors.ts";
import { resolvePartPrice, summarizeBudget, type ResolvedPrice } from "../budget/money.ts";
import { rankAssemblySavings, suggestAlternatives, type Alternative, type SavingSwap } from "../budget/similar.ts";
import { BUDGET_KINDS, type PartFacts } from "../budget/types.ts";
import { importedPrice } from "../import/registry.ts";
import type { FinishId, VariantPart } from "../model/types.ts";
import { useLab } from "../store/labStore.ts";

export interface BudgetLine {
  kind: VariantPart;
  id: string;
  facts: PartFacts;
  price: ResolvedPrice;
}

export interface BudgetModel {
  priceFor: (kind: VariantPart, id: string) => ResolvedPrice | null;
  factsFor: (kind: VariantPart, id: string) => PartFacts | null;
  lines: BudgetLine[];
  summary: ReturnType<typeof summarizeBudget>;
  alternatives: Alternative[];
  savings: SavingSwap[];
  foreign: string[];
  includesExample: boolean;
}

export function useBudgetModel(): BudgetModel {
  const design = useLab((s) => s.design);
  const brief = useLab((s) => s.brief);
  const overrides = useLab((s) => s.priceOverrides);
  const rates = useLab((s) => s.exchangeRates);
  const suppliers = useLab((s) => s.suppliers);
  const selected = useLab((s) => s.selected);

  return useMemo(() => {
    const cache = new Map<VariantPart, PartFacts[]>();
    const catalog = (kind: VariantPart) => {
      const hit = cache.get(kind);
      if (hit) return hit;
      const next = allFacts(kind);
      cache.set(kind, next);
      return next;
    };
    const factsFor = (kind: VariantPart, id: string) => factsById(kind, id);
    const priceFor = (kind: VariantPart, id: string): ResolvedPrice | null => {
      const facts = factsFor(kind, id);
      if (!facts) return null;
      return resolvePartPrice(facts, importedPrice(id), overrides[id], rates);
    };
    const lines: BudgetLine[] = [];
    for (const kind of BUDGET_KINDS) {
      if (!design[kind].visible) continue;
      const id = design[kind].variantId;
      const facts = factsFor(kind, id);
      const price = facts ? priceFor(kind, id) : null;
      if (!facts || !price) continue;
      lines.push({ kind, id, facts, price });
    }
    const summary = summarizeBudget(lines.map((line) => line.price.ils), brief.ceilingIls);
    const foreign = [...new Set(lines.filter((line) => line.price.currency !== "ILS").map((line) => line.price.currency))];
    let alternatives: Alternative[] = [];
    if (summary.over && selected && selected !== "liquid") {
      const line = lines.find((item) => item.kind === selected);
      if (line?.price.ils != null) {
        const maxPriceIls = brief.ceilingIls - (summary.totalIls - line.price.ils);
        const finish = design[selected].finish as FinishId;
        alternatives = suggestAlternatives({
          current: line.facts,
          catalog: catalog(selected),
          finish,
          referenceNeck: design.bottle.neck,
          priceIls: (id) => priceFor(selected, id)?.ils ?? null,
          maxPriceIls,
          volumeMl: brief.volumeMl,
        });
      }
    }
    const savings = rankAssemblySavings({
      currents: lines.map((line) => line.facts),
      catalog,
      finishOf: (part) => design[part.kind].finish,
      referenceNeck: design.bottle.neck,
      priceIls: (id) => {
        const kind = lines.find((line) => line.id === id)?.kind ?? catalogKind(id, cache);
        if (!kind) return null;
        return priceFor(kind, id)?.ils ?? null;
      },
      volumeMl: brief.volumeMl,
    });
    return {
      priceFor,
      factsFor,
      lines,
      summary,
      alternatives,
      savings,
      foreign,
      includesExample: lines.some((line) => line.price.source === "example"),
    };
    // suppliers refreshes imported prices and facts after a pack sync.
  }, [brief.ceilingIls, brief.volumeMl, design, overrides, rates, selected, suppliers]);
}

function catalogKind(id: string, cache: Map<VariantPart, PartFacts[]>): VariantPart | null {
  for (const [kind, rows] of cache) {
    if (rows.some((row) => row.id === id)) return kind;
  }
  return null;
}
