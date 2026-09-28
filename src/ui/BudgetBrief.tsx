import { useEffect, useState } from "react";
import { formatMoney } from "../budget/money.ts";
import { tx } from "../i18n/copy.ts";
import { useLab } from "../store/labStore.ts";

const BUDGETS = [30, 60, 120, 200];
const VOLUMES = [30, 50, 100];

export function BudgetBrief() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const brief = useLab((s) => s.brief);
  const editing = useLab((s) => s.briefEditing);
  const setBrief = useLab((s) => s.setBrief);
  const confirmBrief = useLab((s) => s.confirmBrief);
  const closeBrief = useLab((s) => s.closeBrief);
  const [hydrated, setHydrated] = useState(() => useLab.persist.hasHydrated());

  useEffect(() => {
    if (hydrated) return undefined;
    return useLab.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);

  if (!hydrated || (brief.confirmed && !editing)) return null;

  return (
    <div className="modal-back" data-budget-brief>
      <form
        className="modal budget-brief"
        dir={lang === "he" ? "rtl" : "ltr"}
        onSubmit={(event) => {
          event.preventDefault();
          confirmBrief();
        }}
      >
        <header>
          <h2>{t.briefTitle}</h2>
          {brief.confirmed && (
            <button type="button" onClick={() => closeBrief()} aria-label={t.close}>×</button>
          )}
        </header>
        <p className="hint">{t.briefLead}</p>
        <label className="brief-field">
          <span>{t.briefBudget}</span>
          <span className="brief-unit" dir="ltr">₪</span>
          <input
            type="number"
            dir="ltr"
            min={1}
            step={1}
            value={brief.ceilingIls}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) setBrief({ ceilingIls: next });
            }}
          />
        </label>
        <div className="brief-presets">
          {BUDGETS.map((amount) => (
            <button key={amount} type="button" className={brief.ceilingIls === amount ? "is-on" : ""} onClick={() => setBrief({ ceilingIls: amount })}>
              <bdi dir="ltr">{formatMoney(amount, "ILS", lang)}</bdi>
            </button>
          ))}
        </div>
        <label className="brief-field">
          <span>{t.briefVolume}</span>
          <span className="brief-unit">{t.capacityShort}</span>
          <input
            type="number"
            dir="ltr"
            min={1}
            step={1}
            value={brief.volumeMl}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) setBrief({ volumeMl: next });
            }}
          />
        </label>
        <div className="brief-presets">
          {VOLUMES.map((amount) => (
            <button key={amount} type="button" className={brief.volumeMl === amount ? "is-on" : ""} onClick={() => setBrief({ volumeMl: amount })}>
              <bdi dir="ltr">{amount} {t.capacityShort}</bdi>
            </button>
          ))}
        </div>
        <label className="brief-field">
          <span>{t.briefQuantity}</span>
          <input
            type="number"
            dir="ltr"
            min={1}
            step={1}
            placeholder={t.briefQuantityPh}
            value={brief.quantity ?? ""}
            onChange={(event) => {
              if (event.target.value === "") {
                setBrief({ quantity: null });
                return;
              }
              const next = Number(event.target.value);
              if (Number.isInteger(next) && next >= 1) setBrief({ quantity: next });
            }}
          />
        </label>
        <p className="hint">{brief.quantity ? t.briefQuantityOn : t.basePriceNote}</p>
        <p className="hint">{t.briefNote}</p>
        <div className="modal-actions">
          {brief.confirmed && <button type="button" onClick={() => closeBrief()}>{t.briefCancel}</button>}
          <button type="submit" className="is-primary">{brief.confirmed ? t.briefUpdate : t.briefStart}</button>
        </div>
      </form>
    </div>
  );
}
