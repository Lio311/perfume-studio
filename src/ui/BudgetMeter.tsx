import { formatCount, formatMoney } from "../budget/money.ts";
import { tx } from "../i18n/copy.ts";
import { useLab } from "../store/labStore.ts";
import { ExamplePriceMark, PartialMark } from "./PriceTag.tsx";
import { useBudgetModel } from "./useBudget.ts";

export function BudgetMeter({ onSavings }: { onSavings: () => void }) {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const brief = useLab((s) => s.brief);
  const openBrief = useLab((s) => s.openBrief);
  const rates = useLab((s) => s.exchangeRates);
  const setExchangeRate = useLab((s) => s.setExchangeRate);
  const { summary, foreign, exampleCount } = useBudgetModel();
  if (!brief.confirmed) return null;
  const ratio = brief.ceilingIls > 0 ? Math.min(1, summary.totalIls / brief.ceilingIls) : 0;
  const over = summary.over;
  return (
    <aside className={over ? "budget-meter is-over" : "budget-meter"} data-budget-meter data-over={over ? "true" : "false"} dir={lang === "he" ? "rtl" : "ltr"}>
      <div className="budget-meter-top">
        <strong>{t.budgetMeter}</strong>
        <span className={summary.unpricedCount > 0 ? "is-partial" : undefined}>
          <bdi dir="ltr">{formatMoney(summary.totalIls, "ILS", lang)} / {formatMoney(brief.ceilingIls, "ILS", lang)}</bdi>
          <PartialMark count={summary.unpricedCount} />
        </span>
      </div>
      <div className="budget-bar" aria-hidden="true"><i style={{ width: `${over ? 100 : ratio * 100}%` }} /></div>
      <div className="budget-meter-top">
        <span>{over ? t.budgetOver : t.budgetLeft}</span>
        <span className={summary.unpricedCount > 0 ? "is-partial" : undefined}>
          <bdi dir="ltr">{formatMoney(Math.abs(summary.remainingIls), "ILS", lang)}</bdi>
          <PartialMark count={summary.unpricedCount} />
        </span>
      </div>
      <p className="hint">
        {t.budgetUsed} · {brief.volumeMl} {t.capacityShort}
        {brief.quantity ? <> · {t.briefQuantity} <bdi dir="ltr">{formatCount(brief.quantity, lang)}</bdi></> : ` · ${t.basePriceNote}`}
        {exampleCount > 0 && <> · <ExamplePriceMark count={exampleCount} /></>}
        {summary.incomplete ? ` · ${t.budgetPartial}` : ""}
      </p>
      {foreign.map((code) => (
        <label key={code} className="budget-rate">
          <span>{t.rateFor} 1 {code}</span>
          <input
            type="number"
            dir="ltr"
            min={0}
            step={0.01}
            placeholder="₪"
            value={rates[code] ?? ""}
            onChange={(event) => setExchangeRate(code, event.target.value === "" ? null : Number(event.target.value))}
          />
        </label>
      ))}
      <div className="budget-meter-actions">
        <button type="button" onClick={() => openBrief()}>{t.editBrief}</button>
        <button type="button" onClick={onSavings}>{t.savingsOpen}</button>
      </div>
    </aside>
  );
}
