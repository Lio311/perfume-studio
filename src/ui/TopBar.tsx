import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { flushSync } from "react-dom";
import { tx } from "../i18n/copy.ts";
import { bottleById } from "../model/catalog.ts";
import { estimateMl } from "../model/design.ts";
import { requestShot } from "../scene/capture.ts";
import { useLab, type LabMode } from "../store/labStore.ts";
import { pngDownloadName } from "./pngName.ts";
import { clipToast } from "./toast.ts";
import { downloadSpec } from "./specSheet.ts";
import { VoiceSwitch } from "./VoiceSwitch.tsx";
import { encodeShareDesign } from "../model/share.ts";

const MODES: LabMode[] = ["assemble", "explode", "dimensions"];

export function TopBar() {
  const lang = useLab((s) => s.lang);
  const theme = useLab((s) => s.theme);
  const design = useLab((s) => s.design);
  const mode = useLab((s) => s.mode);
  const setLang = useLab((s) => s.setLang);
  const setTheme = useLab((s) => s.setTheme);
  const setMode = useLab((s) => s.setMode);
  const setModal = useLab((s) => s.setModal);
  const newDesign = useLab((s) => s.newDesign);
  const stage = useLab((s) => s.stage);
  const blueprint = useLab((s) => s.blueprint);
  const setStage = useLab((s) => s.setStage);
  const setBlueprint = useLab((s) => s.setBlueprint);
  const libraryOpen = useLab((s) => s.libraryOpen);
  const sideOpen = useLab((s) => s.sideOpen);
  const setLibraryOpen = useLab((s) => s.setLibraryOpen);
  const setSideOpen = useLab((s) => s.setSideOpen);
  const [notice, setNotice] = useState("");
  const shareUrl = useLab((s) => s.shareUrl);
  const setShareUrl = useLab((s) => s.setShareUrl);
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
    return pngDownloadName(design.label.text, spec.name.en, day);
  }

  function dismissShare() {
    setShareUrl("");
    setNotice("");
  }

  function share() {
    const hash = encodeShareDesign(design);
    const url = `${location.origin}${location.pathname}${location.search}#d=${hash}`;
    const write = navigator.clipboard?.writeText?.(url);
    const showLink = () => {
      setShareUrl(url);
      setNotice(lang === "he" ? "לא הצלחנו להעתיק. בחרו את הקישור והעתיקו אותו" : "Could not copy. Select the link and copy it");
    };
    if (!write) {
      showLink();
      setMenu(null);
      return;
    }
    void write.then(
      () => {
        setShareUrl("");
        setNotice(t.shared);
        window.setTimeout(() => setNotice(""), 1800);
      },
      showLink,
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
    if (!shareUrl) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissShare();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shareUrl, setShareUrl]);

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
        <div className="voice-switch">
          <button type="button" className={blueprint ? "is-on" : ""} aria-pressed={blueprint} onClick={() => setBlueprint(!blueprint)}>{t.blueprint}</button>
        </div>
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
      </div>
      <div className="menu-wrap">
        <div className="voice-switch">
          <button type="button" className={menu === "export" ? "is-on" : ""} onClick={() => setMenu(menu === "export" ? null : "export")}>{t.exportMenu}</button>
        </div>
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
        <button type="button" className="text-btn" onClick={() => newDesign()}>{lang === "he" ? "חדש" : "New"}</button>
        <button type="button" className="text-btn" onClick={() => setModal("save")}>{t.saved}</button>
        <button type="button" className="text-btn lang" onClick={() => setLang(lang === "he" ? "en" : "he")}>{lang === "he" ? "EN" : "עב"}</button>
        <button type="button" className="text-btn panel-toggle" onClick={() => setLibraryOpen(!libraryOpen)}>{t.library}</button>
        <button type="button" className="text-btn panel-toggle" onClick={() => setSideOpen(!sideOpen)}>{t.properties}</button>
      </div>
      {notice && createPortal(
        <div className="toast" dir={lang === "he" ? "rtl" : "ltr"}>{clipToast(notice)}</div>,
        document.body,
      )}
      {shareUrl && createPortal(
        <form className="share-fallback" dir="ltr" onSubmit={(event) => event.preventDefault()}>
          <button type="button" className="share-fallback-close" aria-label={lang === "he" ? "סגור" : "Close"} onClick={dismissShare}>×</button>
          <textarea
            readOnly
            rows={Math.max(4, Math.ceil(shareUrl.length / 84))}
            value={shareUrl}
            aria-label={t.share}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              event.stopPropagation();
              dismissShare();
            }}
          />
        </form>,
        document.body,
      )}
    </header>
  );
}
