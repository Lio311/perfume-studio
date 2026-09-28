/** @vitest-environment happy-dom */
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useLab } from "../store/labStore.ts";
import { AppErrorBoundary, clearPerfumeLabStorage } from "./AppErrorBoundary.tsx";

function Boom(): ReactElement {
  throw new Error("Cannot read properties of undefined (reading 'variantId')");
}

function renderBoundary(): { root: Root; el: HTMLDivElement } {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => {
    root.render(createElement(AppErrorBoundary, null, createElement(Boom)));
  });
  return { root, el };
}

describe("AppErrorBoundary", () => {
  it("renders the reset fallback when a child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    useLab.setState({ lang: "he" });
    const hebrew = renderBoundary();
    expect(hebrew.el.textContent).toContain("איפוס עיצוב ורענון");
    expect(hebrew.el.querySelector("section")?.getAttribute("dir")).toBe("rtl");
    expect(hebrew.el.textContent).toContain("לא הצלחנו להציג את המעבדה.");
    hebrew.root.unmount();

    useLab.setState({ lang: "en" });
    const english = renderBoundary();
    expect(english.el.textContent).toContain("Reset design & reload");
    expect(english.el.querySelector("section")?.getAttribute("dir")).toBe("ltr");
    expect(spy.mock.calls.some((call) => call.some((arg) => arg instanceof Error && /variantId/.test(arg.message)))).toBe(true);
    spy.mockRestore();
    english.root.unmount();
    useLab.setState({ lang: "he" });
  });

  it("clears only perfume-lab- keys", () => {
    const removed: string[] = [];
    const keys = ["perfume-lab-v1", "perfume-lab-draft", "token", "other"];
    clearPerfumeLabStorage({
      length: keys.length,
      key: (index) => keys[index] ?? null,
      removeItem: (key) => {
        removed.push(key);
      },
    });
    expect(removed).toEqual(["perfume-lab-v1", "perfume-lab-draft"]);
  });
});
