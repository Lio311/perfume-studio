import { tx } from "../i18n/copy.ts";
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
  const boxOn = useLab((s) => s.design.box.visible);
  const patch = useLab((s) => s.patch);
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
      <button
        type="button"
        className={boxOn ? "is-on" : ""}
        aria-pressed={boxOn}
        onClick={() => patch("box", { visible: !boxOn })}
      >
        {boxOn ? t.boxHide : t.boxShow}
      </button>
      <div className="dock-voice">
        {voice === 1 && <VoiceAssistant />}
        {voice === 2 && <HandsFree />}
        {voice === 3 && <SonicLayer />}
      </div>
    </div>
  );
}
