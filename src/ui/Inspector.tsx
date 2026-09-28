import { useId } from "react";
import { formatMoney } from "../budget/money.ts";
import { bottleById, boxById, capById, collarById, logoById, pumpById } from "../model/catalog.ts";
import { computeFit } from "../model/fit.ts";
import { FINISHES, PALETTE, LIQUID_PALETTE, effectiveGlassOpacity } from "../model/materials.ts";
import { NECK_IDS } from "../model/necks.ts";
import { setUnboxingMuted, useUnboxingTrack } from "../audio/unboxingTrack.ts";
import { DEFAULT_INSERT_MOTION, INSERT_MATERIALS, OUTER_WRAPS, sleeveOverActive, withInnerStructure, withNeckHeight, withSleeveOver, withSleeveWindow } from "../model/boxFields.ts";
import { listClosures } from "../model/closures/registry.ts";
import type { BoxLatch, FinishId, InsertMaterial, InsertOrientation, NeckId, OuterWrap, PartKey, VariantPart } from "../model/types.ts";
import { partLabel, tx } from "../i18n/copy.ts";
import { useLab } from "../store/labStore.ts";
import { Alternatives } from "./BudgetSuggestions.tsx";
import { clampLabelText } from "../geometry/logos.ts";
import { BrandTextField, labelVisibleAfterTextChange } from "./brandField.tsx";
import { ExamplePriceMark, PartialMark, PartPriceEditor } from "./PriceTag.tsx";
import { useBudgetModel } from "./useBudget.ts";

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
  const applyCommands = useLab((s) => s.applyCommands);
  const suppliers = useLab((s) => s.suppliers);
  const brandHeadingId = useId();
  const part = selected;
  const quantity = useLab((s) => s.brief.quantity);
  const budget = useBudgetModel();
  const hidden = hiddenDesignPart(part, design, suppliers);
  const name = hidden ? (hidden.name || hidden.code || hidden.id) : variantName(part, design, lang);
  let fit: ReturnType<typeof computeFit>;
  try {
    fit = computeFit(design, explode > 0.45);
  } catch {
    return (
      <section className={`panel props ${open ? "is-open" : ""}`} dir={lang === "he" ? "rtl" : "ltr"}>
        <div className="panel-head"><h2>{t.properties}</h2></div>
        <p className="empty">{t.emptySelect}</p>
      </section>
    );
  }
  const wizardPicked = useLab((s) => s.wizardPicked);
  
  const neckLabel = design.bottle.neck.replace("FEA", "FEA ");
  const badge = !part || part === "liquid" || part === "label" || part === "box"
    ? ""
    : `✓ ${t.fitOk} ${neckLabel}`;

  const isWizard = (design.step ?? 7) < 7;
  const isPendingWizardPick = isWizard && part && part !== "liquid" && !wizardPicked.has(part);

  return (
    <section className={`panel props ${open ? "is-open" : ""}`} dir={lang === "he" ? "rtl" : "ltr"}>
      <div className="panel-head">
        <h2>{t.properties}</h2>
        <span className="hint">{t.arrows}</span>
      </div>
      {!part && <p className="empty">{t.emptySelect}</p>}
      {isPendingWizardPick && <p className="empty">{lang === "he" ? "אנא בחרו קודם רכיב מהספרייה" : "Please select a part from the library first"}</p>}
      {part && !isPendingWizardPick && hidden && (
        <p className="hint" data-hidden-design>{lang === "he" ? hidden.he : hidden.en}</p>
      )}
      {part && !isPendingWizardPick && (
        <>
          {badge && !hidden && <div className="badge is-fit" dir="ltr">{badge}</div>}
          {!hidden && (
            <p className="combo-total" data-combo-total>
              <span>{t.totalPrice}</span>
              <bdi dir="ltr">{formatMoney(budget.summary.totalIls, "ILS", lang)}</bdi>
              <PartialMark count={budget.summary.unpricedCount} />
              {!quantity && <em>{t.basePriceNote}</em>}
              {budget.belowMoq && <em className="is-warn">{t.belowMoq}</em>}
              <ExamplePriceMark count={budget.exampleCount} />
              {budget.summary.over && <em className="is-over">{t.budgetOver}</em>}
            </p>
          )}
          {!hidden && <SpecCard part={part} />}
          <div className="part-title">
            <div>
              <span className="eyebrow">{partLabel[lang][part]}</span>
              <strong>{hidden ? <bdi>{name}</bdi> : name}</strong>
            </div>
            {part !== "liquid" && (
              <div className="cycle-btns">
                <button type="button" onClick={() => cycle(-1, part)}>{t.prev}</button>
                <button type="button" onClick={() => cycle(1, part)}>{t.next}</button>
              </div>
            )}
          </div>
          {!hidden && part !== "liquid" && <PartPriceEditor kind={part as VariantPart} partId={design[part].variantId} />}
          {!hidden && <Alternatives />}
          <h3>{t.color}</h3>
          <div className="swatches">
            {(part === "liquid" ? LIQUID_PALETTE : PALETTE).map((color) => {
              const handlePatch = () => {
                if (part !== "liquid" && 'finish' in design[part] && (design[part] as any).finish === "clear") {
                  patch(part, { color, finish: "tinted" });
                } else {
                  patch(part, { color });
                }
              };
              return (
                <button key={color} type="button" className={design[part].color === color ? "swatch is-on" : "swatch"} style={{ background: color }} aria-label={color} onClick={handlePatch} />
              );
            })}
            <label className="picker">
              <input type="color" value={toHex(design[part].color)} onChange={(event) => {
                const color = event.target.value;
                if (part !== "liquid" && 'finish' in design[part] && (design[part] as any).finish === "clear") {
                  patch(part, { color, finish: "tinted" });
                } else {
                  patch(part, { color });
                }
              }} />
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
              {part === "bottle" && (() => {
                const glassOpacity = effectiveGlassOpacity(design.bottle.finish, design.bottle.opacity);
                if (glassOpacity === null) return null;
                return (
                  <Slider
                    label={lang === "he" ? "אטימות זכוכית" : "Glass Opacity"}
                    value={glassOpacity * 100}
                    min={0}
                    max={100}
                    suffix="%"
                    onGesture={beginGesture}
                    onGestureEnd={endGesture}
                    onChange={(value) => patch("bottle", { opacity: value / 100 })}
                  />
                );
              })()}
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
              <DimFields
                fields={[
                  { label: t.width, value: design.bottle.widthMm, min: 26, max: 96, onChange: (widthMm) => patch("bottle", { widthMm }) },
                  { label: t.depth, value: design.bottle.depthMm, min: 20, max: 90, onChange: (depthMm) => patch("bottle", { depthMm }) },
                  { label: t.height, value: design.bottle.heightMm, min: 48, max: 180, onChange: (heightMm) => patch("bottle", { heightMm }) },
                ]}
              />
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
              <DimFields
                fields={[
                  { label: t.width, value: design.cap.widthMm, min: 16, max: 48, onChange: (widthMm) => patch("cap", { widthMm }) },
                  { label: t.depth, value: fit.capD, min: 16, max: 48, onChange: (depthMm) => patch("cap", { widthMm: depthMm * (design.cap.widthMm / Math.max(1, fit.capD)) }) },
                  { label: t.height, value: design.cap.heightMm, min: 10, max: 78, onChange: (heightMm) => patch("cap", { heightMm }) },
                ]}
              />
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
              <Readout label={t.width} value={fit.headR * 2} />
              <Readout label={t.height} value={fit.actuatorH} />
            </>
          )}
          {part === "label" && (
            <>
              <h3 id={brandHeadingId}>{t.brand}</h3>
              <BrandTextField
                value={design.label.text}
                hint={t.brandHint}
                labelId={brandHeadingId}
                onChange={(text) => patch("label", { text: clampLabelText(text), visible: labelVisibleAfterTextChange(text, design.label.visible) })}
              />
              <Slider label={t.scale} value={design.label.scale * 100} min={55} max={160} suffix="%" onGesture={beginGesture} onGestureEnd={endGesture} onChange={(value) => patch("label", { scale: value / 100 })} />
              <Readout label={t.width} value={fit.labelW} />
              <Readout label={t.height} value={fit.labelH} />
            </>
          )}
          {part === "box" && (
            <>
              <h3>{t.boxForm}</h3>
              <div className="chips">
                {(
                  [
                    ["box-rigid", "מכסה", "Lid"],
                    ["box-window", "חלון", "Window"],
                    ["box-drawer", "מגירה", "Insert"],
                    ["box-magnetic", "מגנט", "Magnetic"],
                    ["box-coffret", "קופרה", "Coffret"],
                    ["box-sleeve", "שרוול", "Sleeve"],
                  ] as const
                ).map(([id, he, en]) => (
                  <button
                    key={id}
                    type="button"
                    className={design.box.variantId === id ? "chip is-on" : "chip"}
                    onClick={() => applyCommands([{ type: "variant", part: "box", id }, { type: "select", part: "box" }])}
                  >
                    {lang === "he" ? he : en}
                  </button>
                ))}
              </div>
              <h3>{t.logoOnBox}</h3>
              <input className="search" value={design.label.text} onChange={(event) => {
                patch("label", { text: clampLabelText(event.target.value) });
              }} />
              <Slider label={t.width} value={fit.boxW} min={40} max={160} onGesture={beginGesture} onGestureEnd={endGesture} onChange={(widthMm) => patch("box", { widthMm })} />
              <Slider label={t.depth} value={fit.boxD} min={30} max={140} onGesture={beginGesture} onGestureEnd={endGesture} onChange={(depthMm) => patch("box", { depthMm })} />
              <Slider label={t.height} value={fit.boxH} min={70} max={240} onGesture={beginGesture} onGestureEnd={endGesture} onChange={(heightMm) => patch("box", { heightMm })} />
              <button type="button" className="text-btn fit" onClick={() => patch("box", { linked: true })}>{t.fit}</button>
              <BoxPack />
            </>
          )}
          {part === "liquid" && (
            <Slider label={t.fill} value={design.liquid.fill * 100} min={5} max={95} suffix="%" onGesture={beginGesture} onGestureEnd={endGesture} onChange={(value) => patch("liquid", { fill: value / 100 })} />
          )}
          <div className="part-actions">
            {part !== "liquid" && <button type="button" onClick={() => cycle(1, part)}>⇄ {t.replace}</button>}
            <button type="button" onClick={() => duplicateDesign()}>⧉ {t.duplicate}</button>
            <button type="button" className={design[part].visible ? "is-danger" : ""} onClick={() => patch(part, { visible: !design[part].visible })}>
              {design[part].visible ? `✕ ${t.remove}` : t.show}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function BoxPack() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const box = useLab((s) => s.design.box);
  const patch = useLab((s) => s.patch);
  const cutaway = useLab((s) => s.cutaway);
  const setCutaway = useLab((s) => s.setCutaway);
  const quality = useLab((s) => s.quality);
  const setQuality = useLab((s) => s.setQuality);
  const track = useUnboxingTrack();
  const insertLabel: Record<InsertMaterial, string> = {
    eva: t.insertEva,
    pulp: t.insertPulp,
    card: t.insertCard,
    "velvet-foam": t.insertVelvet,
  };
  const wrapLabel: Record<OuterWrap, string> = {
    none: t.wrapNone,
    cellophane: t.wrapCellophane,
    sleeve: t.wrapSleeve,
    tissue: t.wrapTissue,
  };
  const orient = box.insert?.orientation ?? "standing";
  const specs = listClosures();
  const current = specs.find((spec) => spec.id === box.structure);
  const latchLabel: Record<BoxLatch, string> = { magnet: t.latchMagnet, ribbon: t.latchRibbon, none: t.latchNone };
  const layers = box.layers ?? [];
  const sleeveOn = sleeveOverActive(layers);
  const sleeveWindow = layers.find((layer) => layer.structure === "sleeve")?.window ?? null;
  const motion = box.insertMotion ?? DEFAULT_INSERT_MOTION;
  const trayOn = motion.trayLift.height > 0;
  return (
    <div className="box-pack" data-box-pack>
      <h3>{t.closure}</h3>
      <div className="chips">
        {specs.map((spec) => (
          <button
            key={spec.preset.id}
            type="button"
            className={box.structure === spec.id ? "chip is-on" : "chip"}
            onClick={() => patch("box", { structure: spec.id, latch: spec.preset.latch, layers: withInnerStructure(layers, spec.id, spec.preset.latch) })}
          >
            {lang === "he" ? spec.preset.label.he : spec.preset.label.en}
          </button>
        ))}
      </div>
      {current && current.latches.length > 1 && (
        <>
          <h3>{t.latch}</h3>
          <div className="chips">
            {current.latches.map((id) => (
              <button
                key={id}
                type="button"
                className={box.latch === id ? "chip is-on" : "chip"}
                onClick={() => patch("box", { latch: id, layers: withInnerStructure(layers, box.structure, id) })}
              >
                {latchLabel[id]}
              </button>
            ))}
          </div>
        </>
      )}
      {current?.liftOff && box.liftOff && (
        <>
          <h3>{t.lidFit}</h3>
          <div className="chips">
            {current.liftOff.variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                className={box.liftOff.variant === variant.id ? "chip is-on" : "chip"}
                onClick={() => patch("box", { liftOff: { ...box.liftOff, variant: variant.id } })}
              >
                {lang === "he" ? variant.label.he : variant.label.en}
              </button>
            ))}
          </div>
          {box.liftOff.variant === "shoulder-neck" && (
            <DimFields
              fields={[
                {
                  label: t.neckHeight,
                  value: box.liftOff.neckMm,
                  min: current.liftOff.neckMm[0],
                  max: current.liftOff.neckMm[1],
                  onChange: (neckMm) => patch("box", { liftOff: { ...box.liftOff, neckMm }, layers: withNeckHeight(layers, neckMm) }),
                },
              ]}
            />
          )}
          {box.liftOff.variant !== "telescope-full" && (
            <DimFields
              fields={[
                {
                  label: t.lidDepth,
                  value: box.liftOff.lidDepthMm,
                  min: current.liftOff.lidDepthMm[0],
                  max: current.liftOff.lidDepthMm[1],
                  onChange: (lidDepthMm) => patch("box", { liftOff: { ...box.liftOff, lidDepthMm } }),
                },
              ]}
            />
          )}
        </>
      )}
      {box.structure === "lift-off" && (
        <>
          <h3>{t.shape}</h3>
          <div className="chips">
            <button type="button" className={box.shape?.type !== "cylinder" ? "chip is-on" : "chip"} onClick={() => patch("box", { shape: { type: "rect" } })}>
              {t.shapeRect}
            </button>
            <button type="button" className={box.shape?.type === "cylinder" ? "chip is-on" : "chip"} onClick={() => patch("box", { shape: { type: "cylinder" } })}>
              {t.shapeCylinder}
            </button>
          </div>
        </>
      )}
      <div className="chips">
        <button type="button" className={sleeveOn ? "chip is-on" : "chip"} onClick={() => patch("box", { layers: withSleeveOver(box, !sleeveOn) })}>
          {t.sleeveOver}
        </button>
        {sleeveOn && (
          <button
            type="button"
            className={sleeveWindow ? "chip is-on" : "chip"}
            onClick={() => patch("box", { layers: withSleeveWindow(layers, sleeveWindow ? null : { shape: "rect", transparent: true }) })}
          >
            {t.sleeveWindow}
          </button>
        )}
        {(box.structure === "lift-off" || box.structure === "book") && (
          <button
            type="button"
            className={trayOn ? "chip is-on" : "chip"}
            onClick={() =>
              patch("box", {
                insertMotion: { ...motion, trayLift: { height: trayOn ? 0 : 22, trigger: "lidAngle" } },
              })
            }
          >
            {t.trayRise}
          </button>
        )}
      </div>
      {current?.pulls && (
        <>
          <h3>{t.drawerPull}</h3>
          <div className="chips">
            {current.pulls.map((id) => (
              <button
                key={id}
                type="button"
                className={box.drawerPull === id ? "chip is-on" : "chip"}
                onClick={() => patch("box", { drawerPull: id === "ribbon" || id === "notch" ? id : "none" })}
              >
                {id === "ribbon" ? t.pullRibbon : id === "notch" ? t.thumbNotch : t.latchNone}
              </button>
            ))}
          </div>
        </>
      )}
      <h3>{t.insert}</h3>
      <div className="chips">
        {INSERT_MATERIALS.map((id) => (
          <button
            key={id}
            type="button"
            className={box.insert?.material === id ? "chip is-on" : "chip"}
            onClick={() => patch("box", { insert: { ...box.insert, material: id } })}
          >
            {insertLabel[id]}
          </button>
        ))}
      </div>
      <div className="chips">
        {(["standing", "lying"] as InsertOrientation[]).map((id) => (
          <button
            key={id}
            type="button"
            className={orient === id ? "chip is-on" : "chip"}
            onClick={() => patch("box", { insert: { ...box.insert, orientation: id } })}
          >
            {id === "standing" ? t.orientStanding : t.orientLying}
          </button>
        ))}
      </div>
      <h3>{t.outerWrap}</h3>
      <div className="chips">
        {OUTER_WRAPS.map((id) => (
          <button
            key={id}
            type="button"
            className={box.outerWrap === id ? "chip is-on" : "chip"}
            onClick={() => patch("box", { outerWrap: id })}
          >
            {wrapLabel[id]}
          </button>
        ))}
      </div>
      <div className="chips">
        <button type="button" className={box.ribbon ? "chip is-on" : "chip"} onClick={() => patch("box", { ribbon: !box.ribbon })}>
          {t.ribbon}
        </button>
        <button type="button" className={box.pullTab ? "chip is-on" : "chip"} onClick={() => patch("box", { pullTab: !box.pullTab })}>
          {t.pullTab}
        </button>
        <button type="button" className={cutaway ? "chip is-on" : "chip"} onClick={() => setCutaway(!cutaway)}>
          {t.cutaway}
        </button>
      </div>
      <div className="unbox-soon">
        <h3>{t.unboxing}</h3>
        <label>
          <input type="checkbox" disabled checked={false} readOnly />
          <span>{t.hands}</span>
          <em>{t.comingSoon}</em>
        </label>
        <button
          type="button"
          className={track.muted ? "chip" : "chip is-on"}
          aria-pressed={!track.muted}
          title={t.soundtrackHint}
          onClick={() => setUnboxingMuted(!track.muted)}
        >
          {track.muted ? t.soundUnmute : t.soundMute}
        </button>
        <div className="chips">
          <button type="button" className={quality === "high" ? "chip is-on" : "chip"} onClick={() => setQuality("high", true)}>
            {t.qualityHigh}
          </button>
          <button type="button" className={quality === "fallback" ? "chip is-on" : "chip"} onClick={() => setQuality("fallback", true)}>
            {t.qualityFallback}
          </button>
        </div>
      </div>
    </div>
  );
}

