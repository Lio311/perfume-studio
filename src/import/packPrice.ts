import { normalizeCurrency, type PriceTier, type SupplierPrice } from "../budget/money.ts";

export type PriceDropReason = "value" | "currency" | "moq" | "tiers" | "quotedAt";

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
 * Keep a pack price only when it matches the shared shape.
 * A failure drops the price; the caller still imports the part and reports `reason`.
 */
export function sanitizeSupplierPrice(raw: unknown): { price: SupplierPrice } | { reason: PriceDropReason } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { reason: "value" };
  const price = raw as Record<string, unknown>;
  if (typeof price.value !== "number" || !Number.isFinite(price.value) || price.value <= 0) return { reason: "value" };
  if (typeof price.currency !== "string") return { reason: "currency" };
  const currency = normalizeCurrency(price.currency);
  if (!currency) return { reason: "currency" };

  let moq: number | undefined;
  if ("moq" in price && price.moq !== undefined) {
    if (typeof price.moq !== "number" || !Number.isInteger(price.moq) || price.moq < 1) return { reason: "moq" };
    moq = price.moq;
  }

  let tiers: PriceTier[] | undefined;
  if ("tiers" in price && price.tiers !== undefined) {
    if (!Array.isArray(price.tiers)) return { reason: "tiers" };
    const clean: PriceTier[] = [];
    for (const tier of price.tiers) {
      if (!tier || typeof tier !== "object" || Array.isArray(tier)) return { reason: "tiers" };
      const row = tier as Record<string, unknown>;
      const minQty = typeof row.minQty === "number" ? row.minQty : row.qty;
      const tierValue = row.value;
      if (typeof minQty !== "number" || !Number.isInteger(minQty) || minQty < 1) return { reason: "tiers" };
      if (typeof tierValue !== "number" || !Number.isFinite(tierValue) || tierValue <= 0) return { reason: "tiers" };
      clean.push({ minQty, value: tierValue });
    }
    if (clean.length) {
      clean.sort((a, b) => a.minQty - b.minQty);
      tiers = clean;
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
  };
}
