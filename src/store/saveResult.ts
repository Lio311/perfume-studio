export type SaveResult = { ok: true } | { ok: false };

/**
 * Commit a saved-design list. `write` persists it (and may throw, for example
 * when localStorage is over quota). A failed write rolls the list back.
 * The storage writer logs that error. This function does not, so a setItem
 * that logs and rethrows is not recorded twice.
 */
export function commitSavedDesigns<T>(
  previous: T[],
  next: T[],
  write: (saved: T[]) => void,
): { ok: true; saved: T[] } | { ok: false; saved: T[] } {
  try {
    write(next);
    return { ok: true, saved: next };
  } catch {
    try {
      write(previous);
    } catch {
      // The failed write did not replace the previous payload.
    }
    return { ok: false, saved: previous };
  }
}
