import { BOX_RANGES } from "./boxFields.ts";

/** Query keys a `?closure=` link writes. Everything else, including `voice`, stays. */
export const SHOT_QUERY_KEYS = [
  "closure",
  "structure",
  "variant",
  "pull",
  "latch",
  "shape",
  "insert",
  "orient",
  "sleeve",
  "brand",
  "color",
  "board",
  "height",
  "tier",
  "pose",
  "theme",
  "cut",
] as const;

/** Search string with the shot keys removed. Keeps a leading `?` when anything remains. */
export function stripShotQuery(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const key of SHOT_QUERY_KEYS) params.delete(key);
  const next = params.toString();
  return next ? `?${next}` : "";
}

/** Millimetres from `?height=`. An empty or non-numeric value is absent, not the minimum. */
export function shotHeightMm(raw: string | null, range: readonly [number, number] = BOX_RANGES.heightMm): number | null {
  if (raw == null || raw.trim() === "") return null;
  const height = Number(raw);
  if (!Number.isFinite(height)) return null;
  const [lo, hi] = range;
  return Math.min(hi, Math.max(lo, height));
}
