/** Keep letters (including Hebrew), digits, underscore, and hyphen. Drop path separators and the rest. */
export function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^\w\u0590-\u05FF-]+/g, "");
}

export function pngDownloadName(label: string, bottle: string, day: string): string {
  const brand = sanitizeFilenamePart(label) || "BRAND";
  const shape = sanitizeFilenamePart(bottle);
  const stamp = sanitizeFilenamePart(day) || "export";
  return shape ? `${brand}_${shape}_${stamp}.png` : `${brand}_${stamp}.png`;
}
