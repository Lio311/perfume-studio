/**
 * Canonical supplier price. The budget tools should call `sanitizeSupplierPrice`
 * instead of keeping a second checker.
 *
 * A price of 0, or any price that is not this shape, comes back without `price`.
 * A bad tier is removed and the rest of the price is kept. A tier whose value rises
 * is kept. `issues` is empty only for a clean price; a server can answer 422 from it,
 * while the lab stores `price` and shows the messages as warnings.
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

export type PriceIssueCode =
  | "price_invalid"
  | "price_unknown_field"
  | "price_value"
  | "price_currency"
  | "price_moq"
  | "price_quoted_at"
  | "price_tiers"
  | "tiers_empty"
  | "tier_invalid"
  | "tier_not_above_moq"
  | "tier_not_ascending"
  | "tier_value_rose";

export interface PriceIssue {
  path: string;
  code: PriceIssueCode;
  he: string;
  en: string;
}

export interface SupplierPriceResult {
  price?: SupplierPrice;
  issues: PriceIssue[];
}

const PRICE_KEYS = new Set(["value", "currency", "moq", "tiers", "quotedAt"]);
const TIER_KEYS = new Set(["minQty", "qty", "value"]);
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

function tierMinQty(tier: Record<string, unknown>): number | undefined {
  if (Object.hasOwn(tier, "minQty")) return isQty(tier.minQty) ? tier.minQty : undefined;
  if (Object.hasOwn(tier, "qty")) return isQty(tier.qty) ? tier.qty : undefined;
  return undefined;
}

function issue(path: string, code: PriceIssueCode, he: string, en: string): PriceIssue {
  return { path, code, he, en };
}

/**
 * Rebuild a supplier price into the canonical shape.
 * Currency must already be three uppercase letters. A tier may use legacy `qty` when `minQty` is absent;
 * the result always stores `minQty`. Each kept tier's `minQty` is strictly above `moq` when `moq` is set,
 * and strictly above the previous kept tier.
 */
export function sanitizeSupplierPrice(raw: unknown): SupplierPriceResult {
  if (!isDataObject(raw)) {
    return { issues: [issue("", "price_invalid", "המחיר אינו אובייקט.", "The price is not an object.")] };
  }

  const issues: PriceIssue[] = [];
  for (const key of ownKeys(raw)) {
    if (!PRICE_KEYS.has(key)) {
      issues.push(issue(key, "price_unknown_field", `השדה ${key} אינו חלק מהמחיר.`, `Field ${key} is not part of the price.`));
    }
  }
  if (!Object.hasOwn(raw, "value") || !isPositive(raw.value)) {
    issues.push(issue("value", "price_value", "ערך המחיר חייב להיות מספר גדול מ־0.", "The price value must be a number greater than 0."));
  }
  if (!Object.hasOwn(raw, "currency") || typeof raw.currency !== "string" || !CURRENCY.test(raw.currency)) {
    issues.push(issue("currency", "price_currency", "מטבע המחיר חייב להיות קוד ISO 4217 בן 3 אותיות גדולות.", "The price currency must be a 3-letter uppercase ISO 4217 code."));
  }
  if (Object.hasOwn(raw, "moq") && !isQty(raw.moq)) {
    issues.push(issue("moq", "price_moq", "moq חייב להיות מספר שלם מ־1 ומעלה.", "moq must be an integer of 1 or more."));
  }
  if (Object.hasOwn(raw, "quotedAt") && !isIsoDate(raw.quotedAt)) {
    issues.push(issue("quotedAt", "price_quoted_at", "quotedAt חייב להיות תאריך ISO בפורמט YYYY-MM-DD.", "quotedAt must be an ISO date, YYYY-MM-DD."));
  }
  if (Object.hasOwn(raw, "tiers") && !Array.isArray(raw.tiers)) {
    issues.push(issue("tiers", "price_tiers", "tiers חייב להיות מערך.", "tiers must be an array."));
  }
  if (issues.length) return { issues };

  const price: SupplierPrice = { value: raw.value as number, currency: raw.currency as string };
  if (Object.hasOwn(raw, "moq")) price.moq = raw.moq as number;
  if (Object.hasOwn(raw, "quotedAt")) price.quotedAt = raw.quotedAt as string;

  if (Array.isArray(raw.tiers)) {
    if (raw.tiers.length === 0) {
      issues.push(issue("tiers", "tiers_empty", "רשימת המדרגות ריקה ולכן הוסרה.", "The tier list is empty, so it was removed."));
    } else {
      const kept: SupplierPriceTier[] = [];
      raw.tiers.forEach((tier, index) => {
        const path = `tiers[${index}]`;
        if (!isDataObject(tier) || !allowedKeys(tier, TIER_KEYS) || !Object.hasOwn(tier, "value") || !isPositive(tier.value)) {
          issues.push(issue(path, "tier_invalid", `מדרגה ${index} אינה תקינה ולכן הוסרה.`, `Tier ${index} is invalid, so it was removed.`));
          return;
        }
        const minQty = tierMinQty(tier);
        if (minQty === undefined) {
          issues.push(issue(path, "tier_invalid", `מדרגה ${index} אינה תקינה ולכן הוסרה.`, `Tier ${index} is invalid, so it was removed.`));
          return;
        }
        if (price.moq !== undefined && minQty <= price.moq) {
          issues.push(issue(
            `${path}.minQty`,
            "tier_not_above_moq",
            `מדרגה ${index}: minQty חייב להיות גדול מ־moq, ולכן המדרגה הוסרה.`,
            `Tier ${index}: minQty must be greater than moq, so the tier was removed.`,
          ));
          return;
        }
        const previous = kept.at(-1);
        if (previous && minQty <= previous.minQty) {
          issues.push(issue(
            `${path}.minQty`,
            "tier_not_ascending",
            `מדרגה ${index}: minQty חייב לעלות ממש, ולכן המדרגה הוסרה.`,
            `Tier ${index}: minQty must ascend strictly, so the tier was removed.`,
          ));
          return;
        }
        if (previous && tier.value > previous.value) {
          issues.push(issue(
            `${path}.value`,
            "tier_value_rose",
            `מדרגה ${index}: המחיר גבוה מהמדרגה הקודמת.`,
            `Tier ${index}: the value is higher than the previous tier.`,
          ));
        }
        kept.push({ minQty, value: tier.value });
      });
      if (kept.length) price.tiers = kept;
    }
  }

  return { price, issues };
}
