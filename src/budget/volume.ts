import type { BottleSpec } from "../model/types.ts";

/** A nominal fill within this fraction of the brief counts as a match. */
export const VOLUME_TOLERANCE = 0.15;

/**
 * Also accept a gap of this many millilitres, so a 5 ml brief still matches a 6 ml bottle
 * where 15% would be less than 1 ml.
 */
export const VOLUME_ABSOLUTE_ML = 2;

const FILL_TOKEN = /(?:^|[^0-9])(5|10|15|30|50|75|100|125|150|200)(?:[^0-9]|$)/;

function tokenFrom(text: string): number | null {
  const match = FILL_TOKEN.exec(text);
  return match ? Number(match[1]) : null;
}

/**
 * Perfume fill the brief compares against.
 * Supplier capacity wins, then a fill token in the id, then in the tags,
 * then the geometric `capacityMl` (a glass estimate, not a commercial fill).
 */
export function nominalFillMl(spec: Pick<BottleSpec, "id" | "tags" | "capacityMl" | "supplier">): number {
  if (typeof spec.supplier?.capacityMl === "number" && spec.supplier.capacityMl > 0) return spec.supplier.capacityMl;
  const fromId = tokenFrom(spec.id);
  if (fromId) return fromId;
  const fromTags = tokenFrom(spec.tags.join(" "));
  if (fromTags) return fromTags;
  return spec.capacityMl;
}

export function capacityFitsVolume(fillMl: number | null, requestedMl: number): boolean {
  if (!(requestedMl > 0)) return true;
  if (fillMl === null || !Number.isFinite(fillMl)) return false;
  const gap = Math.abs(fillMl - requestedMl);
  return gap <= VOLUME_ABSOLUTE_ML || gap / requestedMl <= VOLUME_TOLERANCE;
}

export function matchingBottleIds(
  bottles: Array<{ id: string; fillMl: number | null }>,
  requestedMl: number,
  alwaysInclude: string[] = [],
): { ids: Set<string>; relaxed: boolean } {
  const fit = bottles.filter((bottle) => capacityFitsVolume(bottle.fillMl, requestedMl));
  const ids = new Set<string>();
  if (fit.length) {
    for (const bottle of fit) ids.add(bottle.id);
    for (const id of alwaysInclude) ids.add(id);
    return { ids, relaxed: false };
  }
  const known = bottles.filter((bottle) => bottle.fillMl !== null);
  if (!known.length) {
    for (const bottle of bottles) ids.add(bottle.id);
    return { ids, relaxed: true };
  }
  let best = Infinity;
  for (const bottle of known) best = Math.min(best, Math.abs((bottle.fillMl ?? 0) - requestedMl));
  for (const bottle of known) {
    if (Math.abs((bottle.fillMl ?? 0) - requestedMl) === best) ids.add(bottle.id);
  }
  for (const id of alwaysInclude) ids.add(id);
  return { ids, relaxed: true };
}
