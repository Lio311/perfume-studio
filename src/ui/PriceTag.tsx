import { formatMoney, type ResolvedPrice } from "../budget/money.ts";
import { tx } from "../i18n/copy.ts";
import type { VariantPart } from "../model/types.ts";
import { useLab } from "../store/labStore.ts";
import { useBudgetModel } from "./useBudget.ts";

const CURRENCIES = ["ILS", "USD", "EUR", "CNY", "GBP"];

export function PriceTag({ price, compact = false }: { price: ResolvedPrice; compact?: boolean }) {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  return (
    <span className={compact ? "price-tag is-compact" : "price-tag"}>
      <bdi dir="ltr">{formatMoney(price.value, price.currency, lang)}</bdi>
      {price.converted && price.ils != null && <bdi className="price-ils" dir="ltr">≈ {formatMoney(price.ils, "ILS", lang)}</bdi>}
      {price.source === "example" && <em>{t.examplePrice}</em>}
      {price.source === "import" && <em>{t.importedPrice}</em>}
      {price.source === "user" && !compact && <em>{t.userPrice}</em>}
      {price.currency !== "ILS" && !price.converted && <em>{t.notInTotal}</em>}
      {price.converted && <em>{t.converted}</em>}
      {price.moq ? <em dir="ltr">{t.moqShort} {price.moq}</em> : null}
      {price.quotedAt ? <em className="quoted-at">{t.quotedAt} <bdi dir="ltr">{price.quotedAt}</bdi></em> : null}
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
  if (!price) return null;
  const currency = price.currency;
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
            value={Number.isInteger(price.value) ? String(price.value) : price.value.toFixed(2)}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next) || next <= 0) return;
              setPriceOverride(partId, { value: next, currency });
            }}
          />
        </label>
        <label>
          <span>{t.currency}</span>
          <select value={currency} onChange={(event) => setPriceOverride(partId, { value: price.value, currency: event.target.value })}>
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
            <span>{t.rateFor} 1 {currency}</span>
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
