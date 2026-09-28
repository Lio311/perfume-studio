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
    installSceneProbe(() => ({ webglOk: true, contextLost: false, designOk: false }));
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
    expect(slot?.querySelector("button")?.textContent).toBe("איפוס");
    expect(document.getElementById("scene")).toBeNull();

    const click = (selector: string) => {
      const node = slot?.querySelector(selector);
      if (node instanceof HTMLButtonElement) node.click();
    };

    await act(async () => {
      click("button");
    });
    expect(slot?.textContent).toContain("לאפס את העיצוב?");
    expect(document.getElementById("scene")).toBeNull();
    const mountsBeforeReset = mounts;

    await act(async () => {
      click("button.is-ghost");
    });
    expect(slot?.textContent).toContain("לא הצלחנו להציג את העיצוב");
    expect(document.getElementById("scene")).toBeNull();

    await act(async () => {
      click("button");
    });
    broken = false;
    const yes = [...(slot?.querySelectorAll("button") ?? [])].find((button) => button.textContent === "כן, אפס");
    await act(async () => {
      if (yes instanceof HTMLButtonElement) yes.click();
    });

    expect(document.getElementById("scene")?.textContent).toBe("scene-up");
    expect(host?.querySelector("[data-generation]")?.getAttribute("data-generation")).toBe("1");
    expect(mounts).toBeGreaterThan(mountsBeforeReset);
    expect(slot?.textContent).toBe("");
  });

  it("keeps a renderer crash that is not a bad design, with no reset", async () => {
    installSceneProbe(() => ({ webglOk: true, contextLost: false, designOk: true }));
    function Scene(): ReactNode {
      throw new TypeError("Cannot read properties of null (reading 'precision')");
    }

    root = createRoot(host!);
    await act(async () => {
      root?.render(createElement(WebglBoundary, null, createElement(Scene)));
    });

    expect(slot?.textContent).toContain("התצוגה התלת־ממדית לא זמינה");
    expect(slot?.querySelector("button")).toBeNull();
    expect(host?.querySelector("[data-generation]")).toBeNull();
  });
});
