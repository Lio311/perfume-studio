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
  frosted: { opacity: 0.45, transmission: 0.35 },
  tinted: { opacity: 0.32, transmission: 0.55 },
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

/** Transmission stored with a finish when the opacity slider is unset. The slider itself forces transmission to 0 in the renderer. */
export function glassTransmission(finish: FinishId, opacity?: number): number {
  const glass = glassFinish(finish);
  if (!glass) return 0;
  if (opacity !== undefined) return 1 - opacity;
  return GLASS_FINISH_DEFAULTS[glass].transmission;
}
