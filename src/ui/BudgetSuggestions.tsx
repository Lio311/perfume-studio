import { formatMoney, formatSigned } from "../budget/money.ts";
import { partLabel, tx } from "../i18n/copy.ts";
import type { Lang, VariantPart } from "../model/types.ts";
import { markSwap } from "../scene/focusClick.ts";
import { useLab } from "../store/labStore.ts";
import { useBudgetModel } from "./useBudget.ts";

function DeltaLine({
  delta,
  lang,
  width,
  height,
  depth,
  label,
}: {
  delta: { width: number; height: number; depth: number; rss: number };
  lang: Lang;
  width: string;
  height: string;
  depth: string;
  label: string;
}) {
  const unit = lang === "he" ? "מ״מ" : "mm";
  return (
    <span className="delta-line">
      {label} <bdi dir="ltr">{delta.rss} {unit}</bdi>
      {" · "}
      {width} <bdi dir="ltr">{formatSigned(delta.width)}</bdi>
      {" · "}
      {height} <bdi dir="ltr">{formatSigned(delta.height)}</bdi>
      {" · "}
      {depth} <bdi dir="ltr">{formatSigned(delta.depth)}</bdi>
    </span>
  );
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
              <span><bdi dir="ltr">{formatMoney(row.priceIls, "ILS", lang)}</bdi> · {t.similarity} <bdi dir="ltr">{Math.round(row.score * 100)}%</bdi></span>
              <DeltaLine delta={row.delta} lang={lang} width={t.width} height={t.height} depth={t.depth} label={t.dimDelta} />
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
                <DeltaLine delta={row.delta} lang={lang} width={t.width} height={t.height} depth={t.depth} label={t.dimDelta} />
                <span>{t.priceDelta} <bdi dir="ltr">{formatMoney(row.currentPriceIls, "ILS", lang)} → {formatMoney(row.priceIls, "ILS", lang)}</bdi></span>
                <span className="saving">{t.savingAmount} <bdi dir="ltr">{formatMoney(row.savingIls, "ILS", lang)}</bdi></span>
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
