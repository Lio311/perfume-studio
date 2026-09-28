import { formatCount, formatMoney, formatQuoteDate, quantityBelowMoq, type ResolvedPrice } from "../budget/money.ts";
import { tx } from "../i18n/copy.ts";
import type { VariantPart } from "../model/types.ts";
import { useLab } from "../store/labStore.ts";
import { useBudgetModel } from "./useBudget.ts";

const CURRENCIES = ["ILS", "USD", "EUR", "CNY", "GBP"];

export function ExamplePriceMark({ count }: { count: number }) {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  if (count <= 0) return null;
  if (count === 1) return <em className="is-example">{t.exampleTotalOne}</em>;
  return (
    <em className="is-example">
      {t.exampleIncludes} <bdi dir="ltr">{formatCount(count, lang)}</bdi> {t.exampleTotalMany}
    </em>
  );
}

export function PartialMark({ count }: { count: number }) {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  if (count <= 0) return null;
  return (
    <em className="is-partial">
      {t.excluding}{" "}
      {count === 1 ? t.unpricedOne : <><bdi dir="ltr">{formatCount(count, lang)}</bdi> {t.unpricedMany}</>}
    </em>
  );
}

export function PriceTag({ price, compact = false }: { price: ResolvedPrice | null; compact?: boolean }) {
  const lang = useLab((s) => s.lang);
  const quantity = useLab((s) => s.brief.quantity);
  const t = tx(lang);
  if (!price) return <span className={compact ? "price-tag is-compact" : "price-tag"}><em>{t.noPrice}</em></span>;
  return (
    <span className={compact ? "price-tag is-compact" : "price-tag"}>
      <bdi dir="ltr">{formatMoney(price.value, price.currency, lang)}</bdi>
      {price.converted && price.ils != null && <bdi className="price-ils" dir="ltr">≈ {formatMoney(price.ils, "ILS", lang)}</bdi>}
      {price.source === "example" && <em>{t.examplePrice}</em>}
      {price.source === "import" && <em>{t.importedPrice}</em>}
      {price.source === "user" && !compact && <em>{t.userPrice}</em>}
      {price.currency !== "ILS" && !price.converted && <em>{t.notInTotal}</em>}
      {price.converted && <em>{t.converted}</em>}
      {!quantity && price.tiers?.length ? <em>{t.basePriceNote}</em> : null}
      {price.moq != null && <em>{t.moqShort} <bdi dir="ltr">{formatCount(price.moq, lang)}</bdi></em>}
      {quantityBelowMoq(quantity, price.moq) && <em className="is-warn">{t.belowMoq}</em>}
      {price.quotedAt ? <em className="quoted-at">{t.quotedAt} <bdi dir="ltr">{formatQuoteDate(price.quotedAt, lang)}</bdi></em> : null}
    </span>
  );
}

export function PartPriceEditor({ kind, partId }: { kind: VariantPart; partId: string }) {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const rates = useLab((s) => s.exchangeRates);
  const override = useLab((s) => s.priceOverrides[partId]);
  const setPriceOverride = useLab((s) => s.setPriceOverride);
  const setExchangeRate = useLab((s) => s.setExchangeRate);
  const { priceFor } = useBudgetModel();
  const price = priceFor(kind, partId);
  const currency = price?.currency ?? "ILS";
  const options = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES];
  return (
    <div className="price-editor" data-part-price>
      <div className="price-editor-head">
        <h3>{t.partPrice}</h3>
        <PriceTag price={price} />
      </div>
      <div className="price-editor-row">
        <label>
          <span>{t.partPrice}</span>
          <input
            type="number"
            dir="ltr"
            min={0.01}
            step={0.5}
            value={price ? (Number.isInteger(price.value) ? String(price.value) : price.value.toFixed(2)) : ""}
            onChange={(event) => {
              if (event.target.value === "") {
                setPriceOverride(partId, { absent: true });
                return;
              }
              const next = Number(event.target.value);
              if (!Number.isFinite(next) || next <= 0) return;
              setPriceOverride(partId, { value: next, currency });
            }}
          />
        </label>
        <label>
          <span>{t.currency}</span>
          <select value={currency} onChange={(event) => {
            if (!price) return;
            setPriceOverride(partId, { value: price.value, currency: event.target.value });
          }}>
            {options.map((code) => (
              <option key={code} value={code}>{code === "ILS" ? "₪ ILS" : code}</option>
            ))}
          </select>
        </label>
      </div>
      {override && (
        <button type="button" className="text-btn" onClick={() => setPriceOverride(partId, null)}>{t.resetPrice}</button>
      )}
      {currency !== "ILS" && (
        <>
          <label className="price-editor-row">
            <span>{t.rateFor} <bdi dir="ltr">1 {currency}</bdi></span>
            <input
              type="number"
              dir="ltr"
              min={0}
              step={0.01}
              placeholder="₪"
              value={rates[currency] ?? ""}
              onChange={(event) => {
                const next = event.target.value === "" ? null : Number(event.target.value);
                setExchangeRate(currency, next);
              }}
            />
          </label>
          <p className="hint">{t.rateHint}</p>
        </>
      )}
    </div>
  );
}
