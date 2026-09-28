import { normalizeCurrency, type PriceTier, type SupplierPrice } from "../budget/money.ts";

/** Keep a pack price only when value and currency are usable. Anything else is dropped. */
export function sanitizeSupplierPrice(raw: unknown): SupplierPrice | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const price = raw as Record<string, unknown>;
  const value = typeof price.value === "number" && Number.isFinite(price.value) && price.value >= 0 ? price.value : null;
  const currency = typeof price.currency === "string" ? normalizeCurrency(price.currency) : null;
  if (value === null || !currency) return undefined;
  const moq = typeof price.moq === "number" && Number.isFinite(price.moq) && price.moq > 0 ? price.moq : undefined;
  let tiers: PriceTier[] | undefined;
  if (Array.isArray(price.tiers)) {
    const clean = price.tiers.flatMap((tier) => {
      if (!tier || typeof tier !== "object") return [];
      const row = tier as Record<string, unknown>;
      if (typeof row.qty !== "number" || typeof row.value !== "number") return [];
      if (!Number.isFinite(row.qty) || !Number.isFinite(row.value) || row.qty <= 0 || row.value < 0) return [];
      return [{ qty: row.qty, value: row.value }];
    });
    if (clean.length) tiers = clean;
  }
  return { value, currency, ...(moq !== undefined ? { moq } : {}), ...(tiers ? { tiers } : {}) };
}
