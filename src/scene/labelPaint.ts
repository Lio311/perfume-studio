import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { labelEmissiveCanvas, labelFinish, labelFontSpec, labelInk, labelSurfaceCanvas, logoTexture, shouldRepaintLabel } from "../geometry/logos.ts";
import { logoById } from "../model/catalog.ts";
import { computeFit } from "../model/fit.ts";
import type { LogoApplication, LogoFont } from "../model/types.ts";
import { useLab } from "../store/labStore.ts";

export interface LabelTextureSet<T extends { dispose(): void }> {
  color: T;
  mask: T | null;
  emissive: T | null;
}

/**
 * Drop textures that this finish no longer shows.
 * A colour map that is still on the next material stays; disposing it here blanks the plate.
 */
export function disposeReplacedLabelTextures<T extends { dispose(): void }>(
  previous: LabelTextureSet<T>,
  next: LabelTextureSet<T>,
): void {
  if (previous.color !== next.color) previous.color.dispose();
  if (previous.mask && previous.mask !== next.mask) previous.mask.dispose();
  if (previous.emissive && previous.emissive !== next.emissive) previous.emissive.dispose();
}

const LabelPaintContext = createContext<HTMLCanvasElement | null>(null);

export function useSharedLabelCanvas(): HTMLCanvasElement | null {
  return useContext(LabelPaintContext);
}

/** Copy one painted plate. The box face does not lay the glyphs out again. */
export function copyLabelCanvas(source: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const scale = Math.min(canvas.width / source.width, canvas.height / source.height);
  const dw = source.width * scale;
  const dh = source.height * scale;
  ctx.drawImage(source, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  return canvas;
}

function useLabelFontTick(font: LogoFont, text: string): number {
  const [fontTick, setFontTick] = useState(0);
  const spec = labelFontSpec(font, text);
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts?.load || !fonts.check) return undefined;
    const alreadyLoaded = fonts.check(spec, text);
    if (!shouldRepaintLabel(alreadyLoaded)) return undefined;
    let live = true;
    void fonts.load(spec, text).then(() => {
      if (live) setFontTick((n) => n + 1);
    }).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [spec, text]);
  return fontTick;
}

/** Paint on the first frame, then once after rapid text or slider updates settle. */
export function useDebouncedLabelCanvas(signature: string, paint: () => HTMLCanvasElement, waitMs = 80): HTMLCanvasElement {
  const paintRef = useRef(paint);
  paintRef.current = paint;
  const [canvas, setCanvas] = useState(() => paint());
  const seen = useRef(signature);
  useEffect(() => {
    if (seen.current === signature) return undefined;
    const handle = window.setTimeout(() => {
      seen.current = signature;
      setCanvas(paintRef.current());
    }, waitMs);
    return () => window.clearTimeout(handle);
  }, [signature, waitMs]);
  return canvas;
}

/** One label painting shared by the bottle plate and the carton face. */
export function LabelPaintProvider({ children }: { children: ReactNode }) {
  const design = useLab((s) => s.design);
  const spec = logoById(design.label.variantId);
  const fit = computeFit(design, false);
  const ink = labelInk(design.label.color, spec.application);
  const fontTick = useLabelFontTick(spec.font, design.label.text);
  const aspect = fit.labelW / Math.max(4, fit.labelH);
  const longSide = 2048;
  const width = aspect >= 1 ? longSide : Math.max(256, Math.round(longSide * aspect));
  const height = aspect >= 1 ? Math.max(256, Math.round(longSide / Math.min(4.5, aspect))) : longSide;
  const signature = [spec.id, design.label.text, ink, spec.application, width, height, fontTick].join("\u0000");
  const canvas = useDebouncedLabelCanvas(signature, () => {
    const drawn = logoTexture(spec, design.label.text, ink, width, height);
    drawn.dataset.fonts = String(fontTick);
    return drawn;
  });
  return createElement(LabelPaintContext.Provider, { value: canvas }, children);
}

export function useLabelMaps(canvas: HTMLCanvasElement, ink: string, application: LogoApplication) {
  const finish = labelFinish(application);
  const color = useMemo(() => {
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 16;
    map.flipY = true;
    map.generateMipmaps = true;
    map.needsUpdate = true;
    return map;
  }, [canvas]);
  const mask = useMemo(() => {
    if (finish.metalness === 0 && finish.bumpScale === 0) return null;
    const surface = labelSurfaceCanvas(canvas, ink, application);
    const map = new THREE.CanvasTexture(surface);
    map.colorSpace = THREE.NoColorSpace;
    map.anisotropy = 8;
    map.flipY = true;
    map.generateMipmaps = true;
    map.needsUpdate = true;
    return map;
  }, [canvas, ink, application, finish.metalness, finish.bumpScale]);
  const emissive = useMemo(() => {
    if (finish.emissive <= 0) return null;
    const surface = labelEmissiveCanvas(canvas, ink, application);
    const map = new THREE.CanvasTexture(surface);
    map.colorSpace = THREE.NoColorSpace;
    map.anisotropy = 8;
    map.flipY = true;
    map.generateMipmaps = true;
    map.needsUpdate = true;
    return map;
  }, [canvas, ink, application, finish.emissive]);
  const held = useRef<LabelTextureSet<THREE.Texture> | null>(null);
  useEffect(() => {
    const next = { color, mask, emissive };
    if (held.current) disposeReplacedLabelTextures(held.current, next);
    held.current = next;
  }, [color, mask, emissive]);
  useEffect(() => () => {
    const latest = held.current;
    held.current = null;
    if (!latest) return;
    latest.color.dispose();
    latest.mask?.dispose();
    latest.emissive?.dispose();
  }, []);
  return { color, mask, emissive };
}
