import { useEffect, useRef, useState } from "react";
import { LabCanvas } from "./scene/LabCanvas.tsx";
import { applyTheme } from "./theme/themes.ts";
import { partLabel, tx, wizardTitle } from "./i18n/copy.ts";
import { pngDownloadName } from "./ui/pngName.ts";
import { useLab } from "./store/labStore.ts";
import { applyIncomingShareHash, invalidShareMessage, missingPartsMessage, respondToLocation } from "./model/share.ts";
import { backSurface, handleHistoryPop, syncHistoryTrap, wizardStepAfterPop, type BackAction, type Trap } from "./nav/backHistory.ts";
import { clipToast } from "./ui/toast.ts";
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
import { acknowledgePackLoads, adoptLoadedSuppliers, loadPacks } from "./import/supplierDb.ts";
import { isKnownPack, withInnerStructure } from "./model/boxFields.ts";
import { packById } from "./model/closures/registry.ts";
import { hydrateDesign } from "./model/design.ts";

function applyBackAction(action: Exclude<BackAction, "leave">, trap: Trap) {
  const lab = useLab.getState();
  if (action === "modal") lab.setModal(null);
  else if (action === "present") lab.setPresent(false);
  else if (action === "overlays") {
    lab.setPalette(false);
    lab.setHelp(false);
  }   else if (action === "selection") lab.showFull();
  else if (action === "share") lab.setShareUrl("");
  else if (action === "stage") lab.setStage("bottle");
  else if (action === "wizard") {
    const step = wizardStepAfterPop(history, trap);
    if (step === null) return;
    const design = useLab.getState().design;
    if ((design.step ?? 0) === step) return;
    useLab.setState({
      design: { ...design, step },
      stage: step === 6 ? "box" : "bottle",
    });
  } else if (action === "mode") {
    // Zero before setMode so the assemble tween does not leave explode open and re-arm history.
    useLab.setState({ explode: 0 });
    lab.setMode("assemble");
  }
}

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
  const past = useLab((s) => s.past.length);
  const future = useLab((s) => s.future.length);
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
  const stage = useLab((s) => s.stage);
  const boxOpen = useLab((s) => s.boxOpen);
  const quality = useLab((s) => s.quality);
  const modal = useLab((s) => s.modal);
  const setModal = useLab((s) => s.setModal);
  const toast = useLab((s) => s.toast);
  const explode = useLab((s) => s.explode);
  const wizardStep = useLab((s) => s.design.step);
  const shareUrl = useLab((s) => s.shareUrl);
  const trapRef = useRef<Trap>({ armed: false });
  const [hintOn, setHintOn] = useState(true);
  const [shareLock, setShareLock] = useState(() => location.hash.startsWith("#d="));
  const [swapping, setSwapping] = useState(false);

  const sig = `${design.bottle.variantId}|${design.cap.variantId}|${design.pump.variantId}|${design.collar.variantId}|${design.label.variantId}|${design.box.variantId}`;
  const seen = useRef(sig);
  useEffect(() => {
    if (voice !== 3) {
      seen.current = sig;
      return;
    }
    if (seen.current === sig) return;
    seen.current = sig;
    setSwapping(true);
    const timer = window.setTimeout(() => setSwapping(false), 480);
    return () => window.clearTimeout(timer);
  }, [sig, voice]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.pose = `${stage}:${boxOpen ? "open" : "closed"}:${design.box.structure}:${quality}`;
  }, [stage, boxOpen, design.box.structure, quality]);

  useEffect(() => {
    let cancelled = false;
    const ready = loadPacks().then((loaded) => {
      if (cancelled) return;
      if (adoptLoadedSuppliers(loaded, useLab.getState().suppliers.length)) {
        useLab.getState().setSuppliers(loaded.packs, loaded.warnings);
        acknowledgePackLoads(loaded.unseenKeys);
      }
    }).catch(() => undefined);
    const hydrated = new Promise<void>((resolve) => {
      if (useLab.persist.hasHydrated()) {
        resolve();
        return;
      }
      const unsub = useLab.persist.onFinishHydration(() => {
        unsub();
        resolve();
      });
    });
    const applyShare = () => {
      if (location.hash.startsWith("#d=")) setShareLock(true);
      return applyIncomingShareHash({
        read: () => ({
          hash: location.hash,
          pathname: location.pathname,
          search: location.search,
          state: history.state,
        }),
        ready,
        hydrated,
        cancelled: () => cancelled,
        baseline: () => useLab.getState().design,
        noteMissing: (ids) => {
          const lang = useLab.getState().lang;
          useLab.setState({ toast: clipToast(missingPartsMessage(lang, ids)) });
        },
        noteInvalid: () => {
          useLab.setState({ toast: invalidShareMessage(useLab.getState().lang) });
        },
        apply: (design) => useLab.setState({ design }),
        replaceState: (state, title, url) => history.replaceState(state, title, url),
      }).finally(() => {
        if (!cancelled) setShareLock(false);
      });
    };
    void applyShare();
    const trap = trapRef.current;
    const surface = () => backSurface(useLab.getState());
    syncHistoryTrap(history, surface(), trap);
    const onPop = () => {
      void respondToLocation({
        kind: "pop",
        hash: location.hash,
        applyShare,
        back: () => {
          useLab.getState().applyVoiceParam(new URLSearchParams(location.search).get("voice"));
          handleHistoryPop(history, surface(), (action) => applyBackAction(action, trap), surface, trap);
        },
      });
    };
    const onHash = () => {
      void respondToLocation({
        kind: "hash",
        hash: location.hash,
        applyShare,
        back: () => undefined,
      });
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onHash);
    return () => {
      cancelled = true;
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  useEffect(() => {
    syncHistoryTrap(history, backSurface(useLab.getState()), trapRef.current);
  }, [aimed, explode, helpOpen, modal, mode, palette, present, shareUrl, solo, stage, wizardStep]);

  useEffect(() => {
    const applyShot = () => {
      const params = new URLSearchParams(location.search);
      const closure = params.get("closure") ?? params.get("structure");
      if (!isKnownPack(closure)) return;
      const choice = packById(closure);
      if (!choice) return;
      const design = hydrateDesign(useLab.getState().design);
      design.box.structure = choice.structure.id;
      design.box.latch = choice.latch;
      design.box.layers = withInnerStructure(design.box.layers, choice.structure.id, choice.latch);
      const variant = params.get("variant");
      if (variant && choice.structure.liftOff?.variants.some((item) => item.id === variant)) {
        design.box.liftOff = { ...design.box.liftOff, variant };
      }
      const pull = params.get("pull");
      if (pull === "ribbon" || pull === "notch" || pull === "none") design.box.drawerPull = pull;
      design.box.visible = true;
      design.bottle.visible = true;
      design.cap.visible = true;
      design.pump.visible = true;
      design.collar.visible = true;
      design.liquid.visible = true;
      design.label.visible = true;
      if (params.get("orient") === "lying") design.box.insert.orientation = "lying";
      const tier = params.get("tier") === "fallback" ? "fallback" as const : "high" as const;
      useLab.setState({
        design,
        stage: "box",
        boxOpen: params.get("pose") === "open",
        cutaway: params.get("cut") === "1",
        quality: tier,
        tierLock: true,
        theme: "light",
        libraryOpen: false,
        sideOpen: false,
        explode: 0,
        blueprint: false,
        selected: "box",
      });
    };
    if (useLab.persist.hasHydrated()) applyShot();
    return useLab.persist.onFinishHydration(() => {
      applyShot();
    });
  }, []);

  useEffect(() => {
    const fade = () => setHintOn(false);
    window.addEventListener("pointerdown", fade, { once: true });
    window.addEventListener("wheel", fade, { once: true });
    return () => {
      window.removeEventListener("pointerdown", fade);
      window.removeEventListener("wheel", fade);
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => useLab.setState({ toast: "" }), toast.length > 80 ? 6000 : 1600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => () => stopSpeaking(), [voice]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (shareLock) return;
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
        if (mode === "compare") {
          setMode("assemble");
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
  }, [cycle, helpOpen, lang, modal, mode, palette, present, redo, resetView, setHelp, setModal, setMode, setPalette, setPresent, shareLock, showFull, undo]);

  return (
    <div className={`app ${present ? "is-present" : ""} ${swapping ? "is-swapping" : ""} ${shareLock ? "is-share-lock" : ""}`.trim()} data-voice={voice} inert={shareLock ? true : undefined}>
      <LabCanvas />
      <div className="vignette" />
      <div className="grain" />
      <Intro />
      <div className="chrome">
        <TopBar />
        <Library />
        <div className="stage-slot">
          <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8, pointerEvents: 'auto', zIndex: 10 }} dir={lang === "he" ? "rtl" : "ltr"}>
            <button type="button" className="icon-btn" style={{ background: 'var(--bg)' }} onClick={() => undo()} disabled={past === 0}>{t.undo}</button>
            <button type="button" className="icon-btn" style={{ background: 'var(--bg)' }} onClick={() => redo()} disabled={future === 0}>{t.redo}</button>
          </div>
          {design.step !== undefined && design.step < 7 ? (
            <p className="hint-strip" style={{ opacity: 1 }} dir={lang === "he" ? "rtl" : "ltr"}>
              <b>{wizardTitle(lang, design.step)}</b>
            </p>
          ) : (
            <p className={hintOn ? "hint-strip" : "hint-strip is-faded"} dir={lang === "he" ? "rtl" : "ltr"}>
              <b>{voice === 1 ? t.look1 : voice === 2 ? t.look2 : t.look3}</b>
              <span>·</span>
              {t.hintDrag}
              <span>·</span>
              {t.hintWheel}
              <span>·</span>
              {t.hintClick}
            </p>
          )}
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
              <button type="button" onClick={() => {
                useLab.setState({ exporting: true });
                requestShot((url) => {
                  useLab.setState({ exporting: false });
                  const link = document.createElement("a");
                  link.href = url;
                  const day = new Date().toISOString().slice(0, 10);
                  link.download = pngDownloadName(design.label.text, "", day);
                  link.click();
                });
              }}>{t.export}</button>
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
      {shareLock && (
        <div className="share-wait" role="status" dir={lang === "he" ? "rtl" : "ltr"}>
          <span className="share-wait-spin" aria-hidden />
          <span>{lang === "he" ? "טוען עיצוב" : "Loading design"}</span>
        </div>
      )}
      {toast && <div className="toast" dir={lang === "he" ? "rtl" : "ltr"}>{clipToast(toast)}</div>}
      {hovered && !present && (
        <div className="tip" style={{ left: hovered.x, top: hovered.y }}>
          {partLabel[lang][hovered.part]}
        </div>
      )}
      <CommandPalette />
      <ShortcutHelp />
      <Modals />
    </div>
  );
}