function DimFields({
  fields,
}: {
  fields: Array<{ label: string; value: number; min: number; max: number; onChange: (value: number) => void }>;
}) {
  const beginGesture = useLab((s) => s.beginGesture);
  const endGesture = useLab((s) => s.endGesture);
  return (
    <div className="dim-grid">
      {fields.map((field) => (
        <label key={field.label}>
          <span>{field.label}</span>
          <input
            type="number"
            dir="ltr"
            min={field.min}
            max={field.max}
            step={0.1}
            value={Number(field.value.toFixed(1))}
            onFocus={beginGesture}
            onBlur={endGesture}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) field.onChange(Math.min(field.max, Math.max(field.min, next)));
            }}
          />
        </label>
      ))}
    </div>
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

function SpecCard({ part }: { part: PartKey }) {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const design = useLab((s) => s.design);
  const fit = computeFit(design, false);
  const finish = part === "liquid" ? null : FINISHES.find((item) => item.id === design[part].finish);
  const dims = part === "bottle"
    ? `${design.bottle.widthMm.toFixed(1)} × ${design.bottle.depthMm.toFixed(1)} × ${design.bottle.heightMm.toFixed(1)}`
    : part === "cap"
      ? `${fit.capW.toFixed(1)} × ${fit.capD.toFixed(1)} × ${fit.capH.toFixed(1)}`
      : part === "box"
        ? `${fit.boxW.toFixed(0)} × ${fit.boxD.toFixed(0)} × ${fit.boxH.toFixed(0)}`
        : part === "collar"
          ? `Ø${(fit.collarOuter * 2).toFixed(1)} × ${fit.collarHeight.toFixed(1)}`
          : part === "pump"
            ? `Ø${(fit.headR * 2).toFixed(1)} × ${fit.actuatorH.toFixed(1)}`
            : part === "label"
              ? `${fit.labelW.toFixed(1)} × ${fit.labelH.toFixed(1)}`
              : `${lang === "he" ? "מילוי" : "Fill"} ${Math.round(design.liquid.fill * 100)}%`;
  const neck = part === "box" || part === "label" || part === "liquid" ? "—" : design.bottle.neck;
  const grams = estimateGrams(part, design, fit);
  return (
    <article className="spec-card">
      <h3>{t.specTitle}</h3>
      <dl>
        <div><dt>{t.material}</dt><dd>{finish ? finish.name[lang] : partLabel[lang].liquid}</dd></div>
        <div><dt>{t.dimensions}</dt><dd dir="ltr">{part === "liquid" ? dims : `${dims} ${lang === "he" ? "מ״מ" : "mm"}`}</dd></div>
        <div><dt>{t.neck}</dt><dd dir="ltr">{neck}</dd></div>
        <div><dt>{t.weight}</dt><dd dir="ltr">{grams} {lang === "he" ? "ג׳" : "g"}</dd></div>
        <div><dt>{t.moq}</dt><dd dir="ltr">{t.moqValue}</dd></div>
      </dl>
    </article>
  );
}

