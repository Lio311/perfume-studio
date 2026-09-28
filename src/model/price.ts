/**
 * Canonical supplier price. The budget tools should call `sanitizeSupplierPrice`
 * instead of keeping a second checker.
 *
 * An invalid value returns `undefined`. Callers drop the price and still import the part.
 */
export interface SupplierPriceTier {
  minQty: number;
  value: number;
}

export interface SupplierPrice {
  value: number;
  currency: string;
  moq?: number;
  tiers?: SupplierPriceTier[];
  quotedAt?: string;
}

const PRICE_KEYS = new Set(["value", "currency", "moq", "tiers", "quotedAt"]);
const TIER_KEYS = new Set(["minQty", "value"]);
const CURRENCY = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isDataObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ownKeys(value: object): string[] {
  return Object.keys(value).filter((key) => Object.hasOwn(value, key));
}

function isPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isQty(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function allowedKeys(value: object, allowed: Set<string>): boolean {
  return ownKeys(value).every((key) => allowed.has(key));
}

/**
 * Rebuild a supplier price into the canonical shape, or return `undefined` when it does not match.
 * Currency must already be three uppercase letters. Tiers use `minQty` and must be strictly ascending.
 */
export function sanitizeSupplierPrice(raw: unknown): SupplierPrice | undefined {
  if (!isDataObject(raw) || !allowedKeys(raw, PRICE_KEYS)) return undefined;
  if (!Object.hasOwn(raw, "value") || !Object.hasOwn(raw, "currency")) return undefined;
  if (!isPositive(raw.value) || typeof raw.currency !== "string" || !CURRENCY.test(raw.currency)) return undefined;

  const price: SupplierPrice = { value: raw.value, currency: raw.currency };

  if (Object.hasOwn(raw, "moq")) {
    if (!isQty(raw.moq)) return undefined;
    price.moq = raw.moq;
  }

  if (Object.hasOwn(raw, "tiers")) {
    if (!Array.isArray(raw.tiers) || raw.tiers.length === 0) return undefined;
    const tiers: SupplierPriceTier[] = [];
    let previous = 0;
    for (const tier of raw.tiers) {
      if (!isDataObject(tier) || !allowedKeys(tier, TIER_KEYS)) return undefined;
      if (!Object.hasOwn(tier, "minQty") || !Object.hasOwn(tier, "value")) return undefined;
      if (!isQty(tier.minQty) || !isPositive(tier.value) || tier.minQty <= previous) return undefined;
      previous = tier.minQty;
      tiers.push({ minQty: tier.minQty, value: tier.value });
    }
    price.tiers = tiers;
  }

  if (Object.hasOwn(raw, "quotedAt")) {
    if (!isIsoDate(raw.quotedAt)) return undefined;
    price.quotedAt = raw.quotedAt;
  }

  return price;
}
