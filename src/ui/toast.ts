/** Share URLs and missing-part lists must not stretch the toast across the screen. */
export const TOAST_MAX = 120;

const ISOLATE_OPEN = new Set(["\u2066", "\u2067", "\u2068"]);
const ISOLATE_CLOSE = "\u2069";

export function clipToast(text: string, max = TOAST_MAX): string {
  const trimmed = text.trim();
  const chars = Array.from(trimmed);
  if (chars.length <= max) return trimmed;
  let end = max - 1;
  const open: number[] = [];
  for (let i = 0; i < end && i < chars.length; i += 1) {
    if (ISOLATE_OPEN.has(chars[i])) open.push(i);
    else if (chars[i] === ISOLATE_CLOSE) open.pop();
  }
  if (open.length > 0) end = open[0];
  return `${chars.slice(0, end).join("")}…`;
}