function estimateGrams(part: PartKey, design: ReturnType<typeof useLab.getState>["design"], fit: ReturnType<typeof computeFit>): number {
  if (part === "bottle") return Math.round((fit.bottleW * fit.bottleD * fit.bottleH) / 1000 * 0.85);
  if (part === "cap") {
    const tags = capById(design.cap.variantId).tags;
    const density = tags.includes("zamac") ? 5.4 : tags.includes("wood") ? 0.65 : tags.includes("acrylic") || tags.includes("crystal") ? 1.15 : tags.includes("surlyn") ? 0.95 : design.cap.finish === "gold" || design.cap.finish === "silver" || design.cap.finish === "rose" ? 4.8 : 1.05;
    return Math.max(4, Math.round((fit.capW * fit.capD * fit.capH) / 1000 * 0.55 * density));
  }
  if (part === "box") return Math.round((fit.boxW * fit.boxD * fit.boxH) / 1000 * 0.18);
  if (part === "collar") return Math.round(fit.collarOuter * fit.collarHeight * 0.35);
  if (part === "pump") return 6;
  if (part === "label") return 1;
  return Math.round(design.liquid.fill * 48);
}

function ratio(current: number, base: number): number {
  return base ? current / base : 1;
}

function toHex(color: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return "#d4b48a";
}

function hiddenDesignPart(
  part: PartKey | null,
  design: ReturnType<typeof useLab.getState>["design"],
  suppliers: ReturnType<typeof useLab.getState>["suppliers"],
) {
  if (!part || part === "liquid") return undefined;
  const id = design[part].variantId;
  for (const pack of suppliers) {
    const hit = pack.hiddenParts?.find((item) => item.id === id);
    if (hit) return hit;
  }
  return undefined;
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
