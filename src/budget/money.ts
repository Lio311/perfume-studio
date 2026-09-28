import type { PartFacts } from "./types.ts";

export interface PriceTier {
  qty: number;
  value: number;
}

/** Optional supplier price. Currency is an ISO code; ILS is the budget currency. */
export interface SupplierPrice {
  value: number;
  currency: string;
  moq?: number;
  tiers?: PriceTier[];
}

export type PriceSource = "example" | "user" | "import";

export interface ResolvedPrice {
  value: number;
  currency: string;
  source: PriceSource;
  moq?: number;
  tiers?: PriceTier[];
  /** Shekel amount used in the unit total. Null when a foreign price has no rate. */
  ils: number | null;
  /** True when `ils` is `value * rate` rather than a native shekel price. */
  converted: boolean;
}

export interface BudgetSummary {
  totalIls: number;
  remainingIls: number;
  overByIls: number;
  /** Known shekel total is above the ceiling. Foreign rows are not guessed into this. */
  over: boolean;
  /** At least one row has a currency that is not in the shekel total. */
  incomplete: boolean;
  excludedCount: number;
}

const KIND_BASE: Record<PartFacts["kind"], number> = {
  bottle: 40,
  cap: 15,
  pump: 12,
  collar: 6,
  label: 4,
  box: 18,
};

/** Illustrative add-on, not a market premium. See the README. */
const MATERIAL_ADD: Record<string, number> = {
  zamac: 20,
  luxury: 18,
  sculptural: 16,
  magnetic: 14,
  acrylic: 12,
  crystal: 12,
  wood: 8,
  surlyn: 4,
};

const HOUSE_ADD = 30;

export function normalizeCurrency(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed === "₪" || trimmed === "ש״ח" || trimmed === 'ש"ח' || trimmed === "שח") return "ILS";
  const upper = trimmed.toUpperCase();
  if (upper === "NIS" || upper === "ILS") return "ILS";
  if (/^[A-Z]{3}$/.test(upper)) return upper;
  return null;
}

/**
 * Synthetic example price in whole multiples of 5 ILS.
 * kind base + 5 ILS per 20 mm of the largest side + a material band + 30 ILS for a named supplier.
 */
export function exampleIls(facts: Pick<PartFacts, "kind" | "widthMm" | "heightMm" | "depthMm" | "material" | "namedSupplier">): number {
  const span = Math.max(facts.widthMm, facts.heightMm, facts.depthMm, 0);
  const sizeAdd = Math.round(span / 20) * 5;
  const materialAdd = MATERIAL_ADD[facts.material] ?? 0;
  const houseAdd = facts.namedSupplier ? HOUSE_ADD : 0;
  const raw = KIND_BASE[facts.kind] + sizeAdd + materialAdd + houseAdd;
  return Math.max(5, Math.round(raw / 5) * 5);
}

/** Per-unit price. A tier applies only when its quantity is at most one; higher breaks stay informational. */
export function unitValue(price: { value: number; tiers?: PriceTier[] }, qty = 1): number {
  const tiers = (price.tiers ?? []).filter((tier) => Number.isFinite(tier.qty) && Number.isFinite(tier.value) && tier.qty > 0 && tier.qty <= qty);
  if (!tiers.length) return price.value;
  tiers.sort((a, b) => b.qty - a.qty);
  return tiers[0].value;
}

export function toIls(value: number, currency: string, rates: Record<string, number>): { ils: number | null; converted: boolean } {
  const code = normalizeCurrency(currency);
  if (!code || !Number.isFinite(value)) return { ils: null, converted: false };
  if (code === "ILS") return { ils: value, converted: false };
  const rate = rates[code];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return { ils: null, converted: false };
  return { ils: value * rate, converted: true };
}

export function resolvePartPrice(
  facts: PartFacts,
  imported: SupplierPrice | undefined,
  override: { value: number; currency: string } | undefined,
  rates: Record<string, number>,
): ResolvedPrice {
  if (override && Number.isFinite(override.value) && override.value >= 0 && normalizeCurrency(override.currency)) {
    const currency = normalizeCurrency(override.currency)!;
    const { ils, converted } = toIls(override.value, currency, rates);
    return { value: override.value, currency, source: "user", ils, converted };
  }
  if (imported && normalizeCurrency(imported.currency)) {
    const currency = normalizeCurrency(imported.currency)!;
    const value = unitValue(imported, 1);
    const { ils, converted } = toIls(value, currency, rates);
    return {
      value,
      currency,
      source: "import",
      moq: imported.moq,
      tiers: imported.tiers,
      ils,
      converted,
    };
  }
  const value = exampleIls(facts);
  return { value, currency: "ILS", source: "example", ils: value, converted: false };
}

export function summarizeBudget(ilsAmounts: Array<number | null>, ceilingIls: number): BudgetSummary {
  const excludedCount = ilsAmounts.filter((amount) => amount === null).length;
  const totalIls = ilsAmounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
  const remainingIls = ceilingIls - totalIls;
  const overByIls = Math.max(0, totalIls - ceilingIls);
  return {
    totalIls,
    remainingIls,
    overByIls,
    over: overByIls > 1e-9,
    incomplete: excludedCount > 0,
    excludedCount,
  };
}

export function formatMoney(value: number, currency: string, lang: "he" | "en"): string {
  const locale = lang === "he" ? "he-IL" : "en-US";
  const digits = Number.isInteger(value) ? 0 : 2;
  const amount = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(value);
  const code = normalizeCurrency(currency) ?? currency;
  if (code === "ILS") return `${amount} ₪`;
  return `${amount} ${code}`;
}

export function formatSigned(value: number, digits = 1): string {
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(digits);
  if (rounded > 0) return `+${body}`;
  return body;
}
