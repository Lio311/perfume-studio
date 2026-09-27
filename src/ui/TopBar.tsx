import { useState } from "react";
import { tx } from "../i18n/copy.ts";
import { bottleById } from "../model/catalog.ts";
import { estimateMl } from "../model/design.ts";
import { requestShot } from "../scene/capture.ts";
import { useLab, type LabMode } from "../store/labStore.ts";

const MODES: LabMode[] = ["assemble", "explode", "dimensions", "compare"];

export function TopBar() {
  const lang = useLab((s) => s.lang);
  const theme = useLab((s) => s.theme);
  const design = useLab((s) => s.design);
  const mode = useLab((s) => s.mode);
  const past = useLab((s) => s.past.length);
  const future = useLab((s) => s.future.length);
  const setLang = useLab((s) => s.setLang);
  const setTheme = useLab((s) => s.setTheme);
  const setMode = useLab((s) => s.setMode);
  const undo = useLab((s) => s.undo);
  const redo = useLab((s) => s.redo);
  const libraryOpen = useLab((s) => s.libraryOpen);
  const sideOpen = useLab((s) => s.sideOpen);
  const setLibraryOpen = useLab((s) => s.setLibraryOpen);
  const setSideOpen = useLab((s) => s.setSideOpen);
  const [notice, setNotice] = useState("");
  const t = tx(lang);
  const ml = estimateMl(design);
  const spec = bottleById(design.bottle.variantId);
  const modeLabel: Record<LabMode, string> = {
    assemble: t.assemble,
    explode: t.explode,
    dimensions: t.dimensions,
    compare: t.compare,
  };

  function share() {
    const summary = `${ml} ml · ${design.bottle.neck} · ${design.bottle.heightMm.toFixed(1)}×${design.bottle.widthMm.toFixed(1)}×${design.bottle.depthMm.toFixed(1)} mm`;
    const payload = `${summary}\n${JSON.stringify(design)}`;
    void navigator.clipboard?.writeText(payload).then(
      () => {
        setNotice(t.shared);
        window.setTimeout(() => setNotice(""), 1600);
      },
      () => setNotice(summary),
    );
  }

  function exportPng() {
    requestShot((url) => {
      const link = document.createElement("a");
      link.href = url;
      link.download = "perfume-lab.png";
      link.click();
    });
  }

  return (
    <header className="topbar">
      <div className="brand" dir={lang === "he" ? "rtl" : "ltr"}>
        <span className="kicker">{t.kicker}</span>
        <strong>{lang === "he" ? t.appHe : t.appEn}</strong>
        <p className="spec" dir="ltr">
          <bdi>{ml} ml</bdi>
          <span>·</span>
          <bdi>{design.bottle.neck.replace("FEA", "FEA ")}</bdi>
          <span>·</span>
          <bdi>
            {design.bottle.heightMm.toFixed(1)}×{design.bottle.widthMm.toFixed(1)}×{design.bottle.depthMm.toFixed(1)}
          </bdi>
          <span className="spec-name">{lang === "he" ? spec.name.he : spec.name.en}</span>
        </p>
      </div>
      <div className="modes" dir="ltr" role="tablist">
        {MODES.map((key) => (
          <button key={key} type="button" className={mode === key ? "is-on" : ""} onClick={() => setMode(key)}>
            {modeLabel[key]}
          </button>
        ))}
      </div>
      <div className="top-cluster">
        <button type="button" className="icon-btn" onClick={() => undo()} disabled={past === 0}>{t.undo}</button>
        <button type="button" className="icon-btn" onClick={() => redo()} disabled={future === 0}>{t.redo}</button>
        <button type="button" className="icon-btn" onClick={share}>{t.share}</button>
        <button type="button" className="icon-btn" onClick={exportPng}>{t.export}</button>
        <button type="button" className="text-btn panel-toggle" onClick={() => setLibraryOpen(!libraryOpen)}>{t.library}</button>
        <button type="button" className="text-btn panel-toggle" onClick={() => setSideOpen(!sideOpen)}>{t.properties}</button>
        <button type="button" className="text-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? t.themeToLight : t.themeToDark}
        </button>
        <button type="button" className="text-btn lang" onClick={() => setLang(lang === "he" ? "en" : "he")}>{t.lang}</button>
      </div>
      {notice && <div className="toast">{notice}</div>}
    </header>
  );
}
