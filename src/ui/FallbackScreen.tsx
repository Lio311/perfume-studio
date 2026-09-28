import { Component, useEffect, useLayoutEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { noteStudioFrame } from "../boot/splash.ts";
import { createPortal } from "react-dom";
import { SUPPLIER_DB_NAME } from "../import/supplierDb.ts";
import { pauseLabStorageWrites, readStorageValue, resetPersistedPayload } from "../store/hydrate.ts";
import { useLab } from "../store/labStore.ts";
import { webglAvailable } from "../scene/webgl.ts";
import type { Lang } from "../model/types.ts";

const COPY: Record<Lang, {
  webglTitle: string;
  webglBody: string;
  designTitle: string;
  designBody: string;
  appTitle: string;
  appBody: string;
  reload: string;
  resetDesign: string;
  appConfirmBody: string;
  reset: string;
  retry: string;
  confirmTitle: string;
  confirmBody: string;
  confirmYes: string;
  confirmNo: string;
}> = {
  he: {
    webglTitle: "התצוגה התלת־ממדית לא זמינה",
    webglBody: "הדפדפן לא הצליח להפעיל את WebGL, או שהמנוע הגרפי נעצר. נסו לרענן את העמוד, לעדכן את הדפדפן, או להפעיל האצת חומרה.",
    designTitle: "לא הצלחנו להציג את העיצוב",
    designBody: "אפשר לנסות שוב עם העיצוב הנוכחי, או לאפס לבקבוק ההתחלתי.",
    appTitle: "לא הצלחנו להציג את המעבדה",
    appBody: "אירעה שגיאה בטעינת העיצוב. רענון שומר את העיצוב. איפוס מוחק אותו ומתחיל מחדש.",
    reload: "רענון",
    resetDesign: "איפוס עיצוב",
    appConfirmBody: "האיפוס מאפס את העיצוב ואת מצב הממשק ומוחק את היסטוריית הביטול. הסקיצות השמורות, הצ'אט וההעלאות נשארים. קטלוגי הספקים נשארים.",
    reset: "איפוס",
    retry: "נסו שוב",
    confirmTitle: "לאפס את העיצוב?",
    confirmBody: "האיפוס מוחק את העיצוב, את הביטולים ואת שלב האשף.",
    confirmYes: "כן, אפס",
    confirmNo: "ביטול",
  },
  en: {
    webglTitle: "3D view unavailable",
    webglBody: "The browser could not start WebGL, or the renderer stopped. Refresh the page, update the browser, or turn on hardware acceleration.",
    designTitle: "This design could not be shown",
    designBody: "Try the current design again, or reset to a fresh bottle.",
    appTitle: "The lab could not be shown",
    appBody: "Something went wrong while loading the design. Reload keeps it. Reset clears it and starts over.",
    reload: "Reload",
    resetDesign: "Reset design",
    appConfirmBody: "Resets the design and interface state and clears undo history. Saved sketches, chat, and uploads stay. Supplier catalogs stay.",
    reset: "Reset",
    retry: "Try again",
    confirmTitle: "Reset this design?",
    confirmBody: "Reset discards the design, undo history, and the wizard step.",
    confirmYes: "Yes, reset",
    confirmNo: "Cancel",
  },
};

export interface SceneProbe {
  webglOk: boolean;
  contextLost: boolean;
}

export function isWebglFailure(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /webgl|webglcontext|context lost/i.test(message);
}

let renderer: { isContextLost(): boolean } | null = null;
let probeOverride: (() => SceneProbe) | null = null;

/** The live WebGL context, so a crash can ask `isContextLost()` before the canvas unmounts. */
export function noteRenderer(gl: { isContextLost(): boolean } | null): void {
  renderer = gl;
}

/** Tests pin the probe. The app reads WebGL availability and whether the context is lost. */
export function installSceneProbe(probe: (() => SceneProbe) | null): void {
  probeOverride = probe;
}

export function probeSceneNow(): SceneProbe {
  if (probeOverride) return probeOverride();
  let contextLost = false;
  try {
    contextLost = Boolean(renderer?.isContextLost());
  } catch {
    contextLost = true;
  }
  return { webglOk: webglAvailable(), contextLost };
}

let suppressContextLost = false;

/** A design error unmounts the canvas, which can fire a context-lost event. That must not replace the reset screen. */
export function noteSceneError(designError: boolean): void {
  if (designError) suppressContextLost = true;
}

export function contextLostSuppressed(): boolean {
  return suppressContextLost;
}

export function clearSceneError(): void {
  suppressContextLost = false;
}

/**
 * Try again is always available. Reset is offered whenever WebGL is still up,
 * including a geometry or texture throw that `computeFit` does not catch.
 * A screen with no reset means WebGL is unavailable or the context is lost.
 */
export function sceneFallbackFor(error: unknown, probe: SceneProbe): { kind: "webgl" | "design"; reset: boolean; retry: true } {
  void error;
  if (!probe.webglOk || probe.contextLost) return { kind: "webgl", reset: false, retry: true };
  return { kind: "design", reset: true, retry: true };
}

function useLang(): Lang {
  useLab((s) => s.lang);
  return useLab.getState().lang;
}

export function StageFallback({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setSlot(document.querySelector(".stage-slot"));
  }, []);
  if (!slot) return null;
  return createPortal(children, slot);
}

