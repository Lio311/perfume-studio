/** Maps a 0–1 explode amount to a per-part 0–1 offset.
 * 0.25 only cracks the assembly open. 1 reaches the full gap. */
export function explodeLocal(index: number, amount: number): number {
  const delay = Math.min(0.45, index * 0.05);
  const span = Math.max(0.35, 1 - delay);
  const t = Math.min(1, Math.max(0, (amount - delay) / span));
  return t * t * (3 - 2 * t);
}
