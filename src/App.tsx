import { useEffect, useRef } from "react";
import { LabCanvas } from "./scene/LabCanvas.tsx";
import { applyTheme } from "./theme/themes.ts";
import { partLabel, tx } from "./i18n/copy.ts";
import { useLab } from "./store/labStore.ts";
import { TopBar } from "./ui/TopBar.tsx";
import { Library } from "./ui/Library.tsx";
import { Inspector } from "./ui/Inspector.tsx";
import { ChatPanel } from "./ui/ChatPanel.tsx";
import { Dock } from "./ui/Dock.tsx";
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
        if (modal) {
          setModal(null);
          return;
        }
        if (!typing) showFull();
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
      if (event.key === "e" || event.key === "E") setMode(mode === "explode" ? "assemble" : "explode");
      if (event.key === "0") resetView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycle, lang, modal, mode, redo, resetView, setModal, setMode, showFull, undo]);

  return (
    <div className="app" data-voice={voice}>
      <LabCanvas />
      <div className="vignette" />
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
          {mode === "compare" && <CompareBoard />}
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
