// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installSceneProbe, WebglBoundary } from "./FallbackScreen.tsx";
import { useLab } from "../store/labStore.ts";

describe("WebglBoundary", () => {
  let root: Root | null = null;
  let slot: HTMLDivElement | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    useLab.setState({ lang: "he" });
    slot = document.createElement("div");
    slot.className = "stage-slot";
    host = document.createElement("div");
    document.body.append(slot, host);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host?.remove();
    slot?.remove();
    installSceneProbe(null);
    vi.restoreAllMocks();
    useLab.setState({ lang: "he" });
  });

  it("catches a design crash, asks before reset, then remounts the scene", async () => {
    installSceneProbe(() => ({ webglOk: true, contextLost: false }));
    let mounts = 0;
    let broken = true;
    function Scene() {
      mounts += 1;
      if (broken) throw new TypeError("Cannot read properties of undefined (reading 'ferrule')");
      return createElement("p", { id: "scene" }, "scene-up");
    }

    root = createRoot(host!);
    await act(async () => {
      root?.render(createElement(WebglBoundary, null, createElement(Scene)));
    });

    expect(slot?.textContent).toContain("לא הצלחנו להציג את העיצוב");
    expect(slot?.textContent).toContain("נסו שוב");
    expect(slot?.textContent).toContain("איפוס");
    expect(document.getElementById("scene")).toBeNull();

    const clickText = (label: string) => {
      const node = [...(slot?.querySelectorAll("button") ?? [])].find((button) => button.textContent === label);
      if (node instanceof HTMLButtonElement) node.click();
    };

    await act(async () => {
      clickText("איפוס");
    });
    expect(slot?.textContent).toContain("לאפס את העיצוב?");
    expect(document.getElementById("scene")).toBeNull();
    const mountsBeforeReset = mounts;

    await act(async () => {
      clickText("ביטול");
    });
    expect(slot?.textContent).toContain("לא הצלחנו להציג את העיצוב");
    expect(document.getElementById("scene")).toBeNull();

    await act(async () => {
      clickText("איפוס");
    });
    broken = false;
    await act(async () => {
      clickText("כן, אפס");
    });

    expect(document.getElementById("scene")?.textContent).toBe("scene-up");
    expect(host?.querySelector("[data-generation]")?.getAttribute("data-generation")).toBe("1");
    expect(mounts).toBeGreaterThan(mountsBeforeReset);
    expect(slot?.textContent).toBe("");
  });

  it("offers try again and reset for a geometry crash, and clears when undo changes the design", async () => {
    installSceneProbe(() => ({ webglOk: true, contextLost: false }));
    const base = useLab.getState().design;
    const previous = { ...base, label: { ...base.label, text: "קודם" } };
    const current = { ...base, label: { ...base.label, text: "עכשיו" } };
    useLab.setState({ design: current, past: [previous], future: [] });
    let broken = true;
    function Scene() {
      if (broken) throw new Error("lathe geometry failed");
      return createElement("p", { id: "scene" }, "scene-up");
    }

    root = createRoot(host!);
    await act(async () => {
      root?.render(createElement(WebglBoundary, null, createElement(Scene)));
    });

    const labels = [...(slot?.querySelectorAll("button") ?? [])].map((button) => button.textContent);
    expect(labels).toContain("נסו שוב");
    expect(labels).toContain("איפוס");
    expect(slot?.textContent).not.toContain("התצוגה התלת־ממדית לא זמינה");

    broken = false;
    await act(async () => {
      useLab.getState().undo();
    });

    expect(document.getElementById("scene")?.textContent).toBe("scene-up");
    expect(useLab.getState().design.label.text).toBe("קודם");
    expect(host?.querySelector("[data-generation]")?.getAttribute("data-generation")).toBe("1");
  });

  it("keeps try again and hides reset when the context is lost", async () => {
    installSceneProbe(() => ({ webglOk: false, contextLost: true }));
    function Scene(): ReactNode {
      throw new Error("lathe geometry failed");
    }

    root = createRoot(host!);
    await act(async () => {
      root?.render(createElement(WebglBoundary, null, createElement(Scene)));
    });

    const labels = [...(slot?.querySelectorAll("button") ?? [])].map((button) => button.textContent);
    expect(slot?.textContent).toContain("התצוגה התלת־ממדית לא זמינה");
    expect(labels).toContain("נסו שוב");
    expect(labels).not.toContain("איפוס");
  });
});
