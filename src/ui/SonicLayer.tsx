import { useEffect } from "react";
import { tx } from "../i18n/copy.ts";
import { playClick, playMaterial, playSnap, playTick, playWhoosh, setMasterMuted, startHum, stopHum, unlockAudio } from "../audio/sfx.ts";
import type { FinishId } from "../model/types.ts";
import { useLab } from "../store/labStore.ts";

const PARTS = ["bottle", "cap", "collar", "pump", "label", "box"] as const;

export function SonicLayer() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const soundOn = useLab((s) => s.soundOn);
  const setSoundOn = useLab((s) => s.setSoundOn);
  const hovered = useLab((s) => s.hovered?.part ?? null);

  useEffect(() => {
    setMasterMuted(!soundOn);
    if (!soundOn) {
      stopHum();
      return;
    }
    const begin = () => {
      unlockAudio();
      startHum();
    };
    begin();
    window.addEventListener("pointerdown", begin);
    return () => {
      window.removeEventListener("pointerdown", begin);
      stopHum();
    };
  }, [soundOn]);

  useEffect(() => {
    if (hovered && useLab.getState().soundOn) playTick();
  }, [hovered]);

  useEffect(() => {
    let prevExplode = useLab.getState().explode;
    let prevSelected = useLab.getState().selected;
    let prevDesign = useLab.getState().design;
    return useLab.subscribe((state) => {
      if (state.voice === 3 && state.soundOn) {
        if (state.explode > prevExplode + 0.2 && state.explode >= 0.45 && prevExplode < 0.45) playWhoosh();
        if (state.explode < 0.04 && prevExplode > 0.2) playSnap();
        if (state.selected && state.selected !== prevSelected) playClick();
        for (const part of PARTS) {
          const next = state.design[part].finish;
          const prev = prevDesign[part].finish;
          if (next !== prev) playMaterial(next as FinishId);
        }
      }
      prevExplode = state.explode;
      prevSelected = state.selected;
      prevDesign = state.design;
    });
  }, []);

  useEffect(() => {
    const onOver = (event: PointerEvent) => {
      if (!useLab.getState().soundOn) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, .thumb, a")) playTick();
    };
    document.addEventListener("pointerover", onOver);
    return () => document.removeEventListener("pointerover", onOver);
  }, []);

  return (
    <div className="sonic-bar" data-variant="3" dir={lang === "he" ? "rtl" : "ltr"}>
      <button type="button" className={soundOn ? "text-btn spec-export" : "text-btn"} onClick={() => setSoundOn(!soundOn)} aria-pressed={soundOn}>
        {soundOn ? t.mute : t.unmute}
      </button>
      <span className="sonic-hum">{t.hum}</span>
      <span className="sonic-marks">{t.glassSound}</span>
      <span className="sonic-marks">{t.metalSound}</span>
      <span className="sonic-marks">{t.woodSound}</span>
      <span className="sonic-note">{t.sonicNote}</span>
    </div>
  );
}
