import { useEffect, useRef } from "react";
import { LabCanvas } from "./scene/LabCanvas.tsx";
import { applyTheme } from "./theme/themes.ts";
import { partLabel, tx } from "./i18n/copy.ts";
import { useLab } from "./store/labStore.ts";
import { TopBar } from "./ui/TopBar.tsx";
import { Library } from "./ui/Library.tsx";
import { Inspector } from "./ui/Inspector.tsx";
import { ChatPanel } from "./ui/ChatPanel.tsx";
import { Crumb, Dock, Timeline } from "./ui/Dock.tsx";
import { CommandPalette, Intro, ShortcutHelp } from "./ui/Palette.tsx";
import { requestShot } from "./scene/capture.ts";
import { CompareBoard } from "./ui/CompareBoard.tsx";
import { Modals } from "./ui/Modals.tsx";
import { stopSpeaking } from "./audio/speech.ts";

export default function App() {
  const theme = useLab((s) => s.theme);
  const lang = useLab((s) => s.lang);
  const sideOpen = useLab((s) => s.sideOpen);
  const hovered = useLab((s) => s.hovered);
  const mode = useLab((s) => s.mode);
  const voice = useLab((s) => s.voice);
  const t = tx(lang);
  const cycle = useLab((s) => s.cycle);
  const setMode = useLab((s) => s.setMode);
  const undo = useLab((s) => s.undo);
  const redo = useLab((s) => s.redo);
  const resetView = useLab((s) => s.resetView);
  const showFull = useLab((s) => s.showFull);
  const solo = useLab((s) => s.solo);
  const aimed = useLab((s) => s.aimed);
  const selected = useLab((s) => s.selected);
  const present = useLab((s) => s.present);
  const setPresent = useLab((s) => s.setPresent);
  const palette = useLab((s) => s.palette);
  const setPalette = useLab((s) => s.setPalette);
  const helpOpen = useLab((s) => s.help);
  const setHelp = useLab((s) => s.setHelp);
  const design = useLab((s) => s.design);
  const modal = useLab((s) => s.modal);
  const setModal = useLab((s) => s.setModal);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const sync = () => {
      const value = new URLSearchParams(location.search).get("voice");
      useLab.getState().applyVoiceParam(value);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => () => stopSpeaking(), [voice]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (event.key === "Escape") {
        if (palette) {
          setPalette(false);
          return;
        }
        if (helpOpen) {
          setHelp(false);
          return;
        }
        if (present) {
          setPresent(false);
          return;
        }
        if (modal) {
          setModal(null);
          return;
        }
        if (!typing) showFull();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (typing) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const dir = lang === "he" ? (event.key === "ArrowLeft" ? 1 : -1) : event.key === "ArrowRight" ? 1 : -1;
        cycle(dir);
      }
      if (event.key === "?" ) {
        setHelp(true);
        return;
      }
      if (event.key === "p" || event.key === "P") setPresent(!present);
      if (event.key === "e" || event.key === "E") setMode(mode === "explode" ? "assemble" : "explode");
      if (event.key === "0") resetView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycle, helpOpen, lang, modal, mode, palette, present, redo, resetView, setHelp, setModal, setMode, setPalette, setPresent, showFull, undo]);

  return (
    <div className={present ? "app is-present" : "app"} data-voice={voice}>
      <LabCanvas />
      <div className="vignette" />
      <div className="grain" />
      <Intro />
      <div className="chrome">
        <TopBar />
        <Library />
        <div className="stage-slot">
          <p className="hint-strip" dir={lang === "he" ? "rtl" : "ltr"}>
            <b>{voice === 1 ? t.look1 : voice === 2 ? t.look2 : t.look3}</b>
            <span>·</span>
            {t.hintDrag}
            <span>·</span>
            {t.hintWheel}
            <span>·</span>
            {t.hintClick}
          </p>
          <Crumb />
          {(solo || (aimed && selected)) && (
            <button type="button" className="back-btn" data-back onClick={() => showFull()}>
              {t.back}
            </button>
          )}
          {present && (
            <div className="present-bar" dir={lang === "he" ? "rtl" : "ltr"}>
              <strong>{design.label.text}</strong>
              <span>PERFUME LAB</span>
              <button type="button" onClick={() => requestShot((url) => {
                const link = document.createElement("a");
                link.href = url;
                link.download = "perfume-lab.png";
                link.click();
              })}>{t.export}</button>
              <button type="button" onClick={() => setPresent(false)}>{t.presentExit}</button>
            </div>
          )}
          {mode === "compare" && <CompareBoard />}
          <Timeline />
          <Dock />
        </div>
        <div className={`side-col ${sideOpen ? "is-open" : ""}`}>
          <Inspector />
          <ChatPanel />
        </div>
      </div>
      {hovered && (
        <div className="tip" style={{ left: hovered.x, top: hovered.y }}>
          {partLabel[lang][hovered.part]}
        </div>
      )}
      <CommandPalette />
      <ShortcutHelp />
      <Modals />
      <SwapFlash />
    </div>
  );
}

function SwapFlash() {
  const voice = useLab((s) => s.voice);
  const design = useLab((s) => s.design);
  const sig = `${design.bottle.variantId}|${design.cap.variantId}|${design.pump.variantId}|${design.collar.variantId}|${design.label.variantId}|${design.box.variantId}`;
  const seen = useRef(sig);
  useEffect(() => {
    if (voice !== 3) {
      seen.current = sig;
      return;
    }
    if (seen.current === sig) return;
    seen.current = sig;
    const root = document.querySelector(".app");
    root?.classList.add("is-swapping");
    const timer = window.setTimeout(() => root?.classList.remove("is-swapping"), 480);
    return () => window.clearTimeout(timer);
  }, [sig, voice]);
  return null;
}
