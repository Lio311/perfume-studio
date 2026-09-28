import type { FinishId, Localized } from "./types.ts";

export interface FinishDef {
  id: FinishId;
  name: Localized;
  color: string;
  group: "glass" | "metal" | "solid";
}

/** Matte-black default. The palette swatch uses this same constant. */
export const MATTE_BLACK_COLOR = "#141414" as const;

export const FINISHES: FinishDef[] = [
  { id: "clear", name: { he: "זכוכית שקופה", en: "Clear glass" }, color: "#f4f0e8", group: "glass" },
  { id: "frosted", name: { he: "זכוכית חלבית", en: "Frosted" }, color: "#f2f2f0", group: "glass" },
  { id: "tinted", name: { he: "זכוכית כהה", en: "Tinted" }, color: "#6e857c", group: "glass" },
  { id: "gold", name: { he: "זהב", en: "Gold" }, color: "#D6B26A", group: "metal" },
  { id: "silver", name: { he: "כסף", en: "Silver" }, color: "#d5d8de", group: "metal" },
  { id: "rose", name: { he: "רוז גולד", en: "Rose gold" }, color: "#e4b7ae", group: "metal" },
  { id: "matteBlack", name: { he: "שחור מט", en: "Matte black" }, color: MATTE_BLACK_COLOR, group: "solid" },
  { id: "wood", name: { he: "עץ", en: "Wood" }, color: "#8a5a3a", group: "solid" },
  { id: "leather", name: { he: "עור", en: "Leather" }, color: "#6b3c32", group: "solid" },
];

export const PALETTE = [
  "#f4f0e8",
  MATTE_BLACK_COLOR,
  "#d4b48a",
  "#d5d8de",
  "#e4b7ae",
  "#e7a0b4",
  "#f3c9d6",
  "#7c2432",
  "#1d3344",
  "#8d9a84",
  "#c4783a",
  "#efe4cc",
  "#5c4033",
  "#c9b49a",
  "#8ea0ae",
  "#3c3935",
] as const;

export const LIQUID_PALETTE = [
  "#e2a24a",
  "#f3c9d6",
  "#f7f1e4",
  "#7a1f2c",
  "#c4783a",
  "#d8efe4",
  "#f0d56a",
  "#1a1a1a",
  "#8e3d4a",
  "#6e857c",
  "#f4f0e8",
  "#5c2a22",
] as const;

export function finishById(id: FinishId): FinishDef {
  return FINISHES.find((f) => f.id === id) ?? FINISHES[0];
}

export function isGlass(id: FinishId): boolean {
  return finishById(id).group === "glass";
}

type GlassFinish = "clear" | "frosted" | "tinted";

/**
 * Opacity and the transmission used when that finish has no explicit opacity.
 * Transmission stays next to opacity so the two cannot be edited apart.
 */
const GLASS_FINISH_DEFAULTS: Record<GlassFinish, { opacity: number; transmission: number }> = {
  clear: { opacity: 0.14, transmission: 0.15 },
  frosted: { opacity: 0.35, transmission: 0.35 },
  tinted: { opacity: 0.2, transmission: 0.55 },
};

/** Slider defaults for clear / frosted / tinted glass. Shared by the wizard, spec, and renderer. */
export const DEFAULT_GLASS_OPACITY: Record<GlassFinish, number> = {
  clear: GLASS_FINISH_DEFAULTS.clear.opacity,
  frosted: GLASS_FINISH_DEFAULTS.frosted.opacity,
  tinted: GLASS_FINISH_DEFAULTS.tinted.opacity,
};

function glassFinish(finish: FinishId): GlassFinish | null {
  if (finish === "clear" || finish === "frosted" || finish === "tinted") return finish;
  return null;
}

export function effectiveGlassOpacity(finish: FinishId, opacity?: number): number | null {
  const glass = glassFinish(finish);
  if (!glass) return null;
  return opacity ?? DEFAULT_GLASS_OPACITY[glass];
}

/**
 * Alpha frosted and tinted glass draw for a slider position (attenuationDistance 36).
 * Clear glass does not use this: it is a fresnel shader driven by the slider itself.
 */
export function mappedGlassOpacity(opacity: number): number {
  return 0.15 + 0.85 * opacity;
}

/** Frosted and tinted glass use mapped alpha. Clear glass stays on the fresnel shader. */
export function usesFlatGlassAlpha(finish: FinishId): boolean {
  const glass = glassFinish(finish);
  return glass !== null && glass !== "clear";
}

