import { importedMeta } from "../import/registry.ts";
import { bottleById, capById, logoById, pumpById } from "../model/catalog.ts";
import { neckRadius } from "../model/necks.ts";
import { bottleOutline, capRadius, clamp } from "../model/sample.ts";
import { drawLogo } from "../geometry/logos.ts";
import type { VariantPart } from "../model/types.ts";

const cache = new Map<string, string>();

function lineThumb(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, key: string, w = 180, h = 220): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.clearRect(0, 0, w, h);
  draw(ctx, w, h);
  const url = canvas.toDataURL("image/png");
  cache.set(key, url);
  return url;
}

export function thumbFor(kind: VariantPart, id: string, text = ""): string {
  const imported = importedMeta(id);
  if (imported?.thumb) return imported.thumb;
  if (kind === "bottle") return bottleThumb(id);
  if (kind === "cap") return capThumb(id);
  if (kind === "label") return logoThumb(id, text);
  if (kind === "pump") return pumpThumb(id);
  if (kind === "collar") return collarThumb(id);
  return boxThumb(id);
}

function strokePath(ctx: CanvasRenderingContext2D, pts: Array<{ x: number; y: number }>, w: number, h: number) {
  if (!pts.length) return;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, -p.x, p.x);
    maxX = Math.max(maxX, -p.x, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min((w - 28) / spanX, (h - 28) / spanY);
  const cx = w / 2;
  const base = h - 16 - (0 - minY) * scale;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = cx + p.x * scale;
    const y = base - p.y * scale;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    ctx.lineTo(cx - p.x * scale, base - p.y * scale);
  }
  ctx.closePath();
}

function bottleThumb(id: string): string {
  return lineThumb((ctx, w, h) => {
    const spec = bottleById(id);
    const pts = bottleOutline(spec.heightMm, spec.widthMm, spec.profile, spec.shoulder, neckRadius(spec.neck), 28, spec.finishMm);
    strokePath(ctx, pts, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "rgba(240, 232, 216, 0.16)");
    grad.addColorStop(1, "rgba(212, 180, 138, 0.05)");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "#d4b48a";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }, `bottle:${id}`);
}

function capThumb(id: string): string {
  return lineThumb((ctx, w, h) => {
    const spec = capById(id);
    const steps = 24;
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push({ x: capRadius(t, spec.profile, spec.widthMm / 2), y: t * spec.heightMm });
    }
    strokePath(ctx, pts, w, h);
    ctx.fillStyle = "rgba(212, 180, 138, 0.1)";
    ctx.fill();
    ctx.strokeStyle = "#e6d3b0";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }, `cap:${id}`);
}

function logoThumb(id: string, text: string): string {
  const key = `logo:${id}:${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const spec = logoById(id);
  const canvas = drawLogo(spec, text || "Nº", "#e7d3ae", 256);
  const url = canvas.toDataURL("image/png");
  cache.set(key, url);
  return url;
}

function pumpThumb(id: string): string {
  return lineThumb((ctx, w, h) => {
    const spec = pumpById(id);
    ctx.strokeStyle = "#d4b48a";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.translate(w / 2, h * 0.65); // adjust Y to center better

    // Dip tube (long thin line down)
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(-2, 40);
    ctx.moveTo(2, 0);
    ctx.lineTo(2, 40);
    ctx.stroke();

    // Ferrule / collar (base of the pump)
    const ferruleW = 28;
    const ferruleH = 16;
    ctx.strokeRect(-ferruleW / 2, -ferruleH, ferruleW, ferruleH);

    // Stem (the part that goes up and down)
    const stemW = 10;
    const stemH = 8;
    ctx.strokeRect(-stemW / 2, -ferruleH - stemH, stemW, stemH);

    // Actuator
    const baseActuatorW = 26;
    const rw = (baseActuatorW / 2) * (spec.radiusFactor || 1); 
    const rh = (spec.actuatorHeightMm || 14) * 1.5; // actuator height
    const baseY = -ferruleH - stemH;

    ctx.beginPath();
    if (spec.style === "dome") {
      ctx.moveTo(-rw, baseY);
      ctx.lineTo(-rw, baseY - rh * 0.5);
      ctx.bezierCurveTo(-rw, baseY - rh * 1.2, rw, baseY - rh * 1.2, rw, baseY - rh * 0.5);
      ctx.lineTo(rw, baseY);
    } else if (spec.style === "shroud") {
      // Shroud covers the ferrule
      const shroudBottom = 2; // covers ferrule down to bottle neck
      ctx.moveTo(-rw, shroudBottom);
      ctx.lineTo(-rw, baseY - rh);
      ctx.lineTo(rw, baseY - rh);
      ctx.lineTo(rw, shroudBottom);
    } else if (spec.style === "flat") {
      ctx.moveTo(-rw, baseY);
      ctx.lineTo(-rw, baseY - rh);
      ctx.lineTo(rw, baseY - rh);
      ctx.lineTo(rw, baseY);
    } else {
      // standard / crimp / screw / mini / soft
      const rCorner = spec.style === "soft" ? 4 : 2;
      ctx.moveTo(-rw, baseY);
      ctx.lineTo(-rw, baseY - rh + rCorner);
      ctx.quadraticCurveTo(-rw, baseY - rh, -rw + rCorner, baseY - rh);
      ctx.lineTo(rw - rCorner, baseY - rh);
      ctx.quadraticCurveTo(rw, baseY - rh, rw, baseY - rh + rCorner);
      ctx.lineTo(rw, baseY);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(212, 180, 138, 0.05)";
    ctx.fill();
    ctx.stroke();

    // Nozzle
    const nzY = baseY - rh * 0.5;
    const nzL = (spec.nozzleMm || 4) * 1.5;
    ctx.beginPath();
    ctx.moveTo(rw, nzY - 2);
    ctx.lineTo(rw + nzL, nzY - 1);
    ctx.lineTo(rw + nzL, nzY + 1);
    ctx.lineTo(rw, nzY + 2);
    ctx.stroke();

    ctx.globalAlpha = id.length ? 1 : 1;
  }, `pump:${id}`);
}

function collarThumb(id: string): string {
  return lineThumb((ctx, w, h) => {
    ctx.strokeStyle = "#d4b48a";
    ctx.lineWidth = 1.6;
    ctx.strokeRect(w * 0.28, h * 0.38, w * 0.44, h * 0.22);
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.38, w * 0.22, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = clamp(id.length, 0, 99);
  }, `collar:${id}`);
}

function boxThumb(id: string): string {
  return lineThumb((ctx, w, h) => {
    ctx.strokeStyle = "#d4b48a";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(w * 0.22, h * 0.28, w * 0.5, h * 0.46);
    ctx.beginPath();
    ctx.moveTo(w * 0.22, h * 0.28);
    ctx.lineTo(w * 0.34, h * 0.18);
    ctx.lineTo(w * 0.84, h * 0.18);
    ctx.lineTo(w * 0.72, h * 0.28);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.84, h * 0.18);
    ctx.lineTo(w * 0.84, h * 0.64);
    ctx.lineTo(w * 0.72, h * 0.74);
    ctx.stroke();
    void id;
  }, `box:${id}`);
}

export function clearThumbCache(): void {
  cache.clear();
}
