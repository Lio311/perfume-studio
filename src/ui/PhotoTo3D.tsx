import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { tx } from "../i18n/copy.ts";
import { lathePhotoSource } from "../import/photoSource.ts";
import { editRadius, segmentSilhouette, type Silhouette } from "../import/silhouette.ts";
import type { SupplierPart } from "../import/registry.ts";
import type { NeckId, VariantPart } from "../model/types.ts";
import { useLab } from "../store/labStore.ts";

const NECKS: NeckId[] = ["FEA13", "FEA15", "FEA17", "FEA18", "FEA20"];
const KINDS: Array<Extract<VariantPart, "cap" | "collar" | "pump">> = ["cap", "collar", "pump"];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    image.src = url;
  });
}

function paint(canvas: HTMLCanvasElement, image: HTMLImageElement, shape: Silhouette) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const scale = Math.min(360 / image.width, 280 / image.height, 1);
  canvas.width = Math.max(2, Math.round(image.width * scale));
  canvas.height = Math.max(2, Math.round(image.height * scale));
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#D6B26A";
  ctx.lineWidth = 2;
  ctx.beginPath();
  shape.radii.forEach((radius, index) => {
    const y = shape.maxY - (index / Math.max(1, shape.radii.length - 1)) * (shape.maxY - shape.minY);
    const x = shape.centerX + radius * shape.maxHalf;
    const px = (x / shape.width) * canvas.width;
    const py = (y / shape.height) * canvas.height;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  for (let index = shape.radii.length - 1; index >= 0; index -= 1) {
    const radius = shape.radii[index];
    const y = shape.maxY - (index / Math.max(1, shape.radii.length - 1)) * (shape.maxY - shape.minY);
    const x = shape.centerX - radius * shape.maxHalf;
    ctx.lineTo((x / shape.width) * canvas.width, (y / shape.height) * canvas.height);
  }
  ctx.closePath();
  ctx.stroke();
}

export function PhotoTo3D() {
  const lang = useLab((s) => s.lang);
  const t = tx(lang);
  const setModal = useLab((s) => s.setModal);
  const upsertSupplier = useLab((s) => s.upsertSupplier);
  const applyCommands = useLab((s) => s.applyCommands);
  const [supplier, setSupplier] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("cap");
  const [neck, setNeck] = useState<NeckId>("FEA15");
  const [height, setHeight] = useState(34);
  const [diameter, setDiameter] = useState(30);
  const [threshold, setThreshold] = useState(28);
  const [shape, setShape] = useState<Silhouette | null>(null);
  const [busy, setBusy] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef(false);

  async function ingest(file: File, gate = threshold) {
    setBusy(true);
    try {
      const image = await loadImage(file);
      imageRef.current = image;
      const canvas = document.createElement("canvas");
      const max = 280;
      const scale = Math.min(1, max / Math.max(image.width, image.height));
      canvas.width = Math.max(2, Math.round(image.width * scale));
      canvas.height = Math.max(2, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const next = segmentSilhouette(ctx.getImageData(0, 0, canvas.width, canvas.height), gate);
      setShape(next);
      requestAnimationFrame(() => {
        if (canvasRef.current) paint(canvasRef.current, image, next);
      });
    } finally {
      setBusy(false);
    }
  }

  function redraw(next: Silhouette) {
    setShape(next);
    const image = imageRef.current;
    if (image && canvasRef.current) paint(canvasRef.current, image, next);
  }

  function correct(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drag.current || !shape || !canvasRef.current) return;
    const bounds = canvasRef.current.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * shape.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * shape.height;
    redraw({ ...shape, radii: editRadius(shape, x, y) });
  }

  function commit() {
    if (!shape) return;
    const packId = `sup-${Date.now().toString(36)}`;
    const code = (name.trim() || "PHOTO").toUpperCase();
    const who = supplier.trim() || (lang === "he" ? "ספק" : "Supplier");
    const thumb = canvasRef.current?.toDataURL("image/jpeg", 0.72) ?? "";
    const part: SupplierPart = {
      id: `${packId}-${code.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "photo"}`,
      kind,
      code,
      name: `${code} · ${who}`,
      neck,
      widthMm: diameter,
      heightMm: height,
      depthMm: diameter,
      capacityMl: null,
      profile: kind === "pump" ? "pump" : kind === "collar" ? "collar" : "cylinder",
      color: shape.color,
      thumb,
      page: 1,
      lathe: shape.radii,
    };
    upsertSupplier({ id: packId, name: who, createdAt: Date.now(), parts: [part] });
    applyCommands([{ type: "variant", part: kind, id: part.id }]);
  }

  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) setModal(null); }} data-source={lathePhotoSource.id}>
      <div className="modal wide photo-modal" dir={lang === "he" ? "rtl" : "ltr"} onClick={(event) => event.stopPropagation()}>
        <header>
          <h2>{t.photo3d}</h2>
          <button type="button" onClick={() => setModal(null)} aria-label={t.close}>×</button>
        </header>
        <p className="hint">{t.photo3dHint}</p>
        <div className="photo-body">
          <div>
            <label className="text-btn file-btn">
              {t.chooseFiles}
              <input type="file" accept="image/*" hidden onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void ingest(file);
              }} />
            </label>
            <canvas
              ref={canvasRef}
              className="photo-canvas"
              onPointerDown={() => { drag.current = true; }}
              onPointerUp={() => { drag.current = false; }}
              onPointerLeave={() => { drag.current = false; }}
              onPointerMove={correct}
            />
            <p className="hint">{t.outlineHint}</p>
            <label className="photo-threshold">
              {t.threshold}
              <input type="range" min={8} max={90} value={threshold} onChange={(event) => {
                const gate = Number(event.target.value);
                setThreshold(gate);
                const file = imageRef.current;
                if (!file) return;
                const canvas = document.createElement("canvas");
                canvas.width = file.width;
                canvas.height = file.height;
                const ctx = canvas.getContext("2d");
                if (!ctx) return;
                const scale = Math.min(1, 280 / Math.max(file.width, file.height));
                canvas.width = Math.max(2, Math.round(file.width * scale));
                canvas.height = Math.max(2, Math.round(file.height * scale));
                ctx.drawImage(file, 0, 0, canvas.width, canvas.height);
                redraw(segmentSilhouette(ctx.getImageData(0, 0, canvas.width, canvas.height), gate));
              }} />
            </label>
          </div>
          <div className="photo-fields">
            <label>{t.supplierName}<input value={supplier} placeholder={t.supplierPh} onChange={(event) => setSupplier(event.target.value)} /></label>
            <label>{t.colCode}<input value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label>
              {t.colType}
              <select value={kind} onChange={(event) => setKind(event.target.value as (typeof KINDS)[number])}>
                <option value="cap">{lang === "he" ? "פקק" : "Cap"}</option>
                <option value="collar">{lang === "he" ? "צווארון" : "Collar"}</option>
                <option value="pump">{t.kindPump}</option>
              </select>
            </label>
            <label>
              {t.neck}
              <select value={neck} onChange={(event) => setNeck(event.target.value as NeckId)}>
                {NECKS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>{t.height} ({lang === "he" ? "מ״מ" : "mm"})<input type="number" value={height} min={8} max={80} onChange={(event) => setHeight(Number(event.target.value) || 8)} /></label>
            <label>{t.diameter} ({lang === "he" ? "מ״מ" : "mm"})<input type="number" value={diameter} min={10} max={60} onChange={(event) => setDiameter(Number(event.target.value) || 10)} /></label>
            {shape && (
              <p className="hint color-swatch" dir="ltr">
                <i style={{ background: shape.color }} />
                {shape.color}
              </p>
            )}
            {busy && <p className="hint">…</p>}
            <button type="button" className="spec-export" data-seat-photo disabled={!shape} onClick={commit}>{t.placeOnBottle}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
