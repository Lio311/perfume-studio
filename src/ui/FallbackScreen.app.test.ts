/** @vitest-environment happy-dom */
import { act, createElement, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SUPPLIER_DB_NAME } from "../import/supplierDb.ts";
import { createDefaultDesign } from "../model/design.ts";
import { createLabStorage, resumeLabStorageWrites } from "../store/hydrate.ts";
import { useLab } from "../store/labStore.ts";
import {
  AppErrorBoundary,
  DESIGN_STORAGE_KEY,
  WebglBoundary,
  clearPerfumeLabStorage,
  installSceneProbe,
  isResetStorageKey,
} from "./FallbackScreen.tsx";

function Boom(): ReactElement {
  throw new Error("Cannot read properties of undefined (reading 'variantId')");
}

function SceneBoom(): ReactNode {
  throw new Error("scene exploded");
}

function Signature(): ReactElement {
  const design = useLab((s) => s.design);
  const sig = `${design.bottle.variantId}|${design.cap.variantId}|${design.pump.variantId}|${design.collar.variantId}|${design.label.variantId}|${design.box.variantId}`;
  return createElement("p", null, sig);
}

function mount(node: ReactElement): { root: Root; el: HTMLDivElement } {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => {
    root.render(node);
  });
  return { root, el };
}

function clickLabel(el: HTMLElement, label: string) {
  const button = [...el.querySelectorAll("button")].find((item) => item.textContent === label);
  act(() => {
    button?.click();
  });
}

