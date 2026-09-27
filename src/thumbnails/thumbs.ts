import { bottleById, capById, logoById } from "../model/catalog.ts";
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
    const pts = bottleOutline(spec.heightMm, spec.widthMm, spec.profile, spec.shoulder, neckRadius(spec.neck));
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
    ctx.strokeStyle = "#d4b48a";
    ctx.lineWidth = 1.5;
    ctx.translate(w / 2, h * 0.72);
    ctx.strokeRect(-6, -70, 12, 54);
    ctx.beginPath();
    ctx.arc(0, -78, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(16, -78);
    ctx.lineTo(34, -86);
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
