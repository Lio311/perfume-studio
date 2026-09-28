import { useState } from "react";
import { tx } from "../i18n/copy.ts";
import { bottleById, capById } from "../model/catalog.ts";
import type { VariantPart } from "../model/types.ts";
import { requestShot } from "../scene/capture.ts";
import { useLab } from "../store/labStore.ts";
import { thumbFor } from "../thumbnails/thumbs.ts";
import { PhotoTo3D } from "./PhotoTo3D.tsx";
import { SupplierImport } from "./SupplierImport.tsx";

export function Modals() {
  const modal = useLab((s) => s.modal);
  if (modal === "save") return <SaveModal />;
  if (modal === "compare") return <CompareModal />;
  if (modal === "upload") return <UploadModal />;
  if (modal === "supplier") return <SupplierImport />;
  if (modal === "photo") return <PhotoTo3D />;
  return null;
}

function SaveModal() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const saved = useLab((s) => s.saved);
  const saveDesign = useLab((s) => s.saveDesign);
  const loadDesign = useLab((s) => s.loadDesign);
  const deleteDesign = useLab((s) => s.deleteDesign);
  const setModal = useLab((s) => s.setModal);
  const [name, setName] = useState(lang === "he" ? "סקיצה" : "Sketch");
  const [armed, setArmed] = useState<string | null>(null);
  return (
    <div className="modal-back" onClick={() => setModal(null)}>
      <div className="modal" dir={lang === "he" ? "rtl" : "ltr"} onClick={(event) => event.stopPropagation()}>
        <header><h2>{t.saveTitle}</h2><button type="button" onClick={() => setModal(null)}>{t.close}</button></header>
        <form
          className="save-row"
          onSubmit={(event) => {
            event.preventDefault();
            requestShot((url) => {
              void shrink(url).then((thumb) => saveDesign(name, thumb));
            });
          }}
        >
          <input value={name} onChange={(event) => setName(event.target.value)} aria-label={t.saveName} />
          <button type="submit">{t.save}</button>
        </form>
        <div className="saved-list">
          {saved.length === 0 && <p className="hint">{t.noSaved}</p>}
          {saved.map((item) => (
            <article key={item.id}>
              <img src={item.thumb || thumbFor("bottle", item.design.bottle.variantId)} alt="" />
              <div>
                <strong>{item.name}</strong>
                <span dir="ltr">{item.design.bottle.neck}</span>
              </div>
              <button type="button" onClick={() => loadDesign(item.id)}>{t.load}</button>
              <button type="button" onClick={() => (armed === item.id ? deleteDesign(item.id) : setArmed(item.id))}>
                {armed === item.id ? t.confirmDelete : t.delete}
              </button>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function CompareModal() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const saved = useLab((s) => s.saved);
  const compareIds = useLab((s) => s.compareIds);
  const toggleCompare = useLab((s) => s.toggleCompare);
  const loadDesign = useLab((s) => s.loadDesign);
  const setModal = useLab((s) => s.setModal);
  const chosen = saved.filter((item) => compareIds.includes(item.id)).slice(0, 3);
  return (
    <div className="modal-back" onClick={() => setModal(null)}>
      <div className="modal wide" dir={lang === "he" ? "rtl" : "ltr"} onClick={(event) => event.stopPropagation()}>
        <header><h2>{t.compareTitle}</h2><button type="button" onClick={() => setModal(null)} aria-label={t.close}>×</button></header>
        <p className="hint">{t.compareHint}</p>
        <div className="compare-picks">
          {saved.map((item) => (
            <label key={item.id}>
              <input type="checkbox" checked={compareIds.includes(item.id)} onChange={() => toggleCompare(item.id)} />
              {item.name}
            </label>
          ))}
        </div>
        {chosen.length < 2 ? <p className="hint">{t.compareNeed}</p> : (
          <div className="compare-row">
            {chosen.map((item) => {
              const bottle = bottleById(item.design.bottle.variantId);
              const cap = capById(item.design.cap.variantId);
              return (
                <article key={item.id}>
                  <img src={item.thumb || thumbFor("bottle", item.design.bottle.variantId)} alt="" />
                  <h3>{item.name}</h3>
                  <ul>
                    <li>{bottle.name[lang]}</li>
                    <li>{cap.name[lang]}</li>
                    <li dir="ltr">{item.design.bottle.neck} · {item.design.bottle.heightMm.toFixed(0)}×{item.design.bottle.widthMm.toFixed(0)}×{item.design.bottle.depthMm.toFixed(0)}</li>
                    <li><i style={{ background: item.design.liquid.color }} /> {item.design.bottle.finish}</li>
                  </ul>
                  <button type="button" onClick={() => loadDesign(item.id)}>{t.load}</button>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function UploadModal() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const setModal = useLab((s) => s.setModal);
  const addPending = useLab((s) => s.addPending);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<VariantPart | "unassigned">("bottle");
  const [files, setFiles] = useState<File[]>([]);
  return (
    <div className="modal-back" onClick={() => setModal(null)}>
      <div className="modal" dir={lang === "he" ? "rtl" : "ltr"} onClick={(event) => event.stopPropagation()}>
        <header><h2>{t.uploadTitle}</h2><button type="button" onClick={() => setModal(null)}>{t.close}</button></header>
        <p className="hint">{t.uploadHint}</p>
        <input value={name} placeholder={t.saveName} onChange={(event) => setName(event.target.value)} />
        <select value={category} onChange={(event) => setCategory(event.target.value as VariantPart | "unassigned")}>
          <option value="bottle">{lang === "he" ? "בקבוק" : "Bottle"}</option>
          <option value="cap">{lang === "he" ? "פקק" : "Cap"}</option>
          <option value="label">{t.kindLabel}</option>
          <option value="pump">{t.kindPump}</option>
          <option value="collar">{lang === "he" ? "צווארון" : "Collar"}</option>
          <option value="box">{lang === "he" ? "קופסה" : "Box"}</option>
          <option value="unassigned">{t.unassigned}</option>
        </select>
        <label className="text-btn file-btn">
          {t.chooseFiles}
          <input type="file" accept="image/*,application/pdf" multiple hidden onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
        </label>
        {files.length > 0 && <p className="hint">{files.map((file) => file.name).join(" · ")}</p>}
        <div className="modal-actions">
          <button type="button" onClick={() => setModal(null)}>{t.cancel}</button>
          <button
            type="button"
            disabled={!name.trim() || files.length === 0}
            onClick={() => {
              void Promise.all(files.map(async (file) => ({
                name: file.name,
                type: file.type || "application/octet-stream",
                size: file.size,
                thumb: await thumbFile(file),
              }))).then((stored) => {
                addPending({
                  id: `pending-${Date.now()}`,
                  name: name.trim(),
                  category,
                  files: stored,
                  createdAt: Date.now(),
                });
              });
            }}
          >
            {t.add}
          </button>
        </div>
      </div>
    </div>
  );
}

function shrink(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = 480 / Math.max(1, image.width);
      canvas.width = 480;
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

async function thumbFile(file: File): Promise<string | undefined> {
  if (!file.type.startsWith("image/")) return undefined;
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    const scale = 160 / Math.max(image.width, image.height);
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image"));
    image.src = url;
  });
}
