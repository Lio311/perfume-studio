import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import DOMPurify from "dompurify";
import { partLabel, tx } from "../i18n/copy.ts";
import { cropPage } from "../import/crop.ts";
import { capPackNotices } from "../import/notices.ts";
import { duplicateClashIssue, duplicateClashes, issuesForDraft, KIND_DEFAULT_MM, MAX_PACK_BYTES, type FieldIssue, type SlugClash } from "../import/packValidate.ts";
import { parsePackFile } from "../import/supplierDb.ts";
import { readPdfCatalog, type CatalogPageImage } from "../import/pdfCatalog.ts";
import { regexCatalogSource, type DraftItem, type ImportProfile, type NormRect } from "../import/parseCatalog.ts";
import { partFromDraft } from "../import/registry.ts";
import type { NeckId, VariantPart } from "../model/types.ts";
import { useLab } from "../store/labStore.ts";

const KINDS: VariantPart[] = ["cap", "box", "bottle", "label", "pump", "collar"];
const NECKS: Array<NeckId | ""> = ["", "FEA13", "FEA15", "FEA17", "FEA18", "FEA20"];

type Row = DraftItem & { thumb: string; color: string };

function profileFor(kind: VariantPart): ImportProfile {
  if (kind === "box") return "box";
  if (kind === "label") return "label";
  if (kind === "pump") return "pump";
  if (kind === "collar") return "collar";
  if (kind === "bottle") return "bottle";
  return "cylinder";
}

function blankRow(page = 1): Row {
  const size = KIND_DEFAULT_MM.cap;
  return {
    id: `manual-${Date.now().toString(36)}`,
    page,
    kind: "cap",
    code: "",
    neck: "FEA15",
    widthMm: size.widthMm,
    heightMm: size.heightMm,
    depthMm: size.depthMm,
    capacityMl: null,
    profile: "cylinder",
    crop: { x: 0.12, y: 0.12, w: 0.7, h: 0.7 },
    confidence: 0.2,
    manual: true,
    thumb: "",
    color: "#c4a15a",
  };
}

function draftProblems(row: Row, clash?: SlugClash): FieldIssue[] {
  return [
    ...issuesForDraft({
      id: row.id,
      kind: row.kind,
      code: row.code,
      neck: row.neck,
      widthMm: Number(row.widthMm),
      heightMm: Number(row.heightMm),
      depthMm: Number(row.depthMm),
      capacityMl: row.capacityMl,
      profile: row.profile,
      page: row.page,
    }),
    ...(clash ? [duplicateClashIssue(row.code.trim(), clash)] : []),
  ];
}

