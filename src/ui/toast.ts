/** Share URLs and missing-part lists must not stretch the toast across the screen. */
export const TOAST_MAX = 120;

export function clipToast(text: string, max = TOAST_MAX): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}
