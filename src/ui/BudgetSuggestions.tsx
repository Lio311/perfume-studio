import { formatMoney, formatSigned } from "../budget/money.ts";
import { partLabel, tx } from "../i18n/copy.ts";
import type { Lang, VariantPart } from "../model/types.ts";
import { markSwap } from "../scene/focusClick.ts";
import { useLab } from "../store/labStore.ts";
import { useBudgetModel } from "./useBudget.ts";

function deltaLine(delta: { width: number; height: number; depth: number; rss: number }, lang: Lang, width: string, height: string, depth: string): string {
  const unit = lang === "he" ? "מ״מ" : "mm";
  return `${delta.rss} ${unit} · ${width} ${formatSigned(delta.width)} · ${height} ${formatSigned(delta.height)} · ${depth} ${formatSigned(delta.depth)}`;
}

export function Alternatives() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const applyCommands = useLab((s) => s.applyCommands);
  const { summary, alternatives } = useBudgetModel();
  const selected = useLab((s) => s.selected);
  if (!summary.over || !selected || selected === "liquid") return null;
  return (
    <section className="suggest-block is-over" data-alternatives data-budget-over="true">
      <h3>{t.alternativesTitle}</h3>
      <p className="hint">{t.alternativesLead}</p>
      {alternatives.length === 0 && <p className="hint">{t.alternativesEmpty}</p>}
      <div className="suggest-list">
        {alternatives.map((row) => (
          <article key={row.part.id} className="suggest-card">
            <div>
              <strong>{lang === "he" ? row.part.nameHe : row.part.nameEn}</strong>
              <span>{row.part.supplierName || (lang === "he" ? "קטלוג המעבדה" : "Lab catalog")}</span>
              <bdi dir="ltr">{formatMoney(row.priceIls, "ILS", lang)} · {t.similarity} {Math.round(row.score * 100)}%</bdi>
              <bdi dir="ltr">{t.dimDelta} {deltaLine(row.delta, lang, t.width, t.height, t.depth)}</bdi>
            </div>
            <button
              type="button"
              onClick={() => {
                applyCommands([{ type: "variant", part: selected, id: row.part.id }, { type: "select", part: selected }], { quiet: true });
                markSwap(selected);
              }}
            >
              {t.swapIn}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function SavingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const applyCommands = useLab((s) => s.applyCommands);
  const { savings } = useBudgetModel();
  if (!open) return null;
  return (
    <div className="modal-back" data-savings>
      <section className="modal budget-savings" dir={lang === "he" ? "rtl" : "ltr"}>
        <header>
          <h2>{t.savingsTitle}</h2>
          <button type="button" onClick={onClose} aria-label={t.close}>×</button>
        </header>
        <p className="hint">{t.savingsLead}</p>
        {savings.length === 0 && <p className="hint">{t.savingsEmpty}</p>}
        <div className="suggest-list">
          {savings.map((row) => (
            <article key={`${row.from.id}-${row.to.id}`} className="suggest-card">
              <div>
                <span className="eyebrow">{partLabel[lang][row.from.kind]}</span>
                <strong>{lang === "he" ? row.from.nameHe : row.from.nameEn} → {lang === "he" ? row.to.nameHe : row.to.nameEn}</strong>
                <span>{row.to.supplierName || (lang === "he" ? "קטלוג המעבדה" : "Lab catalog")}</span>
                <bdi dir="ltr">{t.dimDelta} {deltaLine(row.delta, lang, t.width, t.height, t.depth)}</bdi>
                <bdi dir="ltr">{t.priceDelta} {formatMoney(row.currentPriceIls, "ILS", lang)} → {formatMoney(row.priceIls, "ILS", lang)}</bdi>
                <bdi className="saving" dir="ltr">{t.savingAmount} {formatMoney(row.savingIls, "ILS", lang)}</bdi>
              </div>
              <button
                type="button"
                onClick={() => {
                  const kind: VariantPart = row.from.kind;
                  applyCommands([{ type: "variant", part: kind, id: row.to.id }, { type: "select", part: kind }], { quiet: true });
                  markSwap(kind);
                }}
              >
                {t.swapIn}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
