import { tx } from "../i18n/copy.ts";

/**
 * Canonical supplier price. The budget tools should call `sanitizeSupplierPrice`
 * instead of keeping a second checker.
 *
 * A bad base value or moq comes back without `price`. An unrecognized currency is left
 * unset, `unpriced` is true, and the price stays for display. An unknown key is ignored
 * with a warning. Each tier is judged in the order it was written and is not sorted.
 * A failing tier is removed and the base price stays. A tier that costs more than the
 * previous price is kept. Issues are returned on the result. They are not stored in module state.
 */
export interface SupplierPriceTier {
  minQty: number;
  value: number;
}

export interface SupplierPrice {
  value: number;
  /** Uppercase ISO 4217 code. Absent when the pack's currency could not be recognized. */
  currency?: string;
  /**
   * The original currency text when it was not an allowed ISO code, such as "dollar" or "FOO".
   * Kept so the warning can quote it and a later edit can correct it. Export strips this field.
   */
  currencyText?: string;
  moq?: number;
  tiers?: SupplierPriceTier[];
  quotedAt?: string;
}

export type PriceIssueCode =
  | "price_invalid"
  | "price_value"
  | "price_currency"
  | "price_unknown_field"
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
  /**
   * Present when the quote can be shown. `currency` is omitted when it was not recognized.
   * That object is what the pack stores. `unpriced` is not written onto it.
   */
  price?: SupplierPrice;
  /**
   * True when `price` is present but `currency` is unset.
   * Budget code should treat the quote as unpriced and leave it out of a total.
   * The library still shows the amount with the unknown-currency label.
   */
  unpriced?: true;
  issues: PriceIssue[];
}

/** Keys written back onto a supplier price. Anything else is ignored with a warning. */
const PRICE_KEYS = new Set(["value", "currency", "currencyText", "moq", "tiers", "quotedAt"]);

/**
 * Used when `Intl.supportedValuesOf` is missing. Three letters outside the
 * resolved set, such as FOO, follow the unknown-currency path. The shared schema
 * only requires `^[A-Z]{3}$`. This set is stricter than that pattern.
 */
const FALLBACK_CURRENCIES = [
  "ILS", "USD", "EUR", "GBP", "AED", "CNY", "JPY", "CHF",
  "CAD", "AUD", "NZD",
  "SAR", "QAR", "KWD", "BHD", "OMR", "EGP",
  "INR", "KRW", "SGD", "HKD", "TWD", "THB",
  "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON",
  "TRY", "RUB", "BRL", "MXN", "ZAR",
] as const;

function acceptedCurrencies(): Set<string> {
  try {
    const supported = Intl.supportedValuesOf?.("currency");
    if (supported && supported.length > 0) return new Set(supported);
  } catch {
    // A runtime without supportedValuesOf keeps the fallback list.
  }
  return new Set(FALLBACK_CURRENCIES);
}

const ISO_4217 = acceptedCurrencies();

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

/** An allowed ISO 4217 code. Shekel spellings become ILS, and `$` becomes USD. */
export function normalizeCurrency(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed === "$") return "USD";
  if (trimmed === "₪" || trimmed === "ש״ח" || trimmed === "ש\"ח" || trimmed === "שח") return "ILS";
  const upper = trimmed.toUpperCase();
  if (upper === "NIS" || upper === "ILS") return "ILS";
  if (upper === "USD") return "USD";
  if (ISO_4217.has(upper)) return upper;
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
 * Currency is stored as an uppercase ISO code, or left unset when it cannot be recognized.
 * An unset currency sets `unpriced` so budget code can skip the quote. A bad currency never
 * drops the price. An unknown key is not copied. A tier may use legacy `qty` when `minQty`
 * is absent; the result always stores `minQty`. Tiers stay in the written order. A bad tier
 * is removed and the base price stays.
 */
