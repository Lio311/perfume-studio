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

    const field = host.querySelector("textarea");
    expect(field).toBeTruthy();
    expect(field?.readOnly).toBe(true);
    expect(field?.value).toBe(url);
    expect(field?.value.length).toBeGreaterThan(TOAST_MAX);
    expect(host.querySelector(".toast")).toBeNull();
  });
});
