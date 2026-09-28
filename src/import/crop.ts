import type { NormRect } from "./parseCatalog.ts";

export function cropPage(image: string, crop: NormRect): Promise<{ thumb: string; color: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const sx = clamp(crop.x, 0, 1) * img.width;
      const sy = clamp(crop.y, 0, 1) * img.height;
      const sw = Math.max(2, clamp(crop.w, 0.02, 1) * img.width);
      const sh = Math.max(2, clamp(crop.h, 0.02, 1) * img.height);
      const canvas = document.createElement("canvas");
      canvas.width = 180;
      canvas.height = 180;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({ thumb: "", color: "#c4a15a" });
        return;
      }
      ctx.fillStyle = "#14161c";
      ctx.fillRect(0, 0, 180, 180);
      ctx.drawImage(img, sx, sy, sw, sh, 8, 8, 164, 164);
      const sample = document.createElement("canvas");
      sample.width = 24;
      sample.height = 24;
      const sampleCtx = sample.getContext("2d");
      sampleCtx?.drawImage(img, sx, sy, sw, sh, 0, 0, 24, 24);
      const pixels = sampleCtx?.getImageData(0, 0, 24, 24).data;
      resolve({ thumb: canvas.toDataURL("image/jpeg", 0.74), color: pixels ? dominantColor(pixels) : "#c4a15a" });
    };
    img.onerror = () => resolve({ thumb: "", color: "#c4a15a" });
    img.src = image;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Prefer the largest chromatic patch so paper and ink do not wash out a swatch. */
export function dominantColor(data: Uint8ClampedArray): string {
  const bins = new Map<number, { r: number; g: number; b: number; n: number; sat: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const max = Math.max(r, g, b);
    const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
    if (lum > 236) continue;
    const sat = (max - Math.min(r, g, b)) / Math.max(1, max);
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bin = bins.get(key) ?? { r: 0, g: 0, b: 0, n: 0, sat: 0 };
    bin.r += r;
    bin.g += g;
    bin.b += b;
    bin.n += 1;
    bin.sat += sat;
    bins.set(key, bin);
  }
  let best: { score: number; r: number; g: number; b: number } | null = null;
  for (const bin of bins.values()) {
    const score = bin.n * (0.12 + bin.sat / bin.n);
    if (!best || score > best.score) best = { score, r: bin.r / bin.n, g: bin.g / bin.n, b: bin.b / bin.n };
  }
  if (!best) return "#c4a15a";
  const hex = (channel: number) => Math.round(channel).toString(16).padStart(2, "0");
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}