/** Opacity actually rendered, shared by the material, the slider label, and the spec sheet. */
export function renderedGlassOpacity(finish: FinishId, opacity?: number): number | null {
  const slider = effectiveGlassOpacity(finish, opacity);
  if (slider === null) return null;
  if (usesFlatGlassAlpha(finish)) return mappedGlassOpacity(slider);
  return slider;
}

/** Clear-glass shader fade for a slider value. 1 is the untouched default. */
export function clearGlassFade(opacity?: number): number {
  return (opacity ?? DEFAULT_GLASS_OPACITY.clear) / DEFAULT_GLASS_OPACITY.clear;
}

/** Write that fade onto the shader uniform before the first frame is drawn. */
export function assignClearGlassFade(uniforms: { uFade: { value: number } }, opacity?: number): number {
  const userFade = clearGlassFade(opacity);
  uniforms.uFade.value = userFade;
  return userFade;
}

/** Per-frame glass target taken from the design, not from a material snapshot. */
export function bottleGlassSetting(finish: FinishId, opacity?: number): { fade: number | null; alpha: number | null } {
  if (finish === "clear") return { fade: clearGlassFade(opacity), alpha: null };
  return { fade: null, alpha: renderedGlassOpacity(finish, opacity) };
}

/** Explicit opacity uses `1 - opacity`. Otherwise the transmission stored with that finish's default opacity. */
export function glassTransmission(finish: FinishId, opacity?: number): number {
  const glass = glassFinish(finish);
  if (!glass) return 0;
  if (opacity !== undefined) return 1 - opacity;
  return GLASS_FINISH_DEFAULTS[glass].transmission;
}

const GLASS_SURFACE: Record<GlassFinish, { roughness: number; thickness: number; clearcoat: number }> = {
  clear: { roughness: 0.015, thickness: 2.8, clearcoat: 1 },
  frosted: { roughness: 0.34, thickness: 2.8, clearcoat: 0.04 },
  tinted: { roughness: 0.05, thickness: 4.2, clearcoat: 1 },
};

/**
 * Transmission the physical glass material should use.
 * Frosted and tinted, including a missing slider, use one curve. `s0` is the per-finish
 * default and `base` is the transmission main draws there:
 * `clamp(base · (1 - s) / (1 - s0), 0, 1)`.
 * Parking the slider on `s0` matches the untouched default. `s = 1` is 0.
 * Below `s0` the same slope is capped at 1, and opacity `0.15 + 0.85·s` keeps 0 clear.
 * Clear glass keeps its refractive default.
 */
export function glassDrawTransmission(finish: FinishId, opacity?: number): number {
  if (!isGlass(finish)) return 0;
  const glass = glassFinish(finish);
  if (!glass || glass === "clear") return Math.max(0.01, glassTransmission(finish));
  const s0 = DEFAULT_GLASS_OPACITY[glass];
  const base = GLASS_FINISH_DEFAULTS[glass].transmission;
  const s = opacity ?? s0;
  return Math.min(1, Math.max(0, (base * (1 - s)) / (1 - s0)));
}

/** Drawn opacity at which frosted and tinted glass becomes a solid occluder. */
export const OPAQUE_GLASS_OPACITY = 0.99;

/**
 * Params the frosted or tinted physical material draws.
 * Below {@link OPAQUE_GLASS_OPACITY} depth write stays off so the front wall
 * does not hide the liquid. At slider 1 the glass is non-transparent and writes
 * depth, so the liquid and the floor behind it are hidden.
 */
export function effectiveGlassDraw(finish: FinishId, opacity?: number): {
  opacity: number;
  transmission: number;
  roughness: number;
  thickness: number;
  clearcoat: number;
  attenuationDistance: number;
  transparent: boolean;
  depthWrite: boolean;
} | null {
  const glass = glassFinish(finish);
  if (!glass || glass === "clear") return null;
  const alpha = renderedGlassOpacity(finish, opacity);
  if (alpha === null) return null;
  const surface = GLASS_SURFACE[glass];
  const solid = alpha >= OPAQUE_GLASS_OPACITY;
  return {
    opacity: alpha,
    transmission: glassDrawTransmission(finish, opacity),
    roughness: surface.roughness,
    thickness: surface.thickness,
    clearcoat: surface.clearcoat,
    attenuationDistance: 36,
    transparent: !solid,
    depthWrite: solid,
  };
}
