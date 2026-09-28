import { canonicalSupplierCurrency, type PriceTier, type SupplierPrice } from "../budget/money.ts";

/** The price itself is unusable. The part still imports, without a price. */
export type PriceDropReason = "value" | "currency" | "moq" | "quotedAt";

/** One break was adjusted. The rest of the price is kept. */
export type PriceTierNotice = "tierDropped" | "tierRose";

export interface PriceWarning {
  partId: string;
  reason: PriceDropReason | PriceTierNotice;
}

/** How many warning lines to show before a single "+N more" line. */
export const PRICE_WARNING_LIMIT = 20;

const ISO_8601 = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

/** A calendar date, or a date with a time, written as ISO 8601. */
export function isIso8601Date(value: string): boolean {
  if (!ISO_8601.test(value)) return false;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return false;
  if (value.length === 10) return true;
  const match = value.slice(11).match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] ? Number(match[3]) : 0;
  if (hour > 23 || minute > 59 || second > 59) return false;
  return Number.isFinite(Date.parse(value));
}

/**
 * `minQty` when it is a whole number. A present but non-numeric `minQty` is invalid
 * and does not fall through to legacy `qty`. `qty` is read only when `minQty` is absent.
 */
function tierQuantity(row: Record<string, unknown>): number | null {
  const hasMinQty = Object.prototype.hasOwnProperty.call(row, "minQty") && row.minQty !== undefined;
  if (hasMinQty) {
    return typeof row.minQty === "number" && Number.isInteger(row.minQty) ? row.minQty : null;
  }
  return typeof row.qty === "number" && Number.isInteger(row.qty) ? row.qty : null;
}

/**
 * Keep a pack price when the base quote is valid.
 * A bad value or MOQ drops the whole price. A currency that is not text is dropped.
 * An unknown currency string is kept so the part can show its original value.
 * Each tier is checked in the order it was written and is not reordered.
 * A failing tier is dropped on its own. A tier that costs more than the previous price is kept.
 */
export function sanitizeSupplierPrice(
  raw: unknown,
): { price: SupplierPrice; notices: PriceTierNotice[] } | { reason: PriceDropReason } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { reason: "value" };
  const price = raw as Record<string, unknown>;
  if (typeof price.value !== "number" || !Number.isFinite(price.value) || price.value <= 0) return { reason: "value" };
  const canon = canonicalSupplierCurrency(price.currency);
  if (!canon) return { reason: "currency" };
  const currency = canon.currency;

  let moq: number | undefined;
  if ("moq" in price && price.moq !== undefined) {
    if (typeof price.moq !== "number" || !Number.isInteger(price.moq) || price.moq < 1) return { reason: "moq" };
    moq = price.moq;
  }

  const notices: PriceTierNotice[] = [];
  let tiers: PriceTier[] | undefined;
  if ("tiers" in price && price.tiers !== undefined) {
    if (!Array.isArray(price.tiers)) notices.push("tierDropped");
    else {
      const kept: PriceTier[] = [];
      let previousValue = price.value;
      for (const tier of price.tiers) {
        if (!tier || typeof tier !== "object" || Array.isArray(tier)) {
          notices.push("tierDropped");
          continue;
        }
        const row = tier as Record<string, unknown>;
        const minQty = tierQuantity(row);
        if (minQty === null) {
          notices.push("tierDropped");
          continue;
        }
        const aboveFloor = moq !== undefined ? minQty > moq : minQty >= 2;
        const abovePrevious = kept.length === 0 || minQty > kept[kept.length - 1].minQty;
        const tierValue = row.value;
        const valueOk = typeof tierValue === "number" && Number.isFinite(tierValue) && tierValue > 0;
        if (!aboveFloor || !abovePrevious || !valueOk) {
          notices.push("tierDropped");
          continue;
        }
        if (tierValue > previousValue) notices.push("tierRose");
        kept.push({ minQty, value: tierValue });
        previousValue = tierValue;
      }
      if (kept.length) tiers = kept;
    }
  }

  let quotedAt: string | undefined;
  if ("quotedAt" in price && price.quotedAt !== undefined) {
    if (typeof price.quotedAt !== "string" || !isIso8601Date(price.quotedAt.trim())) return { reason: "quotedAt" };
    quotedAt = price.quotedAt.trim();
  }

  return {
    price: {
      value: price.value,
      currency,
      ...(moq !== undefined ? { moq } : {}),
      ...(tiers ? { tiers } : {}),
      ...(quotedAt ? { quotedAt } : {}),
    },
    notices,
  };
}

/** Rewrite a stored pack so prices use `minQty` and only the breaks that passed the tier rule. */
export function normalizeStoredPack<T extends { parts: Array<{ id: string; price?: unknown }> }>(
  pack: T,
): { pack: T; warnings: PriceWarning[]; changed: boolean } {
  let changed = false;
  const warnings: PriceWarning[] = [];
  const parts = pack.parts.map((part) => {
    if (part.price === undefined) return part;
    const before = JSON.stringify(part.price);
    const result = sanitizeSupplierPrice(part.price);
    if ("reason" in result) {
      changed = true;
      warnings.push({ partId: part.id, reason: result.reason });
      const next = { ...part };
      delete next.price;
      return next;
    }
    for (const notice of result.notices) warnings.push({ partId: part.id, reason: notice });
    // A kept warning, such as a tier that costs more, is not a data change.
    // Saving on the warning alone rewrites IndexedDB on every load.
    if (JSON.stringify(result.price) === before) return part;
    changed = true;
    return { ...part, price: result.price };
  });
  return { pack: { ...pack, parts }, warnings, changed };
}

/** Keep the first 20 lines and append one summary for the rest. */
export function capPriceWarnings<T>(items: T[], more: (hidden: number) => T, limit = PRICE_WARNING_LIMIT): T[] {
  if (items.length <= limit) return items;
  return [...items.slice(0, limit), more(items.length - limit)];
}
