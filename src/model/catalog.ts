import { BOTTLES } from "./bottles.ts";
import { CAPS } from "./caps.ts";
import { BOXES, COLLARS, PUMPS } from "./hardware.ts";
import { LOGOS } from "./logos.ts";
import type { BottleSpec, BoxSpec, CapSpec, CollarSpec, LogoSpec, PumpSpec, VariantPart } from "./types.ts";

export interface ImportedCatalog {
  bottles: BottleSpec[];
  caps: CapSpec[];
  labels: LogoSpec[];
  pumps: PumpSpec[];
  collars: CollarSpec[];
  boxes: BoxSpec[];
}

const imported: ImportedCatalog = { bottles: [], caps: [], labels: [], pumps: [], collars: [], boxes: [] };

export function setImportedCatalog(next: ImportedCatalog): void {
  imported.bottles = next.bottles;
  imported.caps = next.caps;
  imported.labels = next.labels;
  imported.pumps = next.pumps;
  imported.collars = next.collars;
  imported.boxes = next.boxes;
}

export interface CatalogEntry {
  id: string;
  kind: VariantPart;
  he: string;
  en: string;
  tags: string[];
  /** Compact millimetre line for the library card. */
  mm: string;
  /** Lowercase index: names, codes, FEA, millimetres, supplier. */
  hay: string;
}

export function catalogHas(kind: VariantPart, id: string): boolean {
  if (kind === "bottle") return imported.bottles.some((item) => item.id === id) || BOTTLES.some((item) => item.id === id);
  if (kind === "cap") return imported.caps.some((item) => item.id === id) || CAPS.some((item) => item.id === id);
  if (kind === "label") return imported.labels.some((item) => item.id === id) || LOGOS.some((item) => item.id === id);
  if (kind === "pump") return imported.pumps.some((item) => item.id === id) || PUMPS.some((item) => item.id === id);
  if (kind === "collar") return imported.collars.some((item) => item.id === id) || COLLARS.some((item) => item.id === id);
  return imported.boxes.some((item) => item.id === id) || BOXES.some((item) => item.id === id);
}

export function bottleById(id: string): BottleSpec {
  return imported.bottles.find((b) => b.id === id) ?? BOTTLES.find((b) => b.id === id) ?? BOTTLES[0];
}
export function capById(id: string): CapSpec {
  return imported.caps.find((b) => b.id === id) ?? CAPS.find((b) => b.id === id) ?? CAPS[0];
}
export function logoById(id: string): LogoSpec {
  return imported.labels.find((b) => b.id === id) ?? LOGOS.find((b) => b.id === id) ?? LOGOS[0];
}
export function pumpById(id: string): PumpSpec {
  return imported.pumps.find((b) => b.id === id) ?? PUMPS.find((b) => b.id === id) ?? PUMPS[0];
}
export function collarById(id: string): CollarSpec {
  return imported.collars.find((b) => b.id === id) ?? COLLARS.find((b) => b.id === id) ?? COLLARS[0];
}
export function boxById(id: string): BoxSpec {
  return imported.boxes.find((b) => b.id === id) ?? BOXES.find((b) => b.id === id) ?? BOXES[0];
}

export function listFor(kind: VariantPart): CatalogEntry[] {
  if (kind === "bottle") return [...BOTTLES, ...imported.bottles].map(toEntry("bottle"));
  if (kind === "cap") return [...CAPS, ...imported.caps].map(toEntry("cap"));
  if (kind === "label") return [...LOGOS, ...imported.labels].map(toEntry("label"));
  if (kind === "pump") return [...PUMPS, ...imported.pumps].map(toEntry("pump"));
  if (kind === "collar") return [...COLLARS, ...imported.collars].map(toEntry("collar"));
  return [...BOXES, ...imported.boxes].map(toEntry("box"));
}

function mm(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function toEntry(kind: VariantPart) {
  return (item: { id: string; name: { he: string; en: string }; tags: string[]; heightMm?: number; widthMm?: number; depthMm?: number; actuatorHeightMm?: number; padMm?: number; neck?: string }): CatalogEntry => {
    let size = "";
    if (kind === "bottle" && item.heightMm && item.widthMm && item.depthMm) size = `${mm(item.heightMm)} × ${mm(item.widthMm)} × ${mm(item.depthMm)}`;
    else if (kind === "cap" && item.heightMm && item.widthMm) size = `${mm(item.heightMm)} × ${mm(item.widthMm)}`;
    else if (kind === "collar" && item.heightMm) size = `${mm(item.heightMm)} mm`;
    else if (kind === "pump" && item.actuatorHeightMm) size = `${mm(item.actuatorHeightMm)} mm`;
    else if (kind === "box" && item.padMm) size = `+${mm(item.padMm)} mm`;
    const neck = item.neck || (kind === "cap" || kind === "pump" || kind === "collar" ? "FEA15" : "");
    const spaced = neck.startsWith("FEA") ? neck.replace("FEA", "FEA ") : neck;
    const nums = [item.heightMm, item.widthMm, item.depthMm, item.actuatorHeightMm].filter((value) => typeof value === "number").join(" ");
    const hay = `${item.name.he} ${item.name.en} ${item.id} ${item.tags.join(" ")} ${neck} ${spaced} ${nums} ${size}`.toLowerCase();
    return {
      id: item.id,
      kind,
      he: item.name.he,
      en: item.name.en,
      tags: item.tags,
      mm: size,
      hay,
    };
  };
}

const QUERY_ALIASES: Record<string, string[]> = {
  "זהב": ["gold", "זהב", "gilt"],
  "gold": ["gold", "זהב", "gilt"],
  "כסף": ["silver", "כסף"],
  "silver": ["silver", "כסף"],
  "כדור": ["ball", "sphere", "כדור", "dome"],
  "ball": ["ball", "sphere", "כדור"],
  "עגול": ["round", "circle", "עגול", "cylinder"],
  "round": ["round", "circle", "עגול"],
};

export function entryMatches(entry: CatalogEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const tight = q.replace(/\s+/g, "");
  const fea = /^(?:fea\s*)?(13|15|17|18|20)$/.exec(tight);
  if (fea) {
    const n = fea[1];
    return entry.hay.includes(`fea${n}`) || entry.hay.includes(`fea ${n}`);
  }
  const aliases = QUERY_ALIASES[q] ?? QUERY_ALIASES[tight];
  if (aliases) return aliases.some((word) => entry.hay.includes(word));
  return entry.hay.includes(q) || entry.hay.replace(/\s+/g, "").includes(tight);
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
