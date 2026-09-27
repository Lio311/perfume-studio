import { tx } from "../i18n/copy.ts";
import { useLab, type ViewPreset } from "../store/labStore.ts";

const PRESETS: Array<{ id: ViewPreset; key: "presetFront" | "presetThree" | "presetTop" | "presetSide" }> = [
  { id: "front", key: "presetFront" },
  { id: "three", key: "presetThree" },
  { id: "top", key: "presetTop" },
  { id: "side", key: "presetSide" },
];

export function Dock() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const explode = useLab((s) => s.explode);
  const preset = useLab((s) => s.viewPreset);
  const setExplode = useLab((s) => s.setExplode);
  const setView = useLab((s) => s.setView);
  return (
    <div className="dock" dir={lang === "he" ? "rtl" : "ltr"}>
      <span className="dock-label">{t.explode}</span>
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
    </div>
  );
}
