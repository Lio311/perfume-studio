import { useEffect } from "react";
import { LabCanvas } from "./scene/LabCanvas.tsx";
import { applyTheme } from "./theme/themes.ts";
import { partLabel } from "./i18n/copy.ts";
import { useLab } from "./store/labStore.ts";
import { TopBar } from "./ui/TopBar.tsx";
import { Library } from "./ui/Library.tsx";
import { Inspector } from "./ui/Inspector.tsx";
import { ChatPanel } from "./ui/ChatPanel.tsx";
import { Dock } from "./ui/Dock.tsx";
import { Modals } from "./ui/Modals.tsx";

export default function App() {
  const theme = useLab((s) => s.theme);
  const lang = useLab((s) => s.lang);
  const sideOpen = useLab((s) => s.sideOpen);
  const hovered = useLab((s) => s.hovered);
  const cycle = useLab((s) => s.cycle);
  const toggleExplode = useLab((s) => s.toggleExplode);
  const resetView = useLab((s) => s.resetView);
  const select = useLab((s) => s.select);
  const setModal = useLab((s) => s.setModal);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (event.key === "Escape") {
        setModal(null);
        if (!typing) select(null);
        return;
      }
      if (typing) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const dir = lang === "he" ? (event.key === "ArrowLeft" ? 1 : -1) : event.key === "ArrowRight" ? 1 : -1;
        cycle(dir);
      }
      if (event.key === "e" || event.key === "E") toggleExplode();
      if (event.key === "0") resetView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycle, lang, resetView, select, setModal, toggleExplode]);

  return (
    <div className="app">
      <LabCanvas />
      <div className="vignette" />
      <div className="chrome">
        <TopBar />
        <Library />
        <div className="stage-slot">
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
    </div>
  );
}