export function SupplierImport() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const setModal = useLab((s) => s.setModal);
  const upsertSupplier = useLab((s) => s.upsertSupplier);
  const [name, setName] = useState("");
  const [pages, setPages] = useState<CatalogPageImage[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const drag = useRef<NormRect | null>(null);

  async function ingest(file: File) {
    setBusy(true);
    setError("");
    setWarnings([]);
    try {
      const nextPages = await readPdfCatalog(await file.arrayBuffer());
      const drafts = regexCatalogSource.extract(nextPages.map((page) => ({ page: page.page, text: page.text })));
      const painted = await Promise.all(drafts.map(async (draft) => {
        const page = nextPages.find((item) => item.page === draft.page);
        const cropped = page ? await cropPage(page.image, draft.crop) : { thumb: "", color: "#c4a15a" };
        return { ...draft, ...cropped };
      }));
      setPages(nextPages);
      setRows(painted);
      setActive(painted[0]?.id ?? null);
    } catch {
      setError(lang === "he" ? "לא הצלחנו לקרוא את ה־PDF." : "Could not read that PDF.");
    } finally {
      setBusy(false);
    }
  }

  function patch(id: string, partial: Partial<Row>) {
    setRows((current) => current.map((row) => {
      if (row.id !== id) return row;
      const next = { ...row, ...partial };
      if (partial.kind && partial.kind !== row.kind) {
        next.profile = profileFor(partial.kind);
        const previous = KIND_DEFAULT_MM[row.kind];
        const untouched = row.widthMm === previous.widthMm && row.heightMm === previous.heightMm && row.depthMm === previous.depthMm;
        if (untouched) {
          const size = KIND_DEFAULT_MM[partial.kind];
          next.widthMm = size.widthMm;
          next.heightMm = size.heightMm;
          next.depthMm = size.depthMm;
        }
      }
      return next;
    }));
  }

  async function recrop(id: string, crop: NormRect) {
    const row = rows.find((item) => item.id === id);
    const page = pages.find((item) => item.page === row?.page);
    patch(id, { crop });
    if (!page) return;
    const cropped = await cropPage(page.image, crop);
    patch(id, cropped);
  }

  function onPointer(event: ReactPointerEvent<HTMLDivElement>, phase: "down" | "move" | "up") {
    if (!active) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    if (phase === "down") {
      drag.current = { x, y, w: 0.04, h: 0.04 };
      patch(active, { crop: drag.current });
      return;
    }
    if (!drag.current) return;
    const crop = {
      x: Math.min(drag.current.x, x),
      y: Math.min(drag.current.y, y),
      w: Math.max(0.04, Math.abs(x - drag.current.x)),
      h: Math.max(0.04, Math.abs(y - drag.current.y)),
    };
    if (phase === "move") patch(active, { crop });
    else {
      drag.current = null;
      void recrop(active, crop);
    }
  }

  function addPhoto(file: File, id: string) {
    const reader = new FileReader();
    reader.onload = () => {
      const image = String(reader.result || "");
      void cropPage(image, { x: 0, y: 0, w: 1, h: 1 }).then((cropped) => patch(id, cropped));
    };
    reader.readAsDataURL(file);
  }

  const clashes = useMemo(() => duplicateClashes(rows), [rows]);

  function commit() {
    if (rows.some((row) => draftProblems(row, clashes.get(row.id)).length > 0)) return;
    const rawName = name.trim() || (lang === "he" ? "ספק" : "Supplier");
    const supplier = DOMPurify.sanitize(rawName);
    const id = `sup-${Date.now().toString(36)}`;
    const parts = rows.map((row, index) => ({
      ...partFromDraft(row, { id, name: supplier }, index),
      color: row.color || "#c4a15a",
      thumb: row.thumb,
      neck: row.neck,
      widthMm: Number(row.widthMm) || 30,
      heightMm: Number(row.heightMm) || 30,
      depthMm: Number(row.depthMm) || Number(row.widthMm) || 30,
      capacityMl: row.capacityMl,
      profile: row.profile,
      kind: row.kind,
    }));
    upsertSupplier({ id, name: supplier, createdAt: Date.now(), parts });
  }

  const current = rows.find((row) => row.id === active) ?? null;
  const page = pages.find((item) => item.page === current?.page) ?? null;
  const blankPages = pages.filter((item) => item.text.trim().length < 4);
  const ready = rows.length > 0 && rows.every((row) => draftProblems(row, clashes.get(row.id)).length === 0);

  return (
    <div className="modal-back" onClick={() => setModal(null)}>
      <div className="modal wide supplier-modal" dir={lang === "he" ? "rtl" : "ltr"} onClick={(event) => event.stopPropagation()}>
        <header>
          <h2>{t.importCatalog}</h2>
          <button type="button" onClick={() => setModal(null)}>{t.close}</button>
        </header>
        <label className="supplier-name">
          <span>{t.supplierName}</span>
          <input value={name} placeholder={t.supplierPh} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="modal-actions">
          <label className="text-btn file-btn">
            {t.choosePdf}
            <input type="file" accept="application/pdf,.pdf" hidden onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void ingest(file);
            }} />
          </label>
          <label className="text-btn file-btn">
            {t.importPack}
            <input type="file" accept="application/json,.json" hidden onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              if (file.size > MAX_PACK_BYTES) {
                setWarnings([]);
                setError(t.packTooBig);
                return;
              }
              void file.text().then((text) => {
                const result = parsePackFile(text);
                if (result.ok) {
                  upsertSupplier(result.pack, result.warnings);
                  setError("");
                  setWarnings(capPackNotices(result.warnings, lang));
                } else {
                  setWarnings([]);
                  setError(lang === "he" ? result.error.he : result.error.en);
                }
              });
            }} />
          </label>
          <button type="button" onClick={() => {
            const row = blankRow(page?.page ?? pages[0]?.page ?? 1);
            setRows((currentRows) => [...currentRows, row]);
            setActive(row.id);
          }}>{t.addRow}</button>
        </div>
        {busy && <p className="hint">{lang === "he" ? "קורא עמודים…" : "Reading pages…"}</p>}
        {error && <p className="hint">{error}</p>}
        {warnings.length > 0 && (
          <ul className="pack-warnings" role="status">
            {warnings.map((line, index) => <li key={index}>{line}</li>)}
          </ul>
        )}
        {blankPages.map((item) => <p key={item.page} className="hint">{t.noText} · {t.pages} {item.page}</p>)}
        <div className="supplier-body">
          <div className="supplier-table">
        {rows.length > 0 && (
          <div className="review-wrap" data-review>
            <table className="review-table">
              <thead>
                <tr>
                  <th>{t.pages}</th>
                  <th>{t.colCode}</th>
                  <th>{t.colType}</th>
                  <th>{t.colW}</th>
                  <th>{t.colH}</th>
                  <th>{t.colD}</th>
                  <th>{t.colNeck}</th>
                  <th>{t.capacityShort}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const problems = draftProblems(row, clashes.get(row.id));
                  const message = (field: string) => {
                    const hit = problems.find((item) => item.field === field);
                    return hit ? (lang === "he" ? hit.he : hit.en) : "";
                  };
                  return (
                  <tr key={row.id} className={row.id === active ? "is-on" : ""} onClick={() => setActive(row.id)}>
                    <td><img src={row.thumb} alt="" /> <bdi>{row.page}</bdi></td>
                    <td>
                      <input dir="ltr" aria-invalid={message("code") ? true : undefined} value={row.code} onChange={(event) => patch(row.id, { code: event.target.value })} />
                      {message("code") && <span className="field-error" data-field-error="code">{message("code")}</span>}
                    </td>
                    <td>
                      <select aria-invalid={message("kind") ? true : undefined} value={row.kind} onChange={(event) => patch(row.id, { kind: event.target.value as VariantPart })}>
                        {KINDS.map((kind) => <option key={kind} value={kind}>{partLabel[lang][kind]}</option>)}
                      </select>
                      {message("kind") && <span className="field-error" data-field-error="kind">{message("kind")}</span>}
                    </td>
                    <td>
                      <input dir="ltr" aria-invalid={message("widthMm") ? true : undefined} type="number" value={row.widthMm} onChange={(event) => patch(row.id, { widthMm: Number(event.target.value) })} />
                      {message("widthMm") && <span className="field-error" data-field-error="widthMm">{message("widthMm")}</span>}
                    </td>
                    <td>
                      <input dir="ltr" aria-invalid={message("heightMm") ? true : undefined} type="number" value={row.heightMm} onChange={(event) => patch(row.id, { heightMm: Number(event.target.value) })} />
                      {message("heightMm") && <span className="field-error" data-field-error="heightMm">{message("heightMm")}</span>}
                    </td>
                    <td>
                      <input dir="ltr" aria-invalid={message("depthMm") ? true : undefined} type="number" value={row.depthMm} onChange={(event) => patch(row.id, { depthMm: Number(event.target.value) })} />
                      {message("depthMm") && <span className="field-error" data-field-error="depthMm">{message("depthMm")}</span>}
                    </td>
                    <td>
                      <select aria-invalid={message("neck") ? true : undefined} value={row.neck ?? ""} onChange={(event) => patch(row.id, { neck: (event.target.value || null) as NeckId | null })}>
                        {NECKS.map((neck) => <option key={neck || "none"} value={neck}>{neck || "—"}</option>)}
                      </select>
                      {message("neck") && <span className="field-error" data-field-error="neck">{message("neck")}</span>}
                    </td>
                    <td>
                      <input dir="ltr" aria-invalid={message("capacityMl") ? true : undefined} type="number" value={row.capacityMl ?? ""} onChange={(event) => patch(row.id, { capacityMl: event.target.value ? Number(event.target.value) : null })} />
                      {message("capacityMl") && <span className="field-error" data-field-error="capacityMl">{message("capacityMl")}</span>}
                    </td>
                    <td><button type="button" onClick={(event) => { event.stopPropagation(); setRows((currentRows) => currentRows.filter((item) => item.id !== row.id)); }}>{t.delete}</button></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
          </div>
          <div className="supplier-preview">
        {page && current && (
          <div className="crop-block">
            <p className="hint">{t.cropHint}</p>
            <div
              className="crop-frame"
              onPointerDown={(event) => onPointer(event, "down")}
              onPointerMove={(event) => onPointer(event, "move")}
              onPointerUp={(event) => onPointer(event, "up")}
            >
              <img src={page.image} alt="" />
              <i style={{ left: `${current.crop.x * 100}%`, top: `${current.crop.y * 100}%`, width: `${current.crop.w * 100}%`, height: `${current.crop.h * 100}%` }} />
            </div>
            <label className="text-btn file-btn">
              {t.photo}
              <input type="file" accept="image/*" hidden onChange={(event) => {
                const file = event.target.files?.[0];
                if (file && current) addPhoto(file, current.id);
              }} />
            </label>
          </div>
        )}
        {!page && current && (
          <label className="text-btn file-btn">
            {t.photo}
            <input type="file" accept="image/*" hidden onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) addPhoto(file, current.id);
            }}             />
          </label>
        )}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="spec-export" data-add-library disabled={!ready} onClick={commit}>{t.addToLibrary}</button>
        </div>
      </div>
    </div>
  );
}
