import { useMemo, useState } from "react";
import { partLabel, tx } from "../i18n/copy.ts";
import { CATALOG_COUNTS, listFor } from "../model/catalog.ts";
import { LIQUID_PALETTE } from "../model/materials.ts";
import type { VariantPart } from "../model/types.ts";
import { useLab } from "../store/labStore.ts";
import { thumbFor } from "../thumbnails/thumbs.ts";

const TABS: Array<VariantPart | "liquid" | "pending"> = ["bottle", "cap", "label", "pump", "collar", "box", "liquid", "pending"];

export function Library() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const open = useLab((s) => s.libraryOpen);
  const design = useLab((s) => s.design);
  const pending = useLab((s) => s.pending);
  const select = useLab((s) => s.select);
  const applyCommands = useLab((s) => s.applyCommands);
  const patch = useLab((s) => s.patch);
  const setModal = useLab((s) => s.setModal);
  const randomize = useLab((s) => s.randomize);
  const removePending = useLab((s) => s.removePending);
  const [tab, setTab] = useState<(typeof TABS)[number]>("bottle");
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    if (tab === "liquid" || tab === "pending") return [];
    const q = query.trim().toLowerCase();
    return listFor(tab).filter((item) => !q || `${item.he} ${item.en} ${item.id} ${item.tags.join(" ")}`.toLowerCase().includes(q));
  }, [tab, query]);

  const activeId =
    tab === "bottle" ? design.bottle.variantId :
    tab === "cap" ? design.cap.variantId :
    tab === "label" ? design.label.variantId :
    tab === "pump" ? design.pump.variantId :
    tab === "collar" ? design.collar.variantId :
    tab === "box" ? design.box.variantId :
    "";

  return (
    <aside className={`panel library ${open ? "is-open" : ""}`} dir={lang === "he" ? "rtl" : "ltr"}>
      <div className="panel-head">
        <h2>{t.library}</h2>
        <span className="count">{tab in CATALOG_COUNTS ? CATALOG_COUNTS[tab as VariantPart] : tab === "pending" ? pending.length : LIQUID_PALETTE.length}</span>
        <button type="button" className="text-btn" onClick={() => randomize()}>{t.random}</button>
      </div>
      <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} />
      <div className="tabs" role="tablist">
        {TABS.map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "is-on" : ""} onClick={() => setTab(key)}>
            {key === "pending" ? t.pending : key === "liquid" ? partLabel[lang].liquid : partLabel[lang][key]}
          </button>
        ))}
      </div>
      {tab === "liquid" ? (
        <div className="swatches liquid-swatches">
          {LIQUID_PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              className={design.liquid.color.toLowerCase() === color ? "swatch is-on" : "swatch"}
              style={{ background: color }}
              onClick={() => {
                patch("liquid", { color, visible: true });
                select("liquid");
              }}
            />
          ))}
        </div>
      ) : tab === "pending" ? (
        <div className="pending-list">
          <p className="hint">{t.pendingNote}</p>
          {pending.length === 0 && <p className="hint">{t.pendingEmpty}</p>}
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
        <div className="thumb-grid">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === activeId ? "thumb is-on" : "thumb"}
              onClick={() => applyCommands([{ type: "variant", part: tab, id: item.id }, { type: "select", part: tab }])}
            >
              <img src={thumbFor(tab, item.id, design.label.text)} alt="" />
              <span>{lang === "he" ? item.he : item.en}</span>
              {item.mm && <bdi className="mm" dir="ltr">{item.mm}</bdi>}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="upload-btn" onClick={() => setModal("upload")}>
        {t.upload}
      </button>
    </aside>
  );
}
