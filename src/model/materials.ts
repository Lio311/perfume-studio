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
  { id: "fabric", name: { he: "בד (Sospiro)", en: "Fabric" }, color: "#3d4b68", group: "solid" },
];


export const UI_FINISHES = FINISHES.filter(f => !["gold", "silver", "rose", "matteBlack"].includes(f.id));

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

export interface GlassProps {
  materialOpacity: number;
  transmission: number;
  roughness: number;
  thickness: number;
  ior: number;
}

export function computeGlassProps(finish: FinishId, slider?: number | null): GlassProps | null {
  const glass = glassFinish(finish);
  if (!glass) return null;

  const defaults = GLASS_FINISH_DEFAULTS[glass];
  const t = slider ?? defaults.opacity;

  return {
    materialOpacity: 1,
    transmission: Math.max(0.01, (1 - t) * (glass === "clear" ? 1.0 : glass === "frosted" ? 0.95 : 0.85)),
    roughness: glass === "frosted" ? 0.45 : glass === "tinted" ? 0.08 : 0.02,
    thickness: glass === "tinted" ? 4.2 : 3.0,
    ior: glass === "clear" ? 1.52 : 1.5,
  };
}

export function effectiveGlassOpacity(finish: FinishId, opacity?: number | null): number | null {
  const glass = glassFinish(finish);
  if (!glass) return null;
  return opacity ?? DEFAULT_GLASS_OPACITY[glass];
}

/**
 * Alpha frosted and tinted glass draw for a slider position.
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
export function renderedGlassOpacity(finish: FinishId, opacity?: number | null): number | null {
  const slider = effectiveGlassOpacity(finish, opacity);
  if (slider === null) return null;
  if (usesFlatGlassAlpha(finish)) return mappedGlassOpacity(slider);
  return slider;
}

/** Clear-glass shader fade for a slider value. 1 is the untouched default. */
export function clearGlassFade(opacity?: number | null): number {
  return (opacity ?? DEFAULT_GLASS_OPACITY.clear) / DEFAULT_GLASS_OPACITY.clear;
}

/** Write that fade onto the shader uniform before the first frame is drawn. */
export function assignClearGlassFade(uniforms: { uFade: { value: number } }, opacity?: number | null): number {
  const userFade = clearGlassFade(opacity);
  uniforms.uFade.value = userFade;
  return userFade;
}

/** Per-frame glass target taken from the design, not from a material snapshot. */
export function bottleGlassSetting(finish: FinishId, opacity?: number | null): { fade: number | null; alpha: number | null } {
  if (finish === "clear") return { fade: clearGlassFade(opacity), alpha: null };
  return { fade: null, alpha: renderedGlassOpacity(finish, opacity) };
}

/** Explicit opacity uses `1 - opacity`. Otherwise the transmission stored with that finish's default opacity.
 * The renderer reads `computeGlassProps`, which also follows the slider. */
export function glassTransmission(finish: FinishId, opacity?: number | null): number {
  const glass = glassFinish(finish);
  if (!glass) return 0;
  if (typeof opacity === "number" && Number.isFinite(opacity)) return 1 - opacity;
  return GLASS_FINISH_DEFAULTS[glass].transmission;
}

const GLASS_SURFACE: Record<GlassFinish, { roughness: number; thickness: number; clearcoat: number }> = {
  clear: { roughness: 0.015, thickness: 2.8, clearcoat: 1 },
  frosted: { roughness: 0.34, thickness: 2.8, clearcoat: 0.04 },
  tinted: { roughness: 0.05, thickness: 4.2, clearcoat: 1 },
};

/**
 * Transmission the physical glass material should use.
 * Frosted and tinted follow `clamp(base · (1 - s) / (1 - s0), 0, 1)`.
 * Clear glass keeps its refractive default.
 */
export function glassDrawTransmission(finish: FinishId, opacity?: number | null): number {
  if (!isGlass(finish)) return 0;
  const glass = glassFinish(finish);
  if (!glass || glass === "clear") return Math.max(0.01, glassTransmission(finish));
  const s0 = DEFAULT_GLASS_OPACITY[glass];
  const base = GLASS_FINISH_DEFAULTS[glass].transmission;
  const s = opacity ?? s0;
  return Math.min(1, Math.max(0, (base * (1 - s)) / (1 - s0)));
}

/**
 * 0 at and below the per-finish default slider, 1 at slider 1.
 * Used so tint darkening never moves the untouched default.
 */
function opaqueMix(glass: GlassFinish, opacity?: number | null): number {
  const s0 = DEFAULT_GLASS_OPACITY[glass];
  const s = opacity ?? s0;
  if (s <= s0 || s0 >= 1) return 0;
  return Math.min(1, (s - s0) / (1 - s0));
}

/** At slider 1 the tint albedo is this fraction of the design colour. Hue stays put. */
const TINTED_OPAQUE_SCALE = 0.4;

/**
 * Tinted glass colour for a slider position. At and below the default this is the
 * design colour. Toward opaque it gets darker by the same ratio on every channel,
 * so the grey-green hue does not shift to a lighter mint. Attenuation stays the
 * design colour. Frosted is not passed through here.
 */
export function tintedGlassColor(color: string, opacity?: number | null): string {
  const factor = 1 - (1 - TINTED_OPAQUE_SCALE) * opaqueMix("tinted", opacity);
  const hex = color.trim().replace("#", "");
  const value = Number.parseInt(hex, 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) =>
    Math.round(channel * factor).toString(16).padStart(2, "0"),
  );
  return `#${channels.join("")}`;
}

/**
 * Params the frosted or tinted physical material draws.
 * The glass stays transparent and does not write depth at every slider position,
 * including 1, so opacity can reach 1 without a mode switch and without hiding
 * the liquid in the depth buffer. The floor grid is drawn opaque, behind the bottle,
 * so its lines are not composited on top of the liquid.
 */
export function effectiveGlassDraw(finish: FinishId, opacity?: number | null): {
  opacity: number;
  transmission: number;
  roughness: number;
  thickness: number;
  clearcoat: number;
  attenuationDistance: number;
  envMapIntensity: number;
  transparent: boolean;
  depthWrite: boolean;
} | null {
  const glass = glassFinish(finish);
  if (!glass || glass === "clear") return null;
  const alpha = renderedGlassOpacity(finish, opacity);
  if (alpha === null) return null;
  const surface = GLASS_SURFACE[glass];
  const mix = opaqueMix(glass, opacity);
  return {
    opacity: alpha,
    transmission: glassDrawTransmission(finish, opacity),
    roughness: surface.roughness,
    thickness: surface.thickness,
    clearcoat: surface.clearcoat,
    attenuationDistance: 36,
    envMapIntensity: glass === "tinted" ? 1.7 * (1 - 0.7 * mix) : 1.7,
    transparent: true,
    depthWrite: false,
  };
}
