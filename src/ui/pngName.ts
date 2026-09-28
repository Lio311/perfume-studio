const MAX_PART = 60;

/** Keep Unicode letters, combining marks, and digits, plus `_` and `-`. Spaces become `_`. */
export function sanitizeFilenamePart(value: string): string {
  const cleaned = value
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{M}\p{N}_-]+/gu, "")
    .replace(/_+/g, "_")
    .slice(0, MAX_PART);
  return cleaned.replace(/^_+|_+$/g, "");
}

export function pngDownloadName(label: string, bottle: string, day: string): string {
  const brand = sanitizeFilenamePart(label) || "BRAND";
  const shape = sanitizeFilenamePart(bottle);
  const stamp = sanitizeFilenamePart(day) || "export";
  return shape ? `${brand}_${shape}_${stamp}.png` : `${brand}_${stamp}.png`;
}
