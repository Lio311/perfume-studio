import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useLab } from "../store/labStore.ts";
import { DesignFallback, WebglFallback, isWebglFailure, sceneFallbackFor } from "./FallbackScreen.tsx";

describe("scene fallback", () => {
  it("offers retry for every crash, and reset only while WebGL is alive", () => {
    const fit = new TypeError("Cannot read properties of undefined (reading 'ferrule')");
    const geometry = new Error("lathe geometry failed");
    const alive = { webglOk: true, contextLost: false };
    expect(isWebglFailure(geometry)).toBe(false);
    expect(sceneFallbackFor(fit, alive)).toEqual({ kind: "design", reset: true, retry: true });
    expect(sceneFallbackFor(geometry, alive)).toEqual({ kind: "design", reset: true, retry: true });
    expect(sceneFallbackFor(new TypeError("Cannot read properties of null (reading 'precision')"), alive)).toEqual({ kind: "design", reset: true, retry: true });
    expect(sceneFallbackFor(new Error("Error creating WebGL context."), { webglOk: false, contextLost: false })).toEqual({ kind: "webgl", reset: false, retry: true });
    expect(sceneFallbackFor(new Error("Array buffer allocation failed"), { webglOk: false, contextLost: false })).toEqual({ kind: "webgl", reset: false, retry: true });
    expect(sceneFallbackFor(fit, { webglOk: true, contextLost: true })).toEqual({ kind: "webgl", reset: false, retry: true });
  });

  it("shows try again and reset for a design crash, and try again without reset for WebGL", () => {
    useLab.setState({ lang: "he" });
    const design = renderToStaticMarkup(createElement(DesignFallback, { onReset: () => undefined, onRetry: () => undefined }));
    expect(design).toContain("איפוס");
    expect(design).toContain("נסו שוב");
    expect(design).toContain("לא הצלחנו להציג את העיצוב");
    expect(design).toContain("boot-fallback");
    expect(design).not.toContain("is-page");

    const webgl = renderToStaticMarkup(createElement(WebglFallback, { onRetry: () => undefined }));
    expect(webgl).toContain("נסו שוב");
    expect(webgl).not.toContain("איפוס");
    expect(webgl).toContain("התצוגה התלת־ממדית לא זמינה");

    useLab.setState({ lang: "en" });
    const english = renderToStaticMarkup(createElement(DesignFallback, { onReset: () => undefined, onRetry: () => undefined }));
    expect(english).toContain("Reset");
    expect(english).toContain('lang="en"');
    expect(english).toContain('dir="ltr"');
    useLab.setState({ lang: "he" });
  });
});
