/** Share URLs and missing-part lists must not stretch the toast across the screen. */
export const TOAST_MAX = 120;

export function clipToast(text: string, max = TOAST_MAX): string {
  const trimmed = text.trim();
  const chars = Array.from(trimmed);
  if (chars.length <= max) return trimmed;
  let end = max - 1;
  let open = -1;
  for (let i = 0; i < end && i < chars.length; i += 1) {
    if (chars[i] === "\u2068") open = i;
    else if (chars[i] === "\u2069") open = -1;
  }
  if (open >= 0) end = open;
  return `${chars.slice(0, end).join("")}…`;
}
