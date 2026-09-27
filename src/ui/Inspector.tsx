import { bottleById, boxById, capById, collarById, logoById, pumpById } from "../model/catalog.ts";
import { computeFit } from "../model/fit.ts";
import { FINISHES, PALETTE, LIQUID_PALETTE } from "../model/materials.ts";
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
  const explode = useLab((s) => s.explode);
  const patch = useLab((s) => s.patch);
  const cycle = useLab((s) => s.cycle);
  const beginGesture = useLab((s) => s.beginGesture);
  const endGesture = useLab((s) => s.endGesture);
  const duplicateDesign = useLab((s) => s.duplicateDesign);
  const part = selected;
  const name = variantName(part, design, lang);
  const fit = computeFit(design, explode > 0.45);
  const neckLabel = design.bottle.neck.replace("FEA", "FEA ");
  const badge = !part || part === "liquid" || part === "label" || part === "box"
    ? ""
    : lang === "he" ? `${t.fitBadge} ${neckLabel}` : `${neckLabel} ${t.fitBadge}`;

  return (
    <section className={`panel props ${open ? "is-open" : ""}`} dir={lang === "he" ? "rtl" : "ltr"}>
      <div className="panel-head">
        <h2>{t.properties}</h2>
        <span className="hint">{t.arrows}</span>
      </div>
      {!part && <p className="empty">{t.emptySelect}</p>}
      {part && (
        <>
          {badge && <div className="badge" dir="ltr">{badge}</div>}
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
          <h3>{t.color}</h3>
          <div className="swatches">
            {(part === "liquid" ? LIQUID_PALETTE : PALETTE).map((color) => (
              <button key={color} type="button" className="swatch" style={{ background: color }} aria-label={color} onClick={() => patch(part, { color })} />
            ))}
            <label className="picker">
              <input type="color" value={toHex(design[part].color)} onChange={(event) => patch(part, { color: event.target.value })} />
            </label>
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
              <Slider label={t.width} value={design.bottle.widthMm} min={26} max={96} onGesture={beginGesture} onGestureEnd={endGesture} onChange={(widthMm) => patch("bottle", { widthMm })} />
              <Slider label={t.depth} value={design.bottle.depthMm} min={20} max={90} onGesture={beginGesture} onGestureEnd={endGesture} onChange={(depthMm) => patch("bottle", { depthMm })} />
              <Slider label={t.height} value={design.bottle.heightMm} min={48} max={180} onGesture={beginGesture} onGestureEnd={endGesture} onChange={(heightMm) => patch("bottle", { heightMm })} />
              <Slider
                label={t.scale}
                value={ratio(design.bottle.heightMm, bottleById(design.bottle.variantId).heightMm) * 100}
                min={70}
                max={140}
                suffix="%"
                onGesture={beginGesture}
                onGestureEnd={endGesture}
                onChange={(value) => {
                  const spec = bottleById(design.bottle.variantId);
                  const s = value / 100;
                  patch("bottle", { heightMm: spec.heightMm * s, widthMm: spec.widthMm * s, depthMm: spec.depthMm * s });
                }}
              />
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
              <Slider label={t.width} value={design.cap.widthMm} min={16} max={48} onGesture={beginGesture} onGestureEnd={endGesture} onChange={(widthMm) => patch("cap", { widthMm })} />
              <Slider label={t.depth} value={fit.capD} min={16} max={48} onGesture={beginGesture} onGestureEnd={endGesture} onChange={(depthMm) => patch("cap", { widthMm: depthMm * (design.cap.widthMm / Math.max(1, fit.capD)) })} />
              <Slider label={t.height} value={design.cap.heightMm} min={10} max={78} onGesture={beginGesture} onGestureEnd={endGesture} onChange={(heightMm) => patch("cap", { heightMm })} />
              <Slider
                label={t.scale}
                value={ratio(design.cap.heightMm, capById(design.cap.variantId).heightMm) * 100}
                min={70}
                max={150}
                suffix="%"
                onGesture={beginGesture}
                onGestureEnd={endGesture}
                onChange={(value) => {
                  const spec = capById(design.cap.variantId);
                  const s = value / 100;
                  patch("cap", { heightMm: spec.heightMm * s, widthMm: spec.widthMm * s });
                }}
              />
            </>
          )}
          {part === "collar" && (
            <>
              <p className="hint">{t.snap}</p>
              <Readout label={t.width} value={fit.collarOuter * 2} />
              <Readout label={t.depth} value={fit.collarInner * 2} />
              <Readout label={t.height} value={fit.collarHeight} />
            </>
          )}
          {part === "pump" && (
            <>
              <p className="hint">{t.snap}</p>
              <Readout label={t.width} value={fit.actuatorR * 2} />
              <Readout label={t.height} value={fit.actuatorH} />
            </>
          )}
          {part === "label" && (
            <>
              <h3>{t.brand}</h3>
              <input className="search" value={design.label.text} placeholder="Nº 01" onChange={(event) => patch("label", { text: event.target.value.slice(0, 32) })} />
              <p className="hint">{t.brandHint}</p>
              <Slider label={t.scale} value={design.label.scale * 100} min={55} max={160} suffix="%" onGesture={beginGesture} onGestureEnd={endGesture} onChange={(value) => patch("label", { scale: value / 100 })} />
              <Readout label={t.width} value={fit.labelW} />
              <Readout label={t.height} value={fit.labelH} />
            </>
          )}
          {part === "box" && (
            <>
              <Slider label={t.width} value={fit.boxW} min={40} max={160} onGesture={beginGesture} onGestureEnd={endGesture} onChange={(widthMm) => patch("box", { widthMm })} />
              <Slider label={t.depth} value={fit.boxD} min={30} max={140} onGesture={beginGesture} onGestureEnd={endGesture} onChange={(depthMm) => patch("box", { depthMm })} />
              <Slider label={t.height} value={fit.boxH} min={70} max={240} onGesture={beginGesture} onGestureEnd={endGesture} onChange={(heightMm) => patch("box", { heightMm })} />
              <button type="button" className="text-btn fit" onClick={() => patch("box", { linked: true })}>{t.fit}</button>
            </>
          )}
          {part === "liquid" && (
            <Slider label={t.fill} value={design.liquid.fill * 100} min={5} max={95} suffix="%" onGesture={beginGesture} onGestureEnd={endGesture} onChange={(value) => patch("liquid", { fill: value / 100 })} />
          )}
          <div className="part-actions">
            {part !== "liquid" && <button type="button" onClick={() => cycle(1, part)}>{t.replace}</button>}
            <button type="button" onClick={() => duplicateDesign()}>{t.duplicate}</button>
            <button type="button" onClick={() => patch(part, { visible: !design[part].visible })}>
              {design[part].visible ? t.remove : t.show}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
  onGesture,
  onGestureEnd,
  suffix = "mm",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onGesture: () => void;
  onGestureEnd: () => void;
  suffix?: string;
}) {
  return (
    <label className="slider">
      <span>{label}</span>
      <bdi dir="ltr">{suffix === "%" ? Math.round(value) : value.toFixed(1)} {suffix}</bdi>
      <input
        type="range"
        min={min}
        max={max}
        step={suffix === "%" ? 1 : 0.1}
        value={value}
        onPointerDown={onGesture}
        onPointerUp={onGestureEnd}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Readout({ label, value }: { label: string; value: number }) {
  return (
    <p className="slider">
      <span>{label}</span>
      <bdi dir="ltr">{value.toFixed(1)} mm</bdi>
    </p>
  );
}

function ratio(current: number, base: number): number {
  return base ? current / base : 1;
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
