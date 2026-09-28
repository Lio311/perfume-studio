import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useLab } from "../store/labStore.ts";
import { DesignFallback, WebglFallback, isWebglFailure, sceneFallbackFor } from "./FallbackScreen.tsx";

describe("scene fallback", () => {
  it("treats a fit crash as a design error only when the design fails and WebGL is alive", () => {
    const fit = new TypeError("Cannot read properties of undefined (reading 'ferrule')");
    const alive = { webglOk: true, contextLost: false, designOk: false };
    expect(isWebglFailure(fit)).toBe(false);
    expect(sceneFallbackFor(fit, alive)).toEqual({ kind: "design", reset: true });
    expect(sceneFallbackFor(new Error("Error creating WebGL context."), alive)).toEqual({ kind: "webgl", reset: false });
    const gpu = new TypeError("Cannot read properties of null (reading 'precision')");
    expect(sceneFallbackFor(gpu, { webglOk: true, contextLost: false, designOk: true })).toEqual({ kind: "webgl", reset: false });
    expect(sceneFallbackFor(new Error("Array buffer allocation failed"), { webglOk: false, contextLost: false, designOk: true })).toEqual({ kind: "webgl", reset: false });
    expect(sceneFallbackFor(fit, { webglOk: true, contextLost: true, designOk: false })).toEqual({ kind: "webgl", reset: false });
  });

  it("shows a reset control for a design crash and none for WebGL", () => {
    useLab.setState({ lang: "he" });
    const design = renderToStaticMarkup(createElement(DesignFallback, { onReset: () => undefined }));
    expect(design).toContain("איפוס");
    expect(design).toContain("לא הצלחנו להציג את העיצוב");
    expect(design).toContain("boot-fallback");
    expect(design).not.toContain("is-page");

    const webgl = renderToStaticMarkup(createElement(WebglFallback));
    expect(webgl).not.toContain("<button");
    expect(webgl).toContain("התצוגה התלת־ממדית לא זמינה");

    useLab.setState({ lang: "en" });
    const english = renderToStaticMarkup(createElement(DesignFallback, { onReset: () => undefined }));
    expect(english).toContain("Reset");
    expect(english).toContain('lang="en"');
    expect(english).toContain('dir="ltr"');
    useLab.setState({ lang: "he" });
  });
});