export function FallbackScreen({
  title,
  body,
  actionLabel,
  onAction,
  cancelLabel,
  onCancel,
  page = false,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  cancelLabel?: string;
  onCancel?: () => void;
  page?: boolean;
}) {
  const lang = useLang();
  return (
    <div className={page ? "boot-fallback is-page" : "boot-fallback"} dir={lang === "he" ? "rtl" : "ltr"} lang={lang} role="alert">
      <div className="boot-fallback-card">
        <h1>{title}</h1>
        <p>{body}</p>
        {actionLabel && onAction && (
          <button type="button" onClick={onAction}>
            {actionLabel}
          </button>
        )}
        {cancelLabel && onCancel && (
          <button type="button" className="is-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/** Reset throws away the design, undo stack, and wizard step, so it asks first. */
export function ConfirmReset({
  title,
  body,
  page = false,
  onReset,
}: {
  title: string;
  body: string;
  page?: boolean;
  onReset: () => void;
}) {
  const text = COPY[useLang()];
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <FallbackScreen
        page={page}
        title={text.confirmTitle}
        body={text.confirmBody}
        actionLabel={text.confirmYes}
        onAction={onReset}
        cancelLabel={text.confirmNo}
        onCancel={() => setConfirming(false)}
      />
    );
  }
  return <FallbackScreen page={page} title={title} body={body} actionLabel={text.reset} onAction={() => setConfirming(true)} />;
}

function ReleaseSplash() {
  useEffect(() => {
    noteStudioFrame();
  }, []);
  return null;
}

export function WebglFallback({ onRetry }: { onRetry?: () => void }) {
  const text = COPY[useLang()];
  return (
    <>
      <ReleaseSplash />
      <FallbackScreen title={text.webglTitle} body={text.webglBody} actionLabel={text.retry} onAction={onRetry} />
    </>
  );
}

export function DesignFallback({ onReset, onRetry }: { onReset: () => void; onRetry: () => void }) {
  const text = COPY[useLang()];
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    noteStudioFrame();
  }, []);
  if (confirming) {
    return (
      <FallbackScreen
        title={text.confirmTitle}
        body={text.confirmBody}
        actionLabel={text.confirmYes}
        onAction={onReset}
        cancelLabel={text.confirmNo}
        onCancel={() => setConfirming(false)}
      />
    );
  }
  return (
    <FallbackScreen
      title={text.designTitle}
      body={text.designBody}
      actionLabel={text.retry}
      onAction={onRetry}
      cancelLabel={text.reset}
      onCancel={() => setConfirming(true)}
    />
  );
}

/** Zustand persist key for the design and the rest of the lab UI state. */
export const DESIGN_STORAGE_KEY = "perfume-lab-v1";

/**
 * localStorage keys removed by a confirmed design reset.
 * `perfume-lab-v1` is the design. Other `perfume-lab-*` keys are UI state.
 * `perfume-lab-suppliers` is the IndexedDB name for imported packs and is excluded
 * if the same name is ever written to localStorage.
 */
export function isResetStorageKey(key: string): boolean {
  if (!key.startsWith("perfume-lab-")) return false;
  if (key === SUPPLIER_DB_NAME || key.startsWith(`${SUPPLIER_DB_NAME}-`)) return false;
  return true;
}

export function clearPerfumeLabStorage(storage: Pick<Storage, "length" | "key" | "removeItem">): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && isResetStorageKey(key)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

/** Reloads the page and leaves the saved design in place. */
export function reloadKeepingDesign(reload: () => void = () => location.reload()): void {
  reload();
}

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

