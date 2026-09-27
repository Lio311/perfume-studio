import { bottleById, capById } from "../model/catalog.ts";
import { tx } from "../i18n/copy.ts";
import { thumbFor } from "../thumbnails/thumbs.ts";
import { useLab } from "../store/labStore.ts";

export function CompareBoard() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const saved = useLab((s) => s.saved);
  const compareIds = useLab((s) => s.compareIds);
  const toggleCompare = useLab((s) => s.toggleCompare);
  const loadDesign = useLab((s) => s.loadDesign);
  const setMode = useLab((s) => s.setMode);
  const chosen = saved.filter((item) => compareIds.includes(item.id)).slice(0, 3);
  return (
    <section className="panel compare-stage" dir={lang === "he" ? "rtl" : "ltr"}>
      <h2>{t.compareTitle}</h2>
      <p className="hint">{t.compareHint}</p>
      <div className="compare-picks">
        {saved.map((item) => (
          <label key={item.id}>
            <input type="checkbox" checked={compareIds.includes(item.id)} onChange={() => toggleCompare(item.id)} />
            {item.name}
          </label>
        ))}
      </div>
      {chosen.length < 2 ? <p className="hint">{t.compareNeed}</p> : (
        <div className="compare-row">
          {chosen.map((item) => {
            const bottle = bottleById(item.design.bottle.variantId);
            const cap = capById(item.design.cap.variantId);
            return (
              <article key={item.id}>
                <img src={item.thumb || thumbFor("bottle", item.design.bottle.variantId)} alt="" />
                <h3>{item.name}</h3>
                <ul>
                  <li>{bottle.name[lang]}</li>
                  <li>{cap.name[lang]}</li>
                  <li dir="ltr">{item.design.bottle.neck} · {item.design.bottle.heightMm.toFixed(1)}×{item.design.bottle.widthMm.toFixed(1)}×{item.design.bottle.depthMm.toFixed(1)}</li>
                </ul>
                <button type="button" onClick={() => { loadDesign(item.id); setMode("assemble"); }}>{t.load}</button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
