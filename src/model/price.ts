/**
 * Canonical supplier price. The budget tools should call `sanitizeSupplierPrice`
 * instead of keeping a second checker.
 *
 * A bad base value, currency, or moq comes back without `price`. Each tier is judged
 * in the order it was written and is not sorted. A failing tier is removed and the
 * rest of the price is kept. A tier that costs more than the previous price is kept.
 * Issues are returned on the result. They are not stored in module state.
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
  | "price_value"
  | "price_currency"
  | "price_moq"
  | "price_quoted_at"
  | "price_tiers"
  | "tier_invalid"
  | "tier_min_qty"
  | "tier_not_above_moq"
  | "tier_below_min"
  | "tier_not_ascending"
  | "tier_value"
  | "tier_value_rose";

export type PriceIssueSeverity = "warning";

export interface PriceIssue {
  path: string;
  code: PriceIssueCode;
  severity: PriceIssueSeverity;
  he: string;
  en: string;
}

export interface SupplierPriceResult {
  price?: SupplierPrice;
  issues: PriceIssue[];
}

const ISO_8601 = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

function isDataObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isIso8601Date(value: string): boolean {
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

/** ISO 4217, plus the shekel spellings the budget tools already accept. */
export function normalizeCurrency(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed === "₪" || trimmed === "ש״ח" || trimmed === "ש\"ח" || trimmed === "שח") return "ILS";
  const upper = trimmed.toUpperCase();
  if (upper === "NIS" || upper === "ILS") return "ILS";
  if (/^[A-Z]{3}$/.test(upper)) return upper;
  return null;
}

/**
 * `minQty` when it is a whole number. A present but non-numeric `minQty` is invalid
 * and does not fall through to legacy `qty`. `qty` is read only when `minQty` is absent.
 */
function tierQuantity(row: Record<string, unknown>): number | null {
  const hasMinQty = Object.hasOwn(row, "minQty") && row.minQty !== undefined;
  if (hasMinQty) {
    return typeof row.minQty === "number" && Number.isInteger(row.minQty) ? row.minQty : null;
  }
  return typeof row.qty === "number" && Number.isInteger(row.qty) ? row.qty : null;
}

function issue(path: string, code: PriceIssueCode, he: string, en: string): PriceIssue {
  return { path, code, severity: "warning", he, en };
}

/**
 * Rebuild a supplier price into the canonical shape.
 * Currency is stored as an ISO 4217 code. A tier may use legacy `qty` when `minQty` is absent;
 * the result always stores `minQty`. Tiers stay in the written order.
 */
export function sanitizeSupplierPrice(raw: unknown): SupplierPriceResult {
  if (!isDataObject(raw)) {
    return { issues: [issue("", "price_invalid", "המחיר אינו אובייקט.", "The price is not an object.")] };
  }

  const issues: PriceIssue[] = [];
  if (!Object.hasOwn(raw, "value") || !isPositive(raw.value)) {
    issues.push(issue("value", "price_value", "ערך המחיר חייב להיות מספר גדול מ־0.", "The price value must be a number greater than 0."));
  }
  const currency = typeof raw.currency === "string" ? normalizeCurrency(raw.currency) : null;
  if (!currency) {
    issues.push(issue("currency", "price_currency", "מטבע המחיר חייב להיות קוד ISO 4217.", "The price currency must be an ISO 4217 code."));
  }
  const hasMoq = Object.hasOwn(raw, "moq") && raw.moq !== undefined;
  if (hasMoq && (typeof raw.moq !== "number" || !Number.isInteger(raw.moq) || raw.moq < 1)) {
    issues.push(issue("moq", "price_moq", "moq חייב להיות מספר שלם מ־1 ומעלה.", "moq must be an integer of 1 or more."));
  }
  if (issues.length) return { issues };

  const moq = hasMoq ? raw.moq as number : undefined;
  const price: SupplierPrice = { value: raw.value as number, currency: currency as string };
  if (moq !== undefined) price.moq = moq;

  if (Object.hasOwn(raw, "tiers") && raw.tiers !== undefined) {
    if (!Array.isArray(raw.tiers)) {
      issues.push(issue("tiers", "price_tiers", "tiers חייב להיות מערך, ולכן הוסר.", "tiers must be an array, so it was removed."));
    } else {
      const kept: SupplierPriceTier[] = [];
      let previousPrice = price.value;
      raw.tiers.forEach((tier, index) => {
        const path = `tiers[${index}]`;
        if (!isDataObject(tier)) {
          issues.push(issue(path, "tier_invalid", `מדרגה ${index} אינה תקינה ולכן הוסרה.`, `Tier ${index} is invalid, so it was removed.`));
          return;
        }
        const minQty = tierQuantity(tier);
        if (minQty === null) {
          issues.push(issue(
            `${path}.minQty`,
            "tier_min_qty",
            `מדרגה ${index}: minQty חייב להיות מספר שלם, ולכן המדרגה הוסרה.`,
            `Tier ${index}: minQty must be an integer, so the tier was removed.`,
          ));
          return;
        }
        if (moq !== undefined) {
          if (minQty <= moq) {
            issues.push(issue(
              `${path}.minQty`,
              "tier_not_above_moq",
              `מדרגה ${index}: minQty חייב להיות גדול מ־moq, ולכן המדרגה הוסרה.`,
              `Tier ${index}: minQty must be greater than moq, so the tier was removed.`,
            ));
            return;
          }
        } else if (minQty < 2) {
          issues.push(issue(
            `${path}.minQty`,
            "tier_below_min",
            `מדרגה ${index}: minQty חייב להיות 2 לפחות כשאין moq, ולכן המדרגה הוסרה.`,
            `Tier ${index}: minQty must be at least 2 when moq is not set, so the tier was removed.`,
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
        if (!Object.hasOwn(tier, "value") || !isPositive(tier.value)) {
          issues.push(issue(
            `${path}.value`,
            "tier_value",
            `מדרגה ${index}: הערך חייב להיות מספר גדול מ־0, ולכן המדרגה הוסרה.`,
            `Tier ${index}: the value must be a number greater than 0, so the tier was removed.`,
          ));
          return;
        }
        if (tier.value > previousPrice) {
          issues.push(issue(
            `${path}.value`,
            "tier_value_rose",
            `מדרגה ${index}: המחיר גבוה מהמחיר הקודם.`,
            `Tier ${index}: the value is higher than the previous price.`,
          ));
        }
        kept.push({ minQty, value: tier.value });
        previousPrice = tier.value;
      });
      if (kept.length) price.tiers = kept;
    }
  }

  if (Object.hasOwn(raw, "quotedAt") && raw.quotedAt !== undefined) {
    const quotedAt = typeof raw.quotedAt === "string" ? raw.quotedAt.trim() : "";
    if (!quotedAt || !isIso8601Date(quotedAt)) {
      return {
        issues: [issue("quotedAt", "price_quoted_at", "quotedAt חייב להיות תאריך ISO 8601.", "quotedAt must be an ISO 8601 date.")],
      };
    }
    price.quotedAt = quotedAt;
  }

  return { price, issues };
}
