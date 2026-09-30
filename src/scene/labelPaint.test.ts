// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LogoApplication } from "../model/types.ts";
import { disposeReplacedLabelTextures, useDebouncedLabelCanvas, useLabelMaps } from "./labelPaint.ts";

describe("label texture lifetime", () => {
  it("disposes a replaced mask and keeps the colour texture", () => {
    const color = { dispose: vi.fn() };
    const mask = { dispose: vi.fn() };
    const nextMask = { dispose: vi.fn() };
    disposeReplacedLabelTextures(
      { color, mask, emissive: null },
      { color, mask: nextMask, emissive: null },
    );
    expect(color.dispose).not.toHaveBeenCalled();
    expect(mask.dispose).toHaveBeenCalledOnce();
    expect(nextMask.dispose).not.toHaveBeenCalled();
  });

  it("keeps the colour map mounted when the finish changes", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const host = document.createElement("div");
    document.body.append(host);
    const root: Root = createRoot(host);
    let colorDispose: ReturnType<typeof vi.spyOn> | null = null;
    let firstColor: { dispose: () => void } | null = null;
    function Probe({ application }: { application: LogoApplication }) {
      const maps = useLabelMaps(canvas, "#c9a36a", application);
      if (!firstColor) {
        firstColor = maps.color;
        colorDispose = vi.spyOn(maps.color, "dispose");
      }
      return null;
    }
    await act(async () => {
      root.render(createElement(Probe, { application: "plaque" }));
    });
    await act(async () => {
      root.render(createElement(Probe, { application: "sticker" }));
    });
    expect(colorDispose).toHaveBeenCalledTimes(0);
    expect(firstColor).toBeTruthy();
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});

describe("shared label paint", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("paints once after a burst of text and slider updates", async () => {
    vi.useFakeTimers();
    let paints = 0;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    function Probe({ signature }: { signature: string }) {
      useDebouncedLabelCanvas("plaque", signature, () => {
        paints += 1;
        const canvas = document.createElement("canvas");
        canvas.width = 4;
        canvas.height = 4;
        return canvas;
      }, 80);
      return null;
    }
    await act(async () => {
      root.render(createElement(Probe, { signature: "a" }));
    });
    expect(paints).toBe(1);
    await act(async () => {
      root.render(createElement(Probe, { signature: "b" }));
      root.render(createElement(Probe, { signature: "c" }));
      root.render(createElement(Probe, { signature: "d" }));
    });
    expect(paints).toBe(1);
    await act(async () => {
      vi.advanceTimersByTime(80);
    });
    expect(paints).toBe(2);
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("paints a finish change immediately and leaves the last plate until text settles", async () => {
    vi.useFakeTimers();
    let paints = 0;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    function Probe({ finish, text }: { finish: string; text: string }) {
      useDebouncedLabelCanvas(finish, text, () => {
        paints += 1;
        return document.createElement("canvas");
      }, 80);
      return null;
    }
    await act(async () => {
      root.render(createElement(Probe, { finish: "plaque", text: "NOIR" }));
    });
    expect(paints).toBe(1);
    await act(async () => {
      root.render(createElement(Probe, { finish: "engrave", text: "NOIR" }));
    });
    expect(paints).toBe(2);
    await act(async () => {
      root.render(createElement(Probe, { finish: "engrave", text: "ATELIER" }));
    });
    expect(paints).toBe(2);
    await act(async () => {
      vi.advanceTimersByTime(80);
    });
    expect(paints).toBe(3);
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
