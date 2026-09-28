import { createContext, createElement, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { cartonMarkCanvas, labelEmissiveCanvas, labelFinish, labelFontSpec, labelInk, labelSurfaceCanvas, logoTexture, shouldRepaintLabel } from "../geometry/logos.ts";
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

/**
 * Paint a finish or font change before the frame is shown.
 * Keystrokes and sliders wait, and the previous plate stays up until that paint lands.
 */
export function useDebouncedLabelCanvas(
  immediate: string,
  deferred: string,
  paint: () => HTMLCanvasElement,
  waitMs = 80,
): HTMLCanvasElement {
  const paintRef = useRef(paint);
  paintRef.current = paint;
  const [canvas, setCanvas] = useState(() => paint());
  const seenImmediate = useRef(immediate);
  const seenDeferred = useRef(deferred);
  useLayoutEffect(() => {
    const finishChanged = seenImmediate.current !== immediate;
    const textChanged = seenDeferred.current !== deferred;
    if (!finishChanged && !textChanged) return undefined;
    if (finishChanged) {
      seenImmediate.current = immediate;
      seenDeferred.current = deferred;
      setCanvas(paintRef.current());
      return undefined;
    }
    const handle = window.setTimeout(() => {
      seenDeferred.current = deferred;
      setCanvas(paintRef.current());
    }, waitMs);
    return () => window.clearTimeout(handle);
  }, [immediate, deferred, waitMs]);
  return canvas;
}

/** Bottle plate. The carton paints its own line so foil is not a copy of this plate. */
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
  const immediate = [spec.id, spec.application, fontTick].join("\u0000");
  const deferred = [design.label.text, ink, width, height].join("\u0000");
  const canvas = useDebouncedLabelCanvas(immediate, deferred, () => {
    const drawn = logoTexture(spec, design.label.text, ink, width, height);
    drawn.dataset.fonts = String(fontTick);
    return drawn;
  });
  return createElement(LabelPaintContext.Provider, { value: canvas }, children);
}

/** Carton face: the brand line at its own aspect, with a plate only for print. */
export function useCartonLabelCanvas(): HTMLCanvasElement {
  const design = useLab((s) => s.design);
  const spec = logoById(design.label.variantId);
  const ink = labelInk(design.label.color, spec.application);
  const fontTick = useLabelFontTick(spec.font, design.label.text);
  const immediate = [spec.id, spec.application, spec.font, fontTick].join("\u0000");
  const deferred = [design.label.text, ink].join("\u0000");
  return useDebouncedLabelCanvas(immediate, deferred, () => {
    const drawn = cartonMarkCanvas(spec, design.label.text, ink, spec.application);
    drawn.dataset.fonts = String(fontTick);
    return drawn;
  });
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