describe("app error boundary", () => {
  afterEach(() => {
    installSceneProbe(null);
    resumeLabStorageWrites();
    useLab.setState({ lang: "he" });
    vi.restoreAllMocks();
  });

  it("offers reload and a confirmed reset in the page language", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    useLab.setState({ lang: "he" });
    const hebrew = mount(createElement(AppErrorBoundary, null, createElement(Boom)));
    expect(hebrew.el.textContent).toContain("רענון");
    expect(hebrew.el.textContent).toContain("איפוס עיצוב");
    expect(hebrew.el.textContent).toContain("לא הצלחנו להציג את המעבדה");
    expect(hebrew.el.querySelector(".boot-fallback")?.getAttribute("dir")).toBe("rtl");
    expect(hebrew.el.querySelector(".boot-fallback")?.className).toContain("is-page");
    hebrew.root.unmount();

    useLab.setState({ lang: "en" });
    const english = mount(createElement(AppErrorBoundary, null, createElement(Boom)));
    expect(english.el.textContent).toContain("Reload");
    expect(english.el.textContent).toContain("Reset design");
    expect(english.el.querySelector(".boot-fallback")?.getAttribute("dir")).toBe("ltr");
    english.root.unmount();
  });

  it("reloads without clearing the saved design", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reload = vi.fn();
    localStorage.setItem(DESIGN_STORAGE_KEY, "{\"design\":{}}");
    const view = mount(createElement(AppErrorBoundary, null, createElement(Boom)));
    const original = location.reload.bind(location);
    Object.defineProperty(location, "reload", { configurable: true, value: reload });
    clickLabel(view.el, "רענון");
    Object.defineProperty(location, "reload", { configurable: true, value: original });
    expect(reload).toHaveBeenCalledOnce();
    expect(localStorage.getItem(DESIGN_STORAGE_KEY)).toBe("{\"design\":{}}");
    view.root.unmount();
    localStorage.removeItem(DESIGN_STORAGE_KEY);
  });

  it("asks before clearing design keys and leaves supplier storage alone", () => {
    const reload = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const saved = [{ id: "cfg-1", name: "נואר", design: createDefaultDesign(), thumb: "", createdAt: 4 }];
    const chat = [{ id: "c1", role: "user", text: "שלום" }];
    const pending = [{ id: "p1", name: "photo", category: "cap", files: [], createdAt: 3 }];
    localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify({
      state: {
        design: { bottle: { variantId: "diamond-50", visible: true } },
        theme: "light",
        lang: "en",
        chat,
        saved,
        pending,
        past: [createDefaultDesign()],
        future: [createDefaultDesign()],
        brief: { title: "עבודה" },
      },
      version: 4,
    }));
    localStorage.setItem("perfume-lab-draft", "1");
    localStorage.setItem(SUPPLIER_DB_NAME, "{\"packs\":[1]}");
    localStorage.setItem("token", "keep-me");
    const view = mount(createElement(AppErrorBoundary, null, createElement(Boom)));
    clickLabel(view.el, "איפוס עיצוב");
    expect(localStorage.getItem(DESIGN_STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(SUPPLIER_DB_NAME)).toBe("{\"packs\":[1]}");
    expect(reload).not.toHaveBeenCalled();
    expect(view.el.textContent).toContain("לאפס את העיצוב?");
    expect(view.el.textContent).toContain("הסקיצות השמורות");
    expect(view.el.textContent).toContain("הצ'אט");
    expect(view.el.textContent).toContain("ההעלאות");
    expect(view.el.textContent).toContain("קטלוגי הספקים נשארים");

    clickLabel(view.el, "ביטול");
    expect(view.el.textContent).toContain("רענון");
    expect(localStorage.getItem(DESIGN_STORAGE_KEY)).not.toBeNull();

    clickLabel(view.el, "איפוס עיצוב");
    const original = location.reload.bind(location);
    Object.defineProperty(location, "reload", { configurable: true, value: reload });
    clickLabel(view.el, "כן, אפס");
    Object.defineProperty(location, "reload", { configurable: true, value: original });
    expect(reload).toHaveBeenCalledOnce();
    const stored = JSON.parse(localStorage.getItem(DESIGN_STORAGE_KEY) ?? "{}") as {
      state: {
        design: { bottle: { variantId: string; visible: boolean }; step?: number };
        chat: unknown;
        saved: unknown;
        pending: unknown;
        past: unknown[];
        future: unknown[];
        theme: string;
        lang: string;
        brief: { title: string };
      };
      version: number;
    };
    expect(stored.version).toBe(5);
    expect(stored.state.design.bottle.variantId).toBe("cara-50");
    expect(stored.state.design.bottle.visible).toBe(true);
    expect(stored.state.chat).toEqual(chat);
    expect(stored.state.saved).toEqual(saved);
    expect(stored.state.pending).toEqual(pending);
    expect(stored.state.past).toEqual([]);
    expect(stored.state.future).toEqual([]);
    expect(stored.state.theme).toBe("dark");
    expect(stored.state.lang).toBe("he");
    expect(stored.state.brief).toEqual({ title: "עבודה" });
    expect(localStorage.getItem("perfume-lab-draft")).toBeNull();
    const kept = localStorage.getItem(DESIGN_STORAGE_KEY);
    createLabStorage().setItem(DESIGN_STORAGE_KEY, { state: { design: { bottle: { variantId: "wiped" } } }, version: 5 });
    expect(localStorage.getItem(DESIGN_STORAGE_KEY)).toBe(kept);
    expect(localStorage.getItem(SUPPLIER_DB_NAME)).toBe("{\"packs\":[1]}");
    expect(localStorage.getItem("token")).toBe("keep-me");
    const fresh = createDefaultDesign();
    expect(fresh.bottle.variantId).toBe("cara-50");
    expect(fresh.bottle.visible).toBe(true);
    expect(fresh.bottle.heightMm).toBeGreaterThan(0);
    view.root.unmount();
  });

  it("clears design keys and skips the supplier database name", () => {
    const removed: string[] = [];
    const keys = [DESIGN_STORAGE_KEY, "perfume-lab-draft", SUPPLIER_DB_NAME, `${SUPPLIER_DB_NAME}-cache`, "token", "other"];
    clearPerfumeLabStorage({
      length: keys.length,
      key: (index) => keys[index] ?? null,
      removeItem: (key) => {
        removed.push(key);
      },
    });
    expect(removed).toEqual([DESIGN_STORAGE_KEY, "perfume-lab-draft"]);
    expect(isResetStorageKey(SUPPLIER_DB_NAME)).toBe(false);
    expect(SUPPLIER_DB_NAME.startsWith("perfume-lab-")).toBe(true);
  });

  it("leaves a scene crash to the canvas boundary", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    installSceneProbe(() => ({ webglOk: true, contextLost: false }));
    const slot = document.createElement("div");
    slot.className = "stage-slot";
    document.body.append(slot);
    const view = mount(createElement(AppErrorBoundary, null, createElement(WebglBoundary, null, createElement(SceneBoom))));
    expect(slot.textContent).toContain("לא הצלחנו להציג את העיצוב");
    expect(slot.textContent).toContain("נסו שוב");
    expect(view.el.textContent).not.toContain("לא הצלחנו להציג את המעבדה");
    view.root.unmount();
    slot.remove();
  });

  it("loads the exact stale blob without the error screen", async () => {
    localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify({ design: { bottle: {}, cap: {} } }));
    await act(async () => {
      await useLab.persist.rehydrate();
    });
    const design = useLab.getState().design;
    const fresh = createDefaultDesign();
    delete fresh.step;
    expect(design).toEqual(fresh);
    const view = mount(createElement(AppErrorBoundary, null, createElement(Signature)));
    expect(view.el.textContent).toContain("cara-50|cap-cube-tall|pump-crimp|col-crimp|lg-foil-diamond|box-rigid");
    expect(view.el.textContent).not.toContain("איפוס עיצוב");
    expect(view.el.textContent).not.toContain("Reset design");
    view.root.unmount();
    localStorage.removeItem(DESIGN_STORAGE_KEY);
  });
});
