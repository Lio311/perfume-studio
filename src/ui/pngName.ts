const MAX_PART = 60;

/** Keep Unicode letters and digits, plus `_` and `-`. Spaces become `_`. */
export function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_-]+/gu, "")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_PART);
}

export function pngDownloadName(label: string, bottle: string, day: string): string {
  const brand = sanitizeFilenamePart(label) || "BRAND";
  const shape = sanitizeFilenamePart(bottle);
  const stamp = sanitizeFilenamePart(day) || "export";
  return shape ? `${brand}_${shape}_${stamp}.png` : `${brand}_${stamp}.png`;
}
