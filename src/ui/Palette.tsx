import { useEffect, useMemo, useState } from "react";
import { partLabel, tx } from "../i18n/copy.ts";
import { listFor } from "../model/catalog.ts";
import type { VariantPart } from "../model/types.ts";
import { useLab } from "../store/labStore.ts";

const KINDS: VariantPart[] = ["bottle", "cap", "label", "pump", "collar", "box"];

export function CommandPalette() {
  const open = useLab((s) => s.palette);
  const setPalette = useLab((s) => s.setPalette);
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const apply = useLab((s) => s.applyCommands);
  const setStage = useLab((s) => s.setStage);
  const setBlueprint = useLab((s) => s.setBlueprint);
  const blueprint = useLab((s) => s.blueprint);
  const setPresent = useLab((s) => s.setPresent);
  const setMode = useLab((s) => s.setMode);
  const isolate = useLab((s) => s.isolate);
  const selected = useLab((s) => s.selected);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const actions = useMemo(() => {
    const rows: Array<{ id: string; label: string; hay: string; run: () => void }> = [
      { id: "stage-bottle", label: t.stageBottle, hay: `${t.stageBottle} bottle בקבוק`, run: () => setStage("bottle") },
      { id: "stage-box", label: t.stageBox, hay: `${t.stageBox} box קופסה`, run: () => setStage("box") },
      { id: "stage-together", label: t.stageTogether, hay: `${t.stageTogether} together`, run: () => setStage("together") },
      { id: "grid", label: t.blueprint, hay: `${t.blueprint} wireframe רשת`, run: () => setBlueprint(!blueprint) },
      { id: "explode", label: t.explode, hay: `${t.explode} explode`, run: () => setMode("explode") },
      { id: "assemble", label: t.assemble, hay: `${t.assemble} assemble`, run: () => setMode("assemble") },
      { id: "present", label: t.present, hay: `${t.present} present`, run: () => setPresent(true) },
    ];
    if (selected) rows.unshift({ id: "solo", label: t.isolate, hay: `${t.isolate} solo`, run: () => isolate(selected) });
    const parts = KINDS.flatMap((kind) => listFor(kind).map((item) => ({
      id: `${kind}-${item.id}`,
      label: `${partLabel[lang][kind]} · ${lang === "he" ? item.he : item.en}`,
      hay: `${item.he} ${item.en} ${item.tags.join(" ")} ${item.id}`,
      run: () => apply([{ type: "variant" as const, part: kind, id: item.id }, { type: "select" as const, part: kind }]),
    })));
    const q = query.trim().toLowerCase();
    return [...rows, ...parts].filter((row) => !q || row.hay.toLowerCase().includes(q) || row.label.toLowerCase().includes(q)).slice(0, 12);
  }, [apply, blueprint, isolate, lang, query, selected, setBlueprint, setMode, setPresent, setStage, t]);

  if (!open) return null;
  return (
    <div className="palette-back" onClick={() => setPalette(false)}>
      <form
        className="palette"
        dir={lang === "he" ? "rtl" : "ltr"}
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          actions[0]?.run();
          setPalette(false);
        }}
      >
        <input autoFocus value={query} placeholder={t.paletteHint} onChange={(event) => setQuery(event.target.value)} />
        <ul>
          {actions.map((action) => (
            <li key={action.id}>
              <button type="button" onClick={() => { action.run(); setPalette(false); }}>{action.label}</button>
            </li>
          ))}
        </ul>
      </form>
    </div>
  );
}

export function ShortcutHelp() {
  const open = useLab((s) => s.help);
  const setHelp = useLab((s) => s.setHelp);
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  if (!open) return null;
  return (
    <div className="palette-back" onClick={() => setHelp(false)}>
      <div className="palette help-card" dir={lang === "he" ? "rtl" : "ltr"} onClick={(event) => event.stopPropagation()}>
        <h2>{t.shortcuts}</h2>
        <ul>
          <li>{t.kPalette}</li>
          <li>{t.kIsolate}</li>
          <li>{t.kFull}</li>
          <li>{t.kPresent}</li>
          <li>{t.arrows}</li>
        </ul>
      </div>
    </div>
  );
}

export function Intro() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setOn(false), 1500);
    return () => window.clearTimeout(timer);
  }, []);
  if (!on) return null;
  return (
    <div className="intro">
      <span>PERFUME LAB</span>
      <strong>מעבדת הבושם</strong>
      <i />
    </div>
  );
}
