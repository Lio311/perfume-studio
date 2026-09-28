import { Component, type ErrorInfo, type ReactNode } from "react";
import type { Lang } from "../model/types.ts";
import { useLab } from "../store/labStore.ts";

const COPY: Record<Lang, { message: string; reset: string }> = {
  he: {
    message: "לא הצלחנו להציג את המעבדה.",
    reset: "איפוס עיצוב ורענון",
  },
  en: {
    message: "The lab could not be shown.",
    reset: "Reset design & reload",
  },
};

export function clearPerfumeLabStorage(storage: Pick<Storage, "length" | "key" | "removeItem">): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key?.startsWith("perfume-lab-")) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

export function resetDesignAndReload(): void {
  try {
    if (typeof localStorage !== "undefined") clearPerfumeLabStorage(localStorage);
  } catch {
    // Storage can throw in private mode. Reload still drops the broken session.
  }
  if (typeof location !== "undefined") location.reload();
}

function readLang(): Lang {
  try {
    return useLab.getState().lang === "en" ? "en" : "he";
  } catch {
    return "he";
  }
}

interface BoundaryState {
  failed: boolean;
}

/** Catches a render error anywhere under the app, including outside the canvas. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const lang = readLang();
    const text = COPY[lang];
    return (
      <div className="lab-crash">
        <section dir={lang === "he" ? "rtl" : "ltr"}>
          <p>{text.message}</p>
          <button type="button" onClick={() => resetDesignAndReload()}>{text.reset}</button>
        </section>
      </div>
    );
  }
}