/** Replace the lab blob even when storage is already full. Other UI keys are dropped first. */
function writeResetBlob(json: string): void {
  const spare: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key !== DESIGN_STORAGE_KEY && isResetStorageKey(key)) spare.push(key);
  }
  for (const key of spare) localStorage.removeItem(key);
  
  const previous = localStorage.getItem(DESIGN_STORAGE_KEY);
  try {
    localStorage.setItem(DESIGN_STORAGE_KEY, json);
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    localStorage.removeItem(DESIGN_STORAGE_KEY);
    try {
      localStorage.setItem(DESIGN_STORAGE_KEY, json);
    } catch (secondError) {
      if (previous !== null) {
        try {
          localStorage.setItem(DESIGN_STORAGE_KEY, previous);
        } catch {
          // Ignore
        }
      }
      throw secondError;
    }
  }
}

/** Writes a trimmed lab blob, drops other UI keys, and reloads. Saved sketches, chat, and uploads stay. */
export function resetDesignAndReload(reload: () => void = () => location.reload()): void {
  pauseLabStorageWrites();
  try {
    if (typeof localStorage !== "undefined") {
      const parsed = readStorageValue(localStorage.getItem(DESIGN_STORAGE_KEY));
      const payload = resetPersistedPayload(parsed?.state, useLab.getState().lang);
      writeResetBlob(JSON.stringify(payload));
    }
  } catch (error) {
    console.error(error);
  }
  reload();
}

/** Fresh bottle, same history entry, no share hash left to replay. */
export function resetToFreshDesign(): void {
  history.replaceState(history.state, "", `${location.pathname}${location.search}`);
  const lab = useLab.getState();
  lab.newDesign();
  useLab.setState({
    present: false,
    palette: false,
    help: false,
    solo: null,
    aimed: false,
    selected: null,
    stage: "bottle",
    mode: "assemble",
    explode: 0,
  });
}

interface BoundaryState {
  failed: boolean;
}

/** Reload keeps the saved design. Reset asks first, then clears design and UI keys and reloads. */
function AppCrash({ onReload, onReset }: { onReload: () => void; onReset: () => void }) {
  const text = COPY[useLang()];
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <FallbackScreen
        page
        title={text.confirmTitle}
        body={text.appConfirmBody}
        actionLabel={text.confirmYes}
        onAction={onReset}
        cancelLabel={text.confirmNo}
        onCancel={() => setConfirming(false)}
      />
    );
  }
  return (
    <FallbackScreen
      page
      title={text.appTitle}
      body={text.appBody}
      actionLabel={text.reload}
      onAction={onReload}
      cancelLabel={text.resetDesign}
      onCancel={() => setConfirming(true)}
    />
  );
}

/** The only app-level boundary. A throw inside the stage is caught first by WebglBoundary. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info);
  }

  render(): ReactNode {
    if (this.state.failed) {
      return <AppCrash onReload={() => reloadKeepingDesign()} onReset={() => resetDesignAndReload()} />;
    }
    return this.props.children;
  }
}

interface SceneBoundaryState {
  failed: boolean;
  webgl: boolean;
  generation: number;
}

/** Catches a throw from the scene. Try again remounts. Reset is only offered while WebGL is alive. */
export class WebglBoundary extends Component<{ children: ReactNode }, SceneBoundaryState> {
  state: SceneBoundaryState = { failed: false, webgl: false, generation: 0 };
  private unsub: (() => void) | null = null;
  private ignoreDesign = false;

  static getDerivedStateFromError(error: unknown): Pick<SceneBoundaryState, "failed" | "webgl"> {
    const decision = sceneFallbackFor(error, probeSceneNow());
    noteSceneError(true);
    return { failed: true, webgl: decision.kind === "webgl" };
  }

  componentDidMount(): void {
    this.unsub = useLab.subscribe((state, previous) => {
      if (this.ignoreDesign || !this.state.failed) return;
      if (state.design === previous.design) return;
      this.retry();
    });
  }

  componentWillUnmount(): void {
    this.unsub?.();
    this.unsub = null;
  }

  retry = () => {
    this.ignoreDesign = true;
    clearSceneError();
    this.setState((state) => ({ failed: false, webgl: false, generation: state.generation + 1 }), () => {
      this.ignoreDesign = false;
    });
  };

  reset = () => {
    this.ignoreDesign = true;
    clearSceneError();
    resetToFreshDesign();
    this.setState((state) => ({ failed: false, webgl: false, generation: state.generation + 1 }), () => {
      this.ignoreDesign = false;
    });
  };

  render(): ReactNode {
    if (this.state.failed) {
      const notice = this.state.webgl
        ? <WebglFallback onRetry={this.retry} />
        : <DesignFallback onReset={this.reset} onRetry={this.retry} />;
      return <StageFallback>{notice}</StageFallback>;
    }
    return <div key={this.state.generation} data-generation={this.state.generation}>{this.props.children}</div>;
  }
}
