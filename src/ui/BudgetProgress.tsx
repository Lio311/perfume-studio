import { formatMoney } from "../budget/money.ts";
import { tx } from "../i18n/copy.ts";
import { useLab } from "../store/labStore.ts";
import { useBudgetModel } from "./useBudget.ts";

export function BudgetProgress() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const brief = useLab((s) => s.brief);
  const openBrief = useLab((s) => s.openBrief);
  const { summary } = useBudgetModel();

  if (!brief.confirmed) return null;

  const ratio = brief.ceilingIls > 0 ? Math.min(1, summary.totalIls / brief.ceilingIls) : 0;
  const over = summary.over;

  return (
    <div className="budget-progress-panel panel" dir={lang === "he" ? "rtl" : "ltr"} style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", alignItems: "baseline" }}>
        <strong>{t.budgetMeter}</strong>
        <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
          <span>
            <bdi dir="ltr">{formatMoney(summary.totalIls, "ILS", lang)} / {formatMoney(brief.ceilingIls, "ILS", lang)}</bdi>
          </span>
          <button type="button" className="icon-btn" style={{ padding: 2, background: 'none' }} onClick={() => openBrief()} aria-label={t.editBrief}>
            ✎
          </button>
        </div>
      </div>
      <div className="budget-bar" aria-hidden="true" style={{ background: "rgba(255, 255, 255, 0.08)", height: "6px", borderRadius: "99px", overflow: "hidden" }}>
        <i style={{ width: `${over ? 100 : ratio * 100}%`, background: over ? "var(--danger)" : "var(--accent)", display: "block", height: "100%" }} />
      </div>
    </div>
  );
}
