// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeShareDesign } from "../model/share.ts";
import { useLab } from "../store/labStore.ts";
import { TOAST_MAX } from "./toast.ts";
import { TopBar } from "./TopBar.tsx";

describe("share clipboard fallback", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host?.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the full share URL when the clipboard rejects it", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(TopBar));
    });
    const design = useLab.getState().design;
    const url = `${location.origin}${location.pathname}${location.search}#d=${encodeShareDesign(design)}`;
    expect(url.length).toBeGreaterThan(TOAST_MAX);

    const exportButton = [...host.querySelectorAll("button")].find((button) => button.textContent === "ייצוא");
    expect(exportButton).toBeTruthy();
    await act(async () => {
      exportButton?.click();
    });
    const shareButton = [...host.querySelectorAll("button")].find((button) => button.textContent === "שיתוף");
    expect(shareButton).toBeTruthy();
    await act(async () => {
      shareButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const field = document.querySelector<HTMLTextAreaElement>(".share-fallback textarea");
    expect(field).toBeTruthy();
    expect(field?.readOnly).toBe(true);
    expect(field?.value).toBe(url);
    expect(field?.value.length).toBeGreaterThan(TOAST_MAX);
    const toast = document.querySelector(".toast");
    expect(toast?.textContent).toBe("לא הצלחנו להעתיק. בחרו את הקישור והעתיקו אותו");
    expect(toast?.textContent?.includes(url)).toBe(false);
    expect((toast?.textContent ?? "").length).toBeLessThan(TOAST_MAX);

    const close = document.querySelector<HTMLButtonElement>(".share-fallback-close");
    expect(close).toBeTruthy();
    await act(async () => {
      close?.click();
    });
    expect(document.querySelector(".share-fallback")).toBeNull();

    await act(async () => {
      exportButton?.click();
    });
    const shareAgain = [...host.querySelectorAll("button")].find((button) => button.textContent === "שיתוף");
    await act(async () => {
      shareAgain?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.querySelector<HTMLTextAreaElement>(".share-fallback textarea")?.value).toBe(url);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.querySelector(".share-fallback")).toBeNull();
    useLab.getState().setShareUrl("");
  });

  it("handles Escape on the share field before a window listener", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(TopBar));
    });
    useLab.getState().setShareUrl("https://example.test/lab#d=abc");
    await act(async () => {
      await Promise.resolve();
    });
    const field = document.querySelector<HTMLTextAreaElement>(".share-fallback textarea");
    expect(field).toBeTruthy();
    let reachedWindow = false;
    const onWindow = () => {
      reachedWindow = true;
    };
    window.addEventListener("keydown", onWindow);
    await act(async () => {
      field?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    window.removeEventListener("keydown", onWindow);
    expect(reachedWindow).toBe(false);
    expect(useLab.getState().shareUrl).toBe("");
    expect(document.querySelector(".share-fallback")).toBeNull();
  });
});