export function sanitizeSupplierPrice(raw: unknown): SupplierPriceResult {
  if (!isDataObject(raw)) {
    return { issues: [issue("", "price_invalid", "המחיר אינו אובייקט.", "The price is not an object.")] };
  }

  const issues: PriceIssue[] = [];
  if (!Object.hasOwn(raw, "value") || !isPositive(raw.value)) {
    issues.push(issue("value", "price_value", "ערך המחיר חייב להיות מספר גדול מ־0.", "The price value must be a number greater than 0."));
  }
  const hasMoq = Object.hasOwn(raw, "moq") && raw.moq !== undefined;
  if (hasMoq && (typeof raw.moq !== "number" || !Number.isInteger(raw.moq) || raw.moq < 1)) {
    issues.push(issue("moq", "price_moq", "moq חייב להיות מספר שלם מ־1 ומעלה.", "moq must be an integer of 1 or more."));
  }
  if (issues.length) return { issues };

  for (const key of Object.keys(raw)) {
    if (PRICE_KEYS.has(key)) continue;
    issues.push(issue(
      key,
      "price_unknown_field",
      `השדה ${key} אינו חלק מהמחיר, ולכן הוא לא נשמר. המחיר עצמו נשאר.`,
      `Field ${key} is not part of the price, so it was ignored. The price itself was kept.`,
    ));
  }

  const rawCurrency = typeof raw.currency === "string"
    ? raw.currency.trim()
    : typeof raw.currencyText === "string"
      ? raw.currencyText.trim()
      : "";
  const currency = rawCurrency ? normalizeCurrency(rawCurrency) : null;
  const moq = hasMoq ? raw.moq as number : undefined;
  const price: SupplierPrice = { value: raw.value as number };
  let unpriced: true | undefined;
  if (currency) price.currency = currency;
  else {
    unpriced = true;
    if (rawCurrency) price.currencyText = rawCurrency;
    const quoted = rawCurrency ? ` («${rawCurrency}»)` : "";
    const quotedEn = rawCurrency ? ` ("${rawCurrency}")` : "";
    issues.push(issue(
      "currency",
      "price_currency",
      `מטבע לא ידוע${quoted}, ולכן המטבע לא נשמר. המחיר עצמו נשאר.`,
      `Unknown currency${quotedEn}, so the currency was left unset. The price itself was kept.`,
    ));
  }
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
        // minQty must be strictly above moq, or above 1 when moq is absent (so at least 2).
        if (!(minQty > (moq ?? 1))) {
          if (moq !== undefined) {
            issues.push(issue(
              `${path}.minQty`,
              "tier_not_above_moq",
              `מדרגה ${index}: minQty חייב להיות גדול מ־moq, ולכן המדרגה הוסרה.`,
              `Tier ${index}: minQty must be greater than moq, so the tier was removed.`,
            ));
          } else {
            issues.push(issue(
              `${path}.minQty`,
              "tier_below_min",
              `מדרגה ${index}: minQty חייב להיות גדול מ־1 כשאין moq, ולכן המדרגה הוסרה.`,
              `Tier ${index}: minQty must be greater than 1 when moq is not set, so the tier was removed.`,
            ));
          }
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
      issues.push(issue(
        "quotedAt",
        "price_quoted_at",
        "quotedAt חייב להיות תאריך או תאריך-שעה ISO 8601, ולכן הוסר.",
        "quotedAt must be an ISO 8601 date or date-time, so it was removed.",
      ));
    } else {
      price.quotedAt = quotedAt.slice(0, 10);
    }
  }

  return unpriced ? { price, unpriced, issues } : { price, issues };
}

/**
 * ILS uses `Intl` narrowSymbol: English is `₪12`, Hebrew (he-IL) is `12 ₪`.
 * Any other allowed code is a grouped number plus the ISO code.
 */
export function formatSupplierAmount(value: number, currency: string | undefined, lang: "he" | "en"): string {
  const locale = lang === "he" ? "he-IL" : "en";
  const digits = Number.isInteger(value) ? 0 : 2;
  if (!currency) {
    const amount = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(value);
    return `${amount} ${tx(lang).unknownCurrency}`;
  }
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
