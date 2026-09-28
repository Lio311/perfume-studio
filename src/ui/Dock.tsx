import { useEffect, useRef } from "react";
import { partLabel, tx } from "../i18n/copy.ts";
import type { PartKey } from "../model/types.ts";
import { useLab, type ViewPreset } from "../store/labStore.ts";
import { HandsFree } from "./HandsFree.tsx";
import { SonicLayer } from "./SonicLayer.tsx";
import { VoiceAssistant } from "./VoiceAssistant.tsx";

const PRESETS: Array<{ id: ViewPreset; key: "preset360" | "presetFront" | "presetSide" | "presetTop" }> = [
  { id: "home", key: "preset360" },
  { id: "front", key: "presetFront" },
  { id: "side", key: "presetSide" },
  { id: "top", key: "presetTop" },
];

export function Dock() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const explode = useLab((s) => s.explode);
  const preset = useLab((s) => s.viewPreset);
  const voice = useLab((s) => s.voice);
  const setExplode = useLab((s) => s.setExplode);
  const setView = useLab((s) => s.setView);
  const aimed = useLab((s) => s.aimed);
  const selected = useLab((s) => s.selected);
  const solo = useLab((s) => s.solo);
  const present = useLab((s) => s.present);
  const showFull = useLab((s) => s.showFull);
  const isolate = useLab((s) => s.isolate);
  const setPresent = useLab((s) => s.setPresent);
  return (
    <div className="dock" dir={lang === "he" ? "rtl" : "ltr"}>
      <span className="dock-label">{t.explode}</span>
      <bdi className="dock-pct" dir="ltr">{Math.round(explode * 100)}%</bdi>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={explode}
        aria-label={t.explode}
        onChange={(event) => setExplode(Number(event.target.value))}
      />
      <div className="presets" dir="ltr">
        {PRESETS.map((item) => (
          <button key={item.id} type="button" className={preset === item.id ? "is-on" : ""} onClick={() => setView(item.id)}>
            {t[item.key]}
          </button>
        ))}
      </div>
      {selected && !solo && (
        <button type="button" data-isolate onClick={() => isolate(selected)} title={t.kIsolate}>
          {t.isolate}
        </button>
      )}
      {aimed && !solo && (
        <button type="button" onClick={() => showFull()}>
          {t.fullView}
        </button>
      )}
      <button type="button" className={present ? "is-on" : ""} onClick={() => setPresent(!present)} title={t.kPresent}>
        {present ? t.presentExit : t.present}
      </button>
      <div className="dock-voice">
        {voice === 1 && <VoiceAssistant />}
        {voice === 2 && <HandsFree />}
        {voice === 3 && <SonicLayer />}
      </div>
    </div>
  );
}

const STEPS: Array<{ part: PartKey; at: number }> = [
  { part: "cap", at: 0.12 },
  { part: "pump", at: 0.28 },
  { part: "collar", at: 0.46 },
  { part: "label", at: 0.64 },
  { part: "bottle", at: 0.82 },
];

export function Crumb() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const solo = useLab((s) => s.solo);
  const exitSolo = useLab((s) => s.exitSolo);
  if (!solo) return null;
  return (
    <nav className="crumb" dir={lang === "he" ? "rtl" : "ltr"}>
      <button type="button" onClick={() => exitSolo()}>{t.assemblyCrumb}</button>
      <span aria-hidden>›</span>
      <b>{partLabel[lang][solo]}</b>
    </nav>
  );
}

export function Timeline() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const explode = useLab((s) => s.explode);
  const setExplode = useLab((s) => s.setExplode);
  const solo = useLab((s) => s.solo);
  const play = useRef(0);
  useEffect(() => () => window.cancelAnimationFrame(play.current), []);
  if (solo) return null;
  function run() {
    const start = performance.now();
    const tick = (now: number) => {
      const amount = Math.min(1, (now - start) / 2600);
      const eased = amount * amount * (3 - 2 * amount);
      setExplode(eased);
      if (amount < 1) play.current = window.requestAnimationFrame(tick);
    };
    play.current = window.requestAnimationFrame(tick);
  }
  return (
    <div className="timeline" dir={lang === "he" ? "rtl" : "ltr"}>
      <button type="button" onClick={run}>{t.playSeq}</button>
      <div className="timeline-track" dir="ltr">
        <i style={{ width: `${Math.round(explode * 100)}%` }} />
        {STEPS.map((step) => (
          <button key={step.part} type="button" style={{ left: `${step.at * 100}%` }} className={explode >= step.at - 0.04 ? "is-on" : ""} onClick={() => setExplode(step.at)}>
            {partLabel[lang][step.part]}
          </button>
        ))}
      </div>
    </div>
  );
}

