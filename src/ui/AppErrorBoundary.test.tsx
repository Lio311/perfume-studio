/** @vitest-environment happy-dom */
import { act, Component, createElement, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { SUPPLIER_DB_NAME } from "../import/supplierDb.ts";
import { createDefaultDesign } from "../model/design.ts";
import { useLab } from "../store/labStore.ts";
import { AppErrorBoundary, clearPerfumeLabStorage, DESIGN_STORAGE_KEY, isResetStorageKey } from "./AppErrorBoundary.tsx";

function Boom(): ReactElement {
  throw new Error("Cannot read properties of undefined (reading 'variantId')");
}

function SceneBoom(): ReactElement {
  throw new Error("scene exploded");
}

class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render(): ReactNode {
    if (this.state.failed) return createElement("p", null, "try again");
    return this.props.children;
  }
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

describe("AppErrorBoundary", () => {
  it("renders the reset fallback when a child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    useLab.setState({ lang: "he" });
    const hebrew = mount(createElement(AppErrorBoundary, null, createElement(Boom)));
    expect(hebrew.el.textContent).toContain("איפוס עיצוב ורענון");
    expect(hebrew.el.querySelector("section")?.getAttribute("dir")).toBe("rtl");
    expect(hebrew.el.textContent).toContain("לא הצלחנו להציג את המעבדה.");
    hebrew.root.unmount();

    useLab.setState({ lang: "en" });
    const english = mount(createElement(AppErrorBoundary, null, createElement(Boom)));
    expect(english.el.textContent).toContain("Reset design & reload");
    expect(english.el.querySelector("section")?.getAttribute("dir")).toBe("ltr");
    expect(spy.mock.calls.some((call) => call.some((arg) => arg instanceof Error && /variantId/.test(arg.message)))).toBe(true);
    spy.mockRestore();
    english.root.unmount();
    useLab.setState({ lang: "he" });
  });

  it("asks before clearing design keys and leaves supplier storage alone", () => {
    const reload = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify({ design: { bottle: {}, cap: {} } }));
    localStorage.setItem(SUPPLIER_DB_NAME, "{\"packs\":[1]}");
    localStorage.setItem("token", "keep-me");
    const view = mount(createElement(AppErrorBoundary, null, createElement(Boom)));
    clickLabel(view.el, "איפוס עיצוב ורענון");
    expect(localStorage.getItem(DESIGN_STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(SUPPLIER_DB_NAME)).toBe("{\"packs\":[1]}");
    expect(reload).not.toHaveBeenCalled();
    expect(view.el.textContent).toContain("לאפס את העיצוב?");
    expect(view.el.textContent).toContain("כן, אפס");

    clickLabel(view.el, "ביטול");
    expect(view.el.textContent).toContain("איפוס עיצוב ורענון");
    expect(localStorage.getItem(DESIGN_STORAGE_KEY)).not.toBeNull();

    clickLabel(view.el, "איפוס עיצוב ורענון");
    const original = location.reload.bind(location);
    Object.defineProperty(location, "reload", { configurable: true, value: reload });
    clickLabel(view.el, "כן, אפס");
    Object.defineProperty(location, "reload", { configurable: true, value: original });
    expect(reload).toHaveBeenCalledOnce();
    expect(localStorage.getItem(DESIGN_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(SUPPLIER_DB_NAME)).toBe("{\"packs\":[1]}");
    expect(localStorage.getItem("token")).toBe("keep-me");
    view.root.unmount();
    vi.restoreAllMocks();
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

  it("lets an inner canvas boundary catch a scene throw", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const view = mount(createElement(
      AppErrorBoundary,
      null,
      createElement(CanvasBoundary, null, createElement(SceneBoom)),
    ));
    expect(view.el.textContent).toContain("try again");
    expect(view.el.textContent).not.toContain("איפוס עיצוב ורענון");
    view.root.unmount();
    vi.restoreAllMocks();
  });

  it("loads the exact stale blob without the error screen", async () => {
    localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify({ design: { bottle: {}, cap: {} } }));
    await act(async () => {
      await useLab.persist.rehydrate();
    });
    const design = useLab.getState().design;
    expect(design).toEqual(createDefaultDesign());
    const view = mount(createElement(AppErrorBoundary, null, createElement(Signature)));
    expect(view.el.textContent).toContain("cara-50|cap-cube-tall|pump-crimp|col-crimp|lg-foil-diamond|box-rigid");
    expect(view.el.textContent).not.toContain("איפוס עיצוב ורענון");
    expect(view.el.textContent).not.toContain("Reset design");
    view.root.unmount();
    localStorage.removeItem(DESIGN_STORAGE_KEY);
  });
});
