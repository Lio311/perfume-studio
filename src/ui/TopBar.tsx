import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { tx } from "../i18n/copy.ts";
import { bottleById } from "../model/catalog.ts";
import { estimateMl } from "../model/design.ts";
import { requestShot } from "../scene/capture.ts";
import { useLab, type LabMode } from "../store/labStore.ts";
import { downloadSpec } from "./specSheet.ts";
import { VoiceSwitch } from "./VoiceSwitch.tsx";

const MODES: LabMode[] = ["assemble", "explode", "dimensions"];

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
  const stage = useLab((s) => s.stage);
  const blueprint = useLab((s) => s.blueprint);
  const setStage = useLab((s) => s.setStage);
  const setBlueprint = useLab((s) => s.setBlueprint);
  const undo = useLab((s) => s.undo);
  const redo = useLab((s) => s.redo);
  const libraryOpen = useLab((s) => s.libraryOpen);
  const sideOpen = useLab((s) => s.sideOpen);
  const setLibraryOpen = useLab((s) => s.setLibraryOpen);
  const setSideOpen = useLab((s) => s.setSideOpen);
  const [notice, setNotice] = useState("");
  const [menu, setMenu] = useState<null | "view" | "export">(null);
  const t = tx(lang);
  const ml = estimateMl(design);
  const spec = bottleById(design.bottle.variantId);
  const modeLabel: Record<LabMode, string> = {
    assemble: t.assemble,
    explode: t.explode,
    dimensions: t.dimensions,
    compare: t.compare,
  };

  function fileName() {
    const day = new Date().toISOString().slice(0, 10);
    const brand = (design.label.text || "OUD").replace(/[^\w\u0590-\u05FF-]+/g, "");
    const bottle = spec.name.en.replace(/\s+/g, "");
    return `${brand}_${bottle}_${day}.png`;
  }

  function share() {
    const json = JSON.stringify(design);
    const hash = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    const url = `${location.origin}${location.pathname}${location.search}#d=${hash}`;
    void navigator.clipboard?.writeText(url).then(
      () => {
        setNotice(t.shared);
        window.setTimeout(() => setNotice(""), 1800);
      },
      () => setNotice(url),
    );
    setMenu(null);
  }

  function exportPng() {
    useLab.setState({ exporting: true });
    requestShot((url) => {
      useLab.setState({ exporting: false });
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName();
      link.click();
      setNotice(t.pngSaved);
      window.setTimeout(() => setNotice(""), 1800);
    });
    setMenu(null);
  }

  function exportSpec() {
    downloadSpec(design, lang);
    setNotice(t.specSaved);
    window.setTimeout(() => setNotice(""), 1600);
    setMenu(null);
  }

  useEffect(() => {
    if (!menu) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || !(target instanceof Element) || !target.closest(".menu-wrap")) setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [menu]);

  return (
    <header className="topbar" dir={lang === "he" ? "rtl" : "ltr"}>
      <div className="brand">
        <strong>{t.brandLine}</strong>
        <p className="spec">
          <span>{t.project}</span>
          <span>·</span>
          <bdi>{design.label.text}</bdi>
          <span>·</span>
          <bdi>{ml} {lang === "he" ? "מ״ל" : "ml"}</bdi>
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
      <div className="voice-switch stage-switch" role="group" aria-label={t.stageBottle}>
        <button type="button" className={stage === "bottle" ? "is-on" : ""} onClick={() => setStage("bottle")}>{t.stageBottle}</button>
        <button type="button" className={stage === "box" ? "is-on" : ""} onClick={() => setStage("box")}>{t.stageBox}</button>
        <button type="button" className={stage === "together" ? "is-on" : ""} onClick={() => setStage("together")}>{t.stageTogether}</button>
      </div>
      <div className="view-controls" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button type="button" className={`text-btn blueprint-btn ${blueprint ? "is-on" : ""}`} aria-pressed={blueprint} onClick={() => setBlueprint(!blueprint)}>{t.blueprint}</button>
        <div className="voice-switch" role="group">
          <button type="button" className={theme === "light" ? "is-on" : ""} onClick={() => {
            if (theme === "light") return;
            const toggle = () => setTheme("light");
            if (document.startViewTransition) document.startViewTransition(() => flushSync(toggle));
            else toggle();
          }}>{t.themeToLight}</button>
          <button type="button" className={theme === "dark" ? "is-on" : ""} onClick={() => {
            if (theme === "dark") return;
            const toggle = () => setTheme("dark");
            if (document.startViewTransition) document.startViewTransition(() => flushSync(toggle));
            else toggle();
          }}>{t.themeToDark}</button>
        </div>
        <VoiceSwitch />
      </div>
      <div className="menu-wrap">
        <button type="button" className={menu === "export" ? "text-btn is-on" : "text-btn"} onClick={() => setMenu(menu === "export" ? null : "export")}>{t.exportMenu}</button>
        {menu === "export" && (
          <div className="menu-pop">
            <button type="button" className="text-btn" onClick={share}>{t.share}</button>
            <button type="button" className="text-btn" onClick={exportPng}>{t.export}</button>
            <button type="button" className="text-btn spec-export" onClick={exportSpec}>{t.exportSpec}</button>
            <button type="button" className="text-btn" onClick={() => { setMode("compare"); setMenu(null); }}>{t.compare}</button>
          </div>
        )}
      </div>
      <div className="top-cluster">
        <button type="button" className="text-btn lang" onClick={() => setLang(lang === "he" ? "en" : "he")}>{lang === "he" ? "EN" : "עב"}</button>
        <button type="button" className="icon-btn" onClick={() => undo()} disabled={past === 0}>{t.undo}</button>
        <button type="button" className="icon-btn" onClick={() => redo()} disabled={future === 0}>{t.redo}</button>
        <button type="button" className="text-btn panel-toggle" onClick={() => setLibraryOpen(!libraryOpen)}>{t.library}</button>
        <button type="button" className="text-btn panel-toggle" onClick={() => setSideOpen(!sideOpen)}>{t.properties}</button>
      </div>
      {notice && <div className="toast">{notice}</div>}
    </header>
  );
}
