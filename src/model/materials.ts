import type { FinishId, Localized } from "./types.ts";

export interface FinishDef {
  id: FinishId;
  name: Localized;
  color: string;
  group: "glass" | "metal" | "solid";
}

export const FINISHES: FinishDef[] = [
  { id: "clear", name: { he: "זכוכית שקופה", en: "Clear glass" }, color: "#f4f0e8", group: "glass" },
  { id: "frosted", name: { he: "זכוכית חלבית", en: "Frosted" }, color: "#f2f2f0", group: "glass" },
  { id: "tinted", name: { he: "זכוכית כהה", en: "Tinted" }, color: "#6e857c", group: "glass" },
  { id: "gold", name: { he: "זהב", en: "Gold" }, color: "#d4b48a", group: "metal" },
  { id: "silver", name: { he: "כסף", en: "Silver" }, color: "#d5d8de", group: "metal" },
  { id: "rose", name: { he: "רוז גולד", en: "Rose gold" }, color: "#e4b7ae", group: "metal" },
  { id: "matteBlack", name: { he: "שחור מט", en: "Matte black" }, color: "#141414", group: "solid" },
  { id: "wood", name: { he: "עץ", en: "Wood" }, color: "#8a5a3a", group: "solid" },
  { id: "leather", name: { he: "עור", en: "Leather" }, color: "#6b3c32", group: "solid" },
];

export const PALETTE = [
  "#f4f0e8",
  "#141414",
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
