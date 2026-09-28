import type { PartFacts } from "./types.ts";

/** A quantity break kept in the order it was written. `minQty` is an integer above `moq`, or at least 2 when there is no MOQ. */
export interface PriceTier {
  minQty: number;
  value: number;
}

/**
 * Optional supplier quote. `value` is the unit price and must be greater than 0.
 * `tiers` stay in the order they were accepted: each `minQty` is above `moq` when set, otherwise at least 2, and above the previous break.
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
  /**
   * The supplier currency is not a code we can convert.
   * The row is counted as unpriced. The original value is still shown.
   */
  unknownCurrency?: boolean;
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
  /** Visible parts with no price. They are not added to the total as zero. */
  unpricedCount: number;
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

/**
 * A currency code the lab can convert.
 * ₪, NIS, ש״ח, ש"ח, שח, and ils become ILS. $ and usd become USD.
 * Any other three-letter code is kept in uppercase. Anything else is unknown.
 * Call this before a shared sanitizer that only accepts a normalized code.
 */
export function normalizeCurrency(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed === "$") return "USD";
  if (trimmed === "₪" || trimmed === "ש״ח" || trimmed === 'ש"ח' || trimmed === "שח") return "ILS";
  const upper = trimmed.toUpperCase();
  if (upper === "NIS" || upper === "ILS") return "ILS";
  if (upper === "USD") return "USD";
  if (/^[A-Z]{3}$/.test(upper)) return upper;
  return null;
}

/**
 * Supplier currency after alias normalization.
 * A blank or non-text currency is unusable. An unknown text currency is kept for display.
 */
export function canonicalSupplierCurrency(raw: unknown): { currency: string; known: boolean } | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const code = normalizeCurrency(trimmed);
  if (code) return { currency: code, known: true };
  return { currency: trimmed, known: false };
}

/** Shekel contribution of one part. An unknown currency counts as unpriced, not as a missing rate. */
export function budgetAmount(price: ResolvedPrice | null): number | null | "unpriced" {
  if (!price || price.unknownCurrency) return "unpriced";
  return price.ils;
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
  override: { value: number; currency: string } | { absent: true } | undefined,
  rates: Record<string, number>,
): ResolvedPrice | null {
  if (override && "absent" in override) return null;
  if (override && "value" in override && Number.isFinite(override.value) && override.value > 0 && normalizeCurrency(override.currency)) {
    const currency = normalizeCurrency(override.currency)!;
    const { ils, converted } = toIls(override.value, currency, rates);
    return { value: override.value, currency, source: "user", ils, converted };
  }
  if (imported && imported.value > 0) {
    const canon = canonicalSupplierCurrency(imported.currency);
    if (canon && !canon.known) {
      return {
        value: imported.value,
        currency: canon.currency,
        source: "import",
        moq: imported.moq,
        tiers: imported.tiers,
        quotedAt: imported.quotedAt,
        ils: null,
        converted: false,
        unknownCurrency: true,
      };
    }
    if (canon) {
      const value = imported.value;
      const { ils, converted } = toIls(value, canon.currency, rates);
      return {
        value,
        currency: canon.currency,
        source: "import",
        moq: imported.moq,
        tiers: imported.tiers,
        quotedAt: imported.quotedAt,
        ils,
        converted,
      };
    }
  }
  if (facts.fromPack) return null;
  const value = exampleIls(facts);
  return { value, currency: "ILS", source: "example", ils: value, converted: false };
}

/** True when a planned quantity is set and is lower than this part's minimum order. */
export function quantityBelowMoq(quantity: number | undefined, moq: number | undefined): boolean {
  return quantity != null && moq != null && quantity < moq;
}

/** Unit price at a planned quantity. Without one, the base quote is unchanged. */
export function priceAtQuantity(price: ResolvedPrice, qty: number | undefined): ResolvedPrice {
  if (qty == null || qty < 1) return price;
  const unit = unitValue(price, qty);
  if (unit === price.value) return price;
  const rate = price.ils == null || price.value === 0 ? null : price.ils / price.value;
  return { ...price, value: unit, ils: rate == null ? null : unit * rate };
}

export function summarizeBudget(ilsAmounts: Array<number | null | "unpriced">, ceilingIls: number): BudgetSummary {
  const unpricedCount = ilsAmounts.filter((amount) => amount === "unpriced").length;
  const excludedCount = ilsAmounts.filter((amount) => amount === null).length;
  const totalIls = ilsAmounts.reduce<number>((sum, amount) => sum + (typeof amount === "number" ? amount : 0), 0);
  const remainingIls = ceilingIls - totalIls;
  const overByIls = Math.max(0, totalIls - ceilingIls);
  return {
    totalIls,
    remainingIls,
    overByIls,
    over: overByIls > 1e-9,
    incomplete: excludedCount > 0,
    excludedCount,
    unpricedCount,
  };
}

export function formatCount(value: number, lang: "he" | "en"): string {
  return new Intl.NumberFormat(lang === "he" ? "he-IL" : "en").format(value);
}

/** Quote date in the active locale. Date-only strings stay on that calendar day. */
export function formatQuoteDate(iso: string, lang: "he" | "en"): string {
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === "he" ? "he-IL" : "en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatMoney(value: number, currency: string, lang: "he" | "en"): string {
  const locale = lang === "he" ? "he-IL" : "en";
  const digits = Number.isInteger(value) ? 0 : 2;
  const code = normalizeCurrency(currency) ?? currency;
  if (code === "ILS") {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "ILS",
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: digits,
      maximumFractionDigits: 2,
    }).format(value);
  }
  const amount = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(value);
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
