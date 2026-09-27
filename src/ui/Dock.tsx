import { tx } from "../i18n/copy.ts";
import { requestShot } from "../scene/capture.ts";
import { useLab } from "../store/labStore.ts";

export function Dock() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const exploded = useLab((s) => s.exploded);
  const autoRotate = useLab((s) => s.autoRotate);
  const toggleExplode = useLab((s) => s.toggleExplode);
  const toggleRotate = useLab((s) => s.toggleRotate);
  const resetView = useLab((s) => s.resetView);
  const setModal = useLab((s) => s.setModal);
  return (
    <div className="dock" dir={lang === "he" ? "rtl" : "ltr"}>
      <button type="button" className={exploded ? "is-on" : ""} onClick={() => toggleExplode()}>{exploded ? t.assemble : t.explode}</button>
      <button type="button" className={autoRotate ? "is-on" : ""} onClick={() => toggleRotate()}>{t.rotate}</button>
      <button type="button" onClick={() => resetView()}>{t.reset}</button>
      <button type="button" onClick={() => setModal("save")}>{t.save}</button>
      <button type="button" onClick={() => setModal("compare")}>{t.compare}</button>
      <button
        type="button"
        onClick={() => {
          requestShot((url) => {
            const link = document.createElement("a");
            link.href = url;
            link.download = "perfume-lab.png";
            link.click();
          });
        }}
      >
        {t.export}
      </button>
    </div>
  );
}
