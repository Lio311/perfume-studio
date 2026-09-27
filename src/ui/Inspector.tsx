import { bottleById, boxById, capById, collarById, logoById, pumpById } from "../model/catalog.ts";
import { FINISHES, PALETTE } from "../model/materials.ts";
import { NECK_IDS } from "../model/necks.ts";
import type { FinishId, NeckId, PartKey } from "../model/types.ts";
import { partLabel, tx } from "../i18n/copy.ts";
import { useLab } from "../store/labStore.ts";

export function Inspector() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const open = useLab((s) => s.sideOpen);
  const design = useLab((s) => s.design);
  const selected = useLab((s) => s.selected);
  const patch = useLab((s) => s.patch);
  const cycle = useLab((s) => s.cycle);
  const part = selected;
  const name = variantName(part, design, lang);

  return (
    <section className={`panel props ${open ? "is-open" : ""}`} dir={lang === "he" ? "rtl" : "ltr"}>
      <div className="panel-head">
        <h2>{t.properties}</h2>
        <span className="hint">{t.arrows}</span>
      </div>
      {!part && <p className="empty">{t.emptySelect}</p>}
      {part && (
        <>
          <div className="part-title">
            <div>
              <span className="eyebrow">{partLabel[lang][part]}</span>
              <strong>{name}</strong>
            </div>
            {part !== "liquid" && (
              <div className="cycle-btns">
                <button type="button" onClick={() => cycle(-1, part)}>{t.prev}</button>
                <button type="button" onClick={() => cycle(1, part)}>{t.next}</button>
              </div>
            )}
          </div>
          {part !== "liquid" && (
            <>
              <h3>{t.finish}</h3>
              <div className="chips">
                {FINISHES.map((finish) => (
                  <button
                    key={finish.id}
                    type="button"
                    className={design[part].finish === finish.id ? "chip is-on" : "chip"}
                    onClick={() => patch(part, { finish: finish.id as FinishId, color: finish.color })}
                  >
                    <i style={{ background: finish.color }} />
                    {finish.name[lang]}
                  </button>
                ))}
              </div>
            </>
          )}
          <h3>{t.color}</h3>
          <div className="swatches">
            {(part === "liquid" ? ["#e2a24a", "#f3c9d6", "#f7f1e4", "#7a1f2c", "#c4783a", "#d8efe4", "#1a1a1a", "#6e857c"] : PALETTE).map((color) => (
              <button key={color} type="button" className="swatch" style={{ background: color }} onClick={() => patch(part, { color })} />
            ))}
            <label className="picker">
              <input
                type="color"
                value={toHex(design[part].color)}
                onChange={(event) => patch(part, { color: event.target.value })}
              />
            </label>
          </div>
          {part === "bottle" && (
            <>
              <h3>{t.neck}</h3>
              <div className="segments">
                {NECK_IDS.map((neck) => (
                  <button key={neck} type="button" className={design.bottle.neck === neck ? "is-on" : ""} onClick={() => patch("bottle", { neck: neck as NeckId })}>
                    {neck.replace("FEA", "")}
                  </button>
                ))}
              </div>
              <Slider label={t.height} value={design.bottle.heightMm} min={48} max={180} onChange={(heightMm) => patch("bottle", { heightMm })} />
              <Slider label={t.width} value={design.bottle.widthMm} min={26} max={96} onChange={(widthMm) => patch("bottle", { widthMm })} />
              <Slider label={t.depth} value={design.bottle.depthMm} min={20} max={90} onChange={(depthMm) => patch("bottle", { depthMm })} />
              {bottleById(design.bottle.variantId).supplier && (
                <details className="supplier">
                  <summary>{t.supplier}</summary>
                  <p>
                    {bottleById(design.bottle.variantId).supplier?.name}
                    {bottleById(design.bottle.variantId).supplier?.ref ? ` · ${bottleById(design.bottle.variantId).supplier?.ref}` : ""}
                    {bottleById(design.bottle.variantId).supplier?.origin ? ` · ${bottleById(design.bottle.variantId).supplier?.origin}` : ""}
                  </p>
                </details>
              )}
            </>
          )}
          {part === "cap" && (
            <>
              <p className="hint">{t.snap}</p>
              <Slider label={t.height} value={design.cap.heightMm} min={10} max={78} onChange={(heightMm) => patch("cap", { heightMm })} />
              <Slider label={t.width} value={design.cap.widthMm} min={16} max={48} onChange={(widthMm) => patch("cap", { widthMm })} />
            </>
          )}
          {(part === "pump" || part === "collar") && <p className="hint">{t.snap}</p>}
          {part === "label" && (
            <>
              <h3>{t.brand}</h3>
              <input className="search" value={design.label.text} placeholder="Nº 01" onChange={(event) => patch("label", { text: event.target.value.slice(0, 32) })} />
              <p className="hint">{t.brandHint}</p>
              <Slider label={t.width} value={design.label.scale * 100} min={55} max={160} suffix="%" onChange={(value) => patch("label", { scale: value / 100 })} />
            </>
          )}
          {part === "box" && (
            <>
              <Slider label={t.height} value={design.box.heightMm} min={70} max={240} onChange={(heightMm) => patch("box", { heightMm })} />
              <Slider label={t.width} value={design.box.widthMm} min={40} max={160} onChange={(widthMm) => patch("box", { widthMm })} />
              <Slider label={t.depth} value={design.box.depthMm} min={30} max={140} onChange={(depthMm) => patch("box", { depthMm })} />
              <button type="button" className="text-btn fit" onClick={() => patch("box", { linked: true })}>{t.fit}</button>
            </>
          )}
          {part === "liquid" && (
            <Slider label={t.fill} value={design.liquid.fill * 100} min={5} max={95} suffix="%" onChange={(value) => patch("liquid", { fill: value / 100 })} />
          )}
          <button type="button" className="text-btn hide" onClick={() => patch(part, { visible: !design[part].visible })}>
            {design[part].visible ? t.hide : t.show}
          </button>
        </>
      )}
    </section>
  );
}

function Slider({ label, value, min, max, onChange, suffix = "mm" }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void; suffix?: string }) {
  return (
    <label className="slider">
      <span>{label}</span>
      <bdi dir="ltr">{suffix === "%" ? Math.round(value) : value.toFixed(1)} {suffix}</bdi>
      <input type="range" min={min} max={max} step={suffix === "%" ? 1 : 0.1} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function toHex(color: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return "#d4b48a";
}

function variantName(part: PartKey | null, design: ReturnType<typeof useLab.getState>["design"], lang: "he" | "en"): string {
  if (!part) return "";
  if (part === "liquid") return lang === "he" ? "נוזל" : "Liquid";
  const spec =
    part === "bottle" ? bottleById(design.bottle.variantId) :
    part === "cap" ? capById(design.cap.variantId) :
    part === "label" ? logoById(design.label.variantId) :
    part === "pump" ? pumpById(design.pump.variantId) :
    part === "collar" ? collarById(design.collar.variantId) :
    boxById(design.box.variantId);
  return spec.name[lang];
}
