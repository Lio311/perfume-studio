import { Component, type ErrorInfo, type ReactNode } from "react";
import { SUPPLIER_DB_NAME } from "../import/supplierDb.ts";
import type { Lang } from "../model/types.ts";
import { useLab } from "../store/labStore.ts";

const COPY: Record<Lang, {
  message: string;
  reset: string;
  confirmTitle: string;
  confirmBody: string;
  confirmYes: string;
  confirmNo: string;
}> = {
  he: {
    message: "לא הצלחנו להציג את המעבדה.",
    reset: "איפוס עיצוב ורענון",
    confirmTitle: "לאפס את העיצוב?",
    confirmBody: "האיפוס מוחק את העיצוב, את הביטולים ואת שלב האשף, ואז מרענן. קטלוגי הספקים נשארים.",
    confirmYes: "כן, אפס",
    confirmNo: "ביטול",
  },
  en: {
    message: "The lab could not be shown.",
    reset: "Reset design & reload",
    confirmTitle: "Reset this design?",
    confirmBody: "Reset clears the design, undo history, and the wizard step, then reloads. Supplier catalogs stay.",
    confirmYes: "Yes, reset",
    confirmNo: "Cancel",
  },
};

/** Zustand persist key for the design and the rest of the lab UI state. */
export const DESIGN_STORAGE_KEY = "perfume-lab-v1";

/**
 * localStorage keys removed by a confirmed reset.
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

/** Clears design and UI localStorage keys, then reloads. Does not open IndexedDB. */
export function resetDesignAndReload(reload: () => void = () => location.reload()): void {
  try {
    if (typeof localStorage !== "undefined") clearPerfumeLabStorage(localStorage);
  } catch {
    // Private mode can throw. Reload still drops the broken session.
  }
  reload();
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
  confirming: boolean;
}

/**
 * Outermost boundary. It catches a throw in the app shell, outside the canvas.
 * A throw inside the 3D scene is caught first by a canvas boundary nested under this one.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false, confirming: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true, confirming: false };
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
          {this.state.confirming ? (
            <>
              <h1>{text.confirmTitle}</h1>
              <p>{text.confirmBody}</p>
              <div className="actions">
                <button type="button" onClick={() => resetDesignAndReload()}>{text.confirmYes}</button>
                <button type="button" className="is-ghost" onClick={() => this.setState({ confirming: false })}>{text.confirmNo}</button>
              </div>
            </>
          ) : (
            <>
              <p>{text.message}</p>
              <button type="button" onClick={() => this.setState({ confirming: true })}>{text.reset}</button>
            </>
          )}
        </section>
      </div>
    );
  }
}
