import { BOTTLES } from "./bottles.ts";
import { CAPS } from "./caps.ts";
import { BOXES, COLLARS, PUMPS } from "./hardware.ts";
import { LOGOS } from "./logos.ts";
import type { BottleSpec, BoxSpec, CapSpec, CollarSpec, LogoSpec, PumpSpec, VariantPart } from "./types.ts";

export interface CatalogEntry {
  id: string;
  kind: VariantPart;
  he: string;
  en: string;
  tags: string[];
}

export function bottleById(id: string): BottleSpec {
  return BOTTLES.find((b) => b.id === id) ?? BOTTLES[0];
}
export function capById(id: string): CapSpec {
  return CAPS.find((b) => b.id === id) ?? CAPS[0];
}
export function logoById(id: string): LogoSpec {
  return LOGOS.find((b) => b.id === id) ?? LOGOS[0];
}
export function pumpById(id: string): PumpSpec {
  return PUMPS.find((b) => b.id === id) ?? PUMPS[0];
}
export function collarById(id: string): CollarSpec {
  return COLLARS.find((b) => b.id === id) ?? COLLARS[0];
}
export function boxById(id: string): BoxSpec {
  return BOXES.find((b) => b.id === id) ?? BOXES[0];
}

export function listFor(kind: VariantPart): CatalogEntry[] {
  if (kind === "bottle") return BOTTLES.map(toEntry("bottle"));
  if (kind === "cap") return CAPS.map(toEntry("cap"));
  if (kind === "label") return LOGOS.map(toEntry("label"));
  if (kind === "pump") return PUMPS.map(toEntry("pump"));
  if (kind === "collar") return COLLARS.map(toEntry("collar"));
  return BOXES.map(toEntry("box"));
}

function toEntry(kind: VariantPart) {
  return (item: { id: string; name: { he: string; en: string }; tags: string[] }): CatalogEntry => ({
    id: item.id,
    kind,
    he: item.name.he,
    en: item.name.en,
    tags: item.tags,
  });
}

export function cycleId(kind: VariantPart, id: string, dir: number): string {
  const list = listFor(kind);
  const index = Math.max(0, list.findIndex((item) => item.id === id));
  const next = (index + dir + list.length) % list.length;
  return list[next]?.id ?? id;
}

export function findByTag(kind: VariantPart, tag: string, currentId?: string): string | null {
  const needle = tag.toLowerCase();
  const list = listFor(kind);
  const hits = list.filter((item) => item.tags.some((t) => t.toLowerCase() === needle) || item.he === tag || item.en.toLowerCase() === needle || item.id === needle);
  if (!hits.length) return null;
  const other = hits.find((hit) => hit.id !== currentId);
  return (other ?? hits[0]).id;
}

export const CATALOG_COUNTS = {
  bottle: BOTTLES.length,
  cap: CAPS.length,
  label: LOGOS.length,
  pump: PUMPS.length,
  collar: COLLARS.length,
  box: BOXES.length,
};
