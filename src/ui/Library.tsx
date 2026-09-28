import { useEffect, useMemo, useRef, useState } from "react";
import { partLabel, tx } from "../i18n/copy.ts";
import { capPackNotices } from "../import/notices.ts";
import { downloadPack } from "../import/supplierDb.ts";
import { normalizeCurrency } from "../model/price.ts";
import { isVariantPart } from "../import/registry.ts";
import { entryMatches, listFor } from "../model/catalog.ts";
import { formatSupplierAmount } from "../model/price.ts";
import { markSwap } from "../scene/focusClick.ts";
import { LIQUID_PALETTE } from "../model/materials.ts";
import type { VariantPart } from "../model/types.ts";
import { historyWizardStep } from "../nav/backHistory.ts";
import { useLab } from "../store/labStore.ts";
import { thumbFor } from "../thumbnails/thumbs.ts";

const TABS: Array<VariantPart | "liquid" | "pending"> = ["bottle", "cap", "label", "pump", "collar", "box", "liquid", "pending"];
const WIZARD_ORDER: Array<VariantPart | "liquid"> = ["bottle", "liquid", "pump", "collar", "cap", "label", "box"];

const CAP_CATS: Array<{ id: string; label: "catAll" | "catZamac" | "catSurlyn" | "catWood" | "catAcrylic" | "catMagnetic" | "catSculptural" | "catMinimal"; tags: string[] }> = [
  { id: "all", label: "catAll", tags: [] },
  { id: "zamac", label: "catZamac", tags: ["zamac", "זמק"] },
  { id: "surlyn", label: "catSurlyn", tags: ["surlyn", "סורלין"] },
  { id: "wood", label: "catWood", tags: ["wood", "עץ"] },
  { id: "acrylic", label: "catAcrylic", tags: ["acrylic", "אקריליק", "crystal"] },
  { id: "magnetic", label: "catMagnetic", tags: ["magnetic", "מגנטי"] },
  { id: "sculptural", label: "catSculptural", tags: ["sculptural", "פיסולי"] },
  { id: "minimal", label: "catMinimal", tags: ["minimal", "מינימל"] },
];

function tabForWizardStep(step: number): (typeof TABS)[number] {
  if (step >= 0 && step < WIZARD_ORDER.length) return WIZARD_ORDER[step];
  return "bottle";
}

function moveWizardStep(step: number) {
  const design = useLab.getState().design;
  useLab.setState({ design: { ...design, step } });
  if (step < 7) useLab.getState().setStage(step === 6 ? "box" : "bottle");
}

