import type { PartFacts } from "./types.ts";

/** An extra quantity break above the base price. `minQty` is an integer. */
export interface PriceTier {
  minQty: number;
  value: number;
}

/**
 * Optional supplier quote. `value` is the unit price at the base quantity (the MOQ, or one).
 * `tiers` are further breaks only, sorted by `minQty` ascending.
 */
export interface SupplierPrice {
  value: number;
  currency: string;
  moq?: number;
  tiers?: PriceTier[];
  quotedAt?: string;
}

export type PriceSource = "example" | "user" | "import";

export interface ResolvedPrice {
  value: number;
  currency: string;
  source: PriceSource;
  moq?: number;
  tiers?: PriceTier[];
  /** ISO 8601 date from an imported quote, when the pack included one. */
  quotedAt?: string;
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

/**
 * Unit price at `qty`. The base `value` covers the MOQ (or one, when there is no MOQ).
 * A tier applies only when `qty` reaches that extra break.
 */
export function unitValue(price: { value: number; moq?: number; tiers?: PriceTier[] }, qty = 1): number {
  const base = price.moq ?? 1;
  const applicable = (price.tiers ?? []).filter((tier) => tier.minQty <= Math.max(qty, base) && qty >= tier.minQty);
  if (!applicable.length || qty < base) return price.value;
  applicable.sort((a, b) => b.minQty - a.minQty);
  return applicable[0].value;
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
  if (override && Number.isFinite(override.value) && override.value > 0 && normalizeCurrency(override.currency)) {
    const currency = normalizeCurrency(override.currency)!;
    const { ils, converted } = toIls(override.value, currency, rates);
    return { value: override.value, currency, source: "user", ils, converted };
  }
  if (imported && normalizeCurrency(imported.currency)) {
    const currency = normalizeCurrency(imported.currency)!;
    const value = imported.value;
    const { ils, converted } = toIls(value, currency, rates);
    return {
      value,
      currency,
      source: "import",
      moq: imported.moq,
      tiers: imported.tiers,
      quotedAt: imported.quotedAt,
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
  const abs = Math.abs(rounded);
  const body = Number.isInteger(abs) ? String(abs) : abs.toFixed(digits);
  if (rounded > 0) return `+${body}`;
  if (rounded < 0) return `\u2212${body}`;
  return "0";
}
