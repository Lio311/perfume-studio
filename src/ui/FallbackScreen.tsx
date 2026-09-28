import { Component, useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLab } from "../store/labStore.ts";
import type { Lang } from "../model/types.ts";

const COPY: Record<Lang, {
  webglTitle: string;
  webglBody: string;
  designTitle: string;
  designBody: string;
  appTitle: string;
  appBody: string;
  reset: string;
}> = {
  he: {
    webglTitle: "התצוגה התלת־ממדית לא זמינה",
    webglBody: "הדפדפן לא הצליח להפעיל את WebGL, או שהמנוע הגרפי נעצר. נסו לרענן את העמוד, לעדכן את הדפדפן, או להפעיל האצת חומרה.",
    designTitle: "לא הצלחנו להציג את העיצוב",
    designBody: "הקישור או העיצוב לא נטענו. אפשר לאפס ולחזור לבקבוק ההתחלתי.",
    appTitle: "לא הצלחנו להציג את המעבדה",
    appBody: "אירעה שגיאה בטעינת העיצוב. אפשר לאפס ולחזור לבקבוק ההתחלתי.",
    reset: "איפוס",
  },
  en: {
    webglTitle: "3D view unavailable",
    webglBody: "The browser could not start WebGL, or the renderer stopped. Refresh the page, update the browser, or turn on hardware acceleration.",
    designTitle: "This design could not be shown",
    designBody: "The link or the design failed to load. Reset to start from a fresh bottle.",
    appTitle: "The lab could not be shown",
    appBody: "Something went wrong while loading the design. Reset to start from a fresh bottle.",
    reset: "Reset",
  },
};

export function isWebglFailure(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /webgl|webglcontext|context lost/i.test(message);
}

let suppressContextLost = false;

/** A design error unmounts the canvas, which can fire a context-lost event. That must not replace the reset screen. */
export function noteSceneError(error: unknown): void {
  if (!isWebglFailure(error)) suppressContextLost = true;
}

export function contextLostSuppressed(): boolean {
  return suppressContextLost;
}

export function clearSceneError(): void {
  suppressContextLost = false;
}

/** A fit or render throw is a design error and can be reset. A context failure cannot. */
export function sceneFallbackFor(error: unknown): { kind: "webgl" | "design"; reset: boolean } {
  if (isWebglFailure(error)) return { kind: "webgl", reset: false };
  return { kind: "design", reset: true };
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
  page = false,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
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
      </div>
    </div>
  );
}

export function WebglFallback() {
  const text = COPY[useLang()];
  return <FallbackScreen title={text.webglTitle} body={text.webglBody} />;
}

export function DesignFallback({ onReset }: { onReset: () => void }) {
  const text = COPY[useLang()];
  return <FallbackScreen title={text.designTitle} body={text.designBody} actionLabel={text.reset} onAction={onReset} />;
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

/** Catches a render error outside the stage and offers a reset back to the default bottle. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  reset = () => {
    resetToFreshDesign();
    this.setState({ failed: false });
  };

  render(): ReactNode {
    if (this.state.failed) {
      const text = COPY[useLab.getState().lang];
      return (
        <FallbackScreen
          page
          title={text.appTitle}
          body={text.appBody}
          actionLabel={text.reset}
          onAction={this.reset}
        />
      );
    }
    return this.props.children;
  }
}

interface SceneBoundaryState {
  failed: boolean;
  webgl: boolean;
  generation: number;
}

/** Catches a throw from the scene. Design errors can reset; a WebGL failure cannot. */
export class WebglBoundary extends Component<{ children: ReactNode }, SceneBoundaryState> {
  state: SceneBoundaryState = { failed: false, webgl: false, generation: 0 };

  static getDerivedStateFromError(error: unknown): Pick<SceneBoundaryState, "failed" | "webgl"> {
    noteSceneError(error);
    return { failed: true, webgl: isWebglFailure(error) };
  }

  reset = () => {
    clearSceneError();
    resetToFreshDesign();
    this.setState((state) => ({ failed: false, webgl: false, generation: state.generation + 1 }));
  };

  render(): ReactNode {
    if (this.state.failed) {
      const notice = this.state.webgl ? <WebglFallback /> : <DesignFallback onReset={this.reset} />;
      return <StageFallback>{notice}</StageFallback>;
    }
    return <div key={this.state.generation}>{this.props.children}</div>;
  }
}