export function Library() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const open = useLab((s) => s.libraryOpen);
  const design = useLab((s) => s.design);
  const pending = useLab((s) => s.pending);
  const applyCommands = useLab((s) => s.applyCommands);
  const patch = useLab((s) => s.patch);
  const setModal = useLab((s) => s.setModal);
  const randomize = useLab((s) => s.randomize);
  const removePending = useLab((s) => s.removePending);
  const suppliers = useLab((s) => s.suppliers);
  const packNotices = useLab((s) => s.packNotices);
  const removeSupplier = useLab((s) => s.removeSupplier);
  const selected = useLab((s) => s.selected);
  const focusToken = useLab((s) => s.focusToken);
  const [tab, setTab] = useState<(typeof TABS)[number]>(() => tabForWizardStep(useLab.getState().design.step ?? 7));
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [supplier, setSupplier] = useState("all");
  const gridRef = useRef<HTMLDivElement>(null);
  const tabRef = useRef(tab);
  
  const wizardStep = design.step ?? 7;
  const isWizard = wizardStep < 7;
  const activeTabs = isWizard ? [...WIZARD_ORDER.slice(0, wizardStep + 1), "pending" as const] : TABS;
  const visibleTab = isWizard ? tabForWizardStep(wizardStep) : tab;

  tabRef.current = tab;

  useEffect(() => {
    if (!isWizard) return;
    const next = WIZARD_ORDER[wizardStep];
    if (!next || tabRef.current === next) return;
    setQuery("");
    setCat("all");
    setSupplier("all");
    setTab(next);
  }, [isWizard, wizardStep]);

  useEffect(() => {
    if (!selected || isWizard) return;
    const next = selected === "liquid" ? "liquid" : selected;
    if (tabRef.current !== next) {
      setQuery("");
      setCat("all");
      setSupplier("all");
    }
    setTab(next);
  }, [selected, focusToken, isWizard]);

  const items = useMemo(() => {
    if (visibleTab === "liquid" || visibleTab === "pending") return [];
    const q = query.trim().toLowerCase();
    const family = CAP_CATS.find((entry) => entry.id === cat);
    return listFor(visibleTab).filter((item) => {
      if (supplier !== "all" && !item.tags.includes(`supplier:${supplier}`)) return false;
      if (q && !entryMatches(item, q)) return false;
      if (q || visibleTab !== "cap" || !family || family.tags.length === 0) return true;
      return family.tags.some((tag) => item.tags.includes(tag));
    });
  }, [visibleTab, query, cat, supplier, suppliers]);

  const activeId =
    visibleTab === "bottle" ? design.bottle.variantId :
    visibleTab === "cap" ? design.cap.variantId :
    visibleTab === "label" ? design.label.variantId :
    visibleTab === "pump" ? design.pump.variantId :
    visibleTab === "collar" ? design.collar.variantId :
    visibleTab === "box" ? design.box.variantId :
    "";

  useEffect(() => {
    const on = gridRef.current?.querySelector(".thumb.is-on, .swatch.is-on");
    on?.scrollIntoView({ block: "nearest", inline: "nearest" });
    document.querySelector(`.library [data-part="${visibleTab}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [visibleTab, activeId, items, focusToken]);


  return (
    <aside className={`panel library ${open ? "is-open" : ""}`} dir={lang === "he" ? "rtl" : "ltr"}>
      <div className="panel-head">
        <h2>
          {t.library}
          <span className="count" style={{ marginInlineStart: "8px", fontWeight: "normal" }}>
            ({visibleTab === "pending" ? pending.length + suppliers.reduce((sum, pack) => sum + pack.parts.length + (pack.hiddenParts?.length ?? 0), 0) : visibleTab === "liquid" ? LIQUID_PALETTE.length : items.length})
          </span>
        </h2>
        <button type="button" className="library-close" onClick={() => useLab.getState().setLibraryOpen(false)} aria-label={t.close}>×</button>
        <button type="button" className="text-btn" onClick={() => randomize()}>{t.random}</button>
      </div>
      {packNotices.length > 0 && (
        <div className="pack-warnings-wrap">
          <ul className="pack-warnings" role="status">
            {capPackNotices(packNotices, lang).map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
          <button type="button" className="text-btn" onClick={() => useLab.getState().dismissPackNotices()}>{t.close}</button>
        </div>
      )}
      {visibleTab !== "liquid" && visibleTab !== "pending" && (
        <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} />
      )}
      {query.trim() && visibleTab !== "liquid" && visibleTab !== "pending" && (
        <p className="hint">{lang === "he" ? `${items.length} תואמים ל-${query.trim()}` : `${items.length} match ${query.trim()}`}</p>
      )}
      {!isWizard && (
        <div className="tabs" role="tablist">
          {activeTabs.map((key) => (
            <button key={key} type="button" role="tab" data-part={key} aria-selected={tab === key} className={tab === key ? "is-on" : ""} onClick={() => {
              setTab(key);
              if (isWizard && key !== "pending") {
                useLab.getState().setStage(key === "box" ? "box" : "bottle");
              }
            }}>
              {key === "pending" ? t.pending : key === "liquid" ? partLabel[lang].liquid : partLabel[lang][key]}
            </button>
          ))}
        </div>
      )}
      {suppliers.length > 0 && visibleTab !== "liquid" && visibleTab !== "pending" && (
        <div className="supplier-row">
          <button type="button" className={supplier === "all" ? "is-on" : ""} onClick={() => setSupplier("all")}>{t.supplierAll}</button>
          {suppliers.map((pack) => (
            <button key={pack.id} type="button" className={supplier === pack.id ? "is-on" : ""} data-supplier={pack.id} onClick={() => setSupplier(pack.id)}>
              {pack.name}
            </button>
          ))}
          {supplier !== "all" && (
            <>
              <button type="button" onClick={() => {
                const pack = suppliers.find((item) => item.id === supplier);
                if (pack) {
                  const warnings = downloadPack(pack);
                  if (warnings.length) useLab.getState().showPackNotices(warnings);
                }
              }}>{t.exportPack}</button>
              <button type="button" onClick={() => { removeSupplier(supplier); setSupplier("all"); }}>{t.removeSupplier}</button>
            </>
          )}
        </div>
      )}
      {visibleTab === "cap" && (
        <div className="cat-row" role="tablist">
          {CAP_CATS.map((entry) => (
            <button key={entry.id} type="button" className={cat === entry.id ? "is-on" : ""} onClick={() => setCat(entry.id)}>
              {t[entry.label]}
            </button>
          ))}
        </div>
      )}
      {visibleTab === "label" && (
        <input className="search" style={{ marginTop: "-8px", marginBottom: "12px" }} value={design.label.text} placeholder={t.brand} onChange={(event) => patch("label", { text: event.target.value.slice(0, 32), visible: true })} />
      )}
      {visibleTab === "liquid" ? (
        <div className="liquid-panel" style={{ padding: "32px 16px", textAlign: "center" }}>
          <p style={{ color: "var(--text-dim)", marginBottom: "16px" }}>
            {lang === "he" 
              ? "בחרו מאפייני צבע ואטימות בחלונית המאפיינים מימין."
              : "Select color and opacity in the properties panel on the right."}
          </p>
          {!design.liquid.visible && (
            <button 
              type="button" 
              className="text-btn" 
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}
              onClick={() => {
                patch("liquid", { visible: true });
                useLab.getState().select("liquid");
              }}
            >
              {lang === "he" ? "הוסף נוזל" : "Add Liquid"}
            </button>
          )}
        </div>
      ) : visibleTab === "pending" ? (
        <div className="pending-list">
          <p className="hint">{t.pendingNote}</p>
          {pending.length === 0 && suppliers.every((pack) => pack.parts.length === 0 && !(pack.hiddenParts?.length)) && <p className="hint">{t.pendingEmpty}</p>}
          {suppliers.flatMap((pack) => (pack.hiddenParts ?? []).map((part) => {
            const reason = lang === "he" ? part.he : part.en;
            const q = query.trim().toLowerCase();
            const hay = `${part.name} ${part.code} ${pack.name} ${reason}`.toLowerCase();
            if (q && !hay.includes(q) && !hay.replace(/\s+/g, "").includes(q.replace(/\s+/g, ""))) return [];
            return (
              <article key={`${pack.id}-${part.id}`} className="pending-card" data-hidden-part>
                <div>
                  <strong><bdi>{part.name || part.code || part.id}</bdi></strong>
                  <span className="hidden-reason">{reason}</span>
                </div>
              </article>
            );
          }))}
          {suppliers.flatMap((pack) => pack.parts.flatMap((part) => {
            const kind: unknown = part.kind;
            const q = query.trim().toLowerCase();
            if (!isVariantPart(kind)) return [];
            const priced = part.price?.currency ? normalizeCurrency(part.price.currency) : null;
            if (q) {
              const hay = `${part.name} ${part.code} ${pack.name} ${part.neck ?? ""} ${part.widthMm} ${part.heightMm}`.toLowerCase();
              if (!hay.includes(q) && !hay.replace(/\s+/g, "").includes(q.replace(/\s+/g, ""))) return [];
            }
            return [(
              <article key={part.id} className="pending-card">
                {part.thumb && <img src={part.thumb} alt="" />}
                <div>
                  <strong>{part.name}</strong>
                  <span>{pack.name}{part.lathe ? "" : ` · ${t.tempShape}`} · {part.price ? <bdi dir="ltr">{formatSupplierAmount(part.price.value, priced ?? undefined, lang)}</bdi> : t.noPrice}</span>
                </div>
                <button type="button" onClick={() => {
                  applyCommands([{ type: "variant", part: kind, id: part.id }]);
                  markSwap(kind);
                }}>{t.replace}</button>
              </article>
            )];
          }))}
          {pending.map((item) => (
            <article key={item.id} className="pending-card">
              {item.files[0]?.thumb && <img src={item.files[0].thumb} alt="" />}
              <div>
                <strong>{item.name}</strong>
                <span>{item.files.length} · {t.pending}</span>
              </div>
              <button type="button" onClick={() => removePending(item.id)}>{t.delete}</button>
            </article>
          ))}
        </div>
      ) : (
        <div ref={gridRef} className="thumb-grid">
          {items.length === 0 && supplier !== "all" && <p className="hint">{t.importedEmpty}</p>}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === activeId ? "thumb is-on" : "thumb"}
              onClick={() => {
                applyCommands([{ type: "variant", part: visibleTab, id: item.id }]);
                markSwap(visibleTab);
              }}
            >
              <img src={thumbFor(visibleTab, item.id, design.label.text)} alt="" />
              <span>{lang === "he" ? item.he : item.en}</span>
              {item.tags.includes("placeholder") && <em className="temp-badge">{t.tempShape}</em>}
              {item.mm && <bdi className="mm" dir="ltr">{item.mm}</bdi>}
            </button>
          ))}
        </div>
      )}
      {isWizard && (
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          {wizardStep > 0 && (
            <button
              type="button"
              className="upload-btn"
              style={{ flex: 1, background: "transparent", color: "var(--text)", border: "1px solid var(--line)", fontWeight: "bold" }}
              onClick={() => {
                if (historyWizardStep(history.state) === wizardStep) {
                  history.back();
                  return;
                }
                moveWizardStep(wizardStep - 1);
              }}
            >
              {lang === "he" ? "הקודם" : "Back"}
            </button>
          )}
          {(() => {
            const canProceed = visibleTab === "pending" || (design as any)[visibleTab]?.visible === true;
            return (
              <button
                type="button"
                className="upload-btn"
                disabled={!canProceed}
                style={{ flex: 1, background: "var(--accent)", color: "var(--on-accent)", border: "1px solid var(--line)", fontWeight: "bold", margin: 0, opacity: canProceed ? 1 : 0.5, cursor: canProceed ? "pointer" : "not-allowed" }}
                onClick={() => {
                  const nextStep = wizardStep + 1;
                  if (nextStep < WIZARD_ORDER.length) {
                    moveWizardStep(nextStep);
                    return;
                  }
                  moveWizardStep(nextStep);
                  useLab.getState().setStage("together");
                  useLab.getState().setLibraryOpen(false);
                  useLab.getState().setModal("save");
                }}
              >
                {wizardStep === WIZARD_ORDER.length - 1 ? (lang === "he" ? "סיום" : "Finish") : (lang === "he" ? "לשלב הבא" : "Next")}
              </button>
            );
          })()}
        </div>
      )}
      <div className="upload-group" style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
        <button type="button" className="upload-btn" data-photo3d onClick={() => setModal("photo")}>
          {t.photo3d}
        </button>
        <button type="button" className="upload-btn" data-import-catalog onClick={() => setModal("supplier")}>
          {t.importCatalog}
        </button>
        <button type="button" className="upload-btn" onClick={() => setModal("upload")}>
          {t.addPart}
        </button>
      </div>
    </aside>
  );
}

