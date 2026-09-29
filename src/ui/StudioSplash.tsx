/** Matches the static loader in index.html so a suspended canvas is never a black frame. */
export function StudioSplash() {
  return (
    <div className="studio-splash" role="status" aria-live="polite">
      <div className="studio-splash-mark" aria-hidden="true" />
      <p className="studio-splash-he" dir="rtl">טוען את הסטודיו…</p>
      <p className="studio-splash-en">Loading studio…</p>
    </div>
  );
}
