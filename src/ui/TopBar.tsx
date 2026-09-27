import { tx } from "../i18n/copy.ts";
import { bottleById } from "../model/catalog.ts";
import { estimateMl } from "../model/design.ts";
import { useLab } from "../store/labStore.ts";

export function TopBar() {
  const lang = useLab((s) => s.lang);
  const theme = useLab((s) => s.theme);
  const design = useLab((s) => s.design);
  const setLang = useLab((s) => s.setLang);
  const setTheme = useLab((s) => s.setTheme);
  const randomize = useLab((s) => s.randomize);
  const libraryOpen = useLab((s) => s.libraryOpen);
  const sideOpen = useLab((s) => s.sideOpen);
  const setLibraryOpen = useLab((s) => s.setLibraryOpen);
  const setSideOpen = useLab((s) => s.setSideOpen);
  const t = tx(lang);
  const ml = estimateMl(design);
  const spec = bottleById(design.bottle.variantId);
  return (
    <header className="topbar">
      <div className="brand" dir={lang === "he" ? "rtl" : "ltr"}>
        <span className="kicker">{t.kicker}</span>
        <strong>{lang === "he" ? t.appHe : t.appEn}</strong>
      </div>
      <p className="spec" dir="ltr">
        <bdi>{ml} ml</bdi>
        <span>·</span>
        <bdi>{design.bottle.neck.replace("FEA", "FEA ")}</bdi>
        <span>·</span>
        <bdi>
          {design.bottle.heightMm.toFixed(1)} × {design.bottle.widthMm.toFixed(1)} × {design.bottle.depthMm.toFixed(1)}
        </bdi>
        <span className="spec-name">{lang === "he" ? spec.name.he : spec.name.en}</span>
      </p>
      <div className="top-actions">
        <button type="button" className="text-btn panel-toggle" onClick={() => setLibraryOpen(!libraryOpen)}>
          {t.library}
        </button>
        <button type="button" className="text-btn panel-toggle" onClick={() => setSideOpen(!sideOpen)}>
          {t.properties}
        </button>
        <button type="button" className="text-btn" onClick={() => randomize()}>
          {t.random}
        </button>
        <button type="button" className="text-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? t.themeToLight : t.themeToDark}
        </button>
        <button type="button" className="text-btn lang" onClick={() => setLang(lang === "he" ? "en" : "he")}>
          {t.lang}
        </button>
      </div>
    </header>
  );
}
