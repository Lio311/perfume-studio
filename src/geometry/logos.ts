import type { LogoFont, LogoFrame, LogoMark, LogoSpec } from "../model/types.ts";

const FONT_FAMILY: Record<LogoFont, string> = {
  cormorant: '"Cormorant Garamond", Georgia, serif',
  cinzel: '"Cinzel", "Times New Roman", serif',
  italiana: '"Italiana", "Times New Roman", serif',
  vibes: '"Great Vibes", cursive',
  heebo: '"Heebo", sans-serif',
};

function inkFont(font: LogoFont, text: string): string {
  return /[\u0590-\u05FF]/.test(text) ? FONT_FAMILY.heebo : FONT_FAMILY[font];
}

function letters(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean || "Nº";
}

function initial(text: string): string {
  const clean = letters(text);
  const parts = clean.split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 1).toUpperCase();
}

function drawFrame(ctx: CanvasRenderingContext2D, frame: LogoFrame, s: number, ink: string) {
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1, s * 0.012);
  const m = s * 0.1;
  if (frame === "hairline" || frame === "double") {
    ctx.strokeRect(m, m, s - m * 2, s - m * 2);
  }
  if (frame === "double") {
    ctx.strokeRect(m + s * 0.035, m + s * 0.035, s - (m + s * 0.035) * 2, s - (m + s * 0.035) * 2);
  }
  if (frame === "circle") {
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (frame === "corners") {
    const len = s * 0.14;
    const p = s * 0.12;
    const corners = [
      [p, p, 1, 1],
      [s - p, p, -1, 1],
      [p, s - p, 1, -1],
      [s - p, s - p, -1, -1],
    ] as const;
    for (const [x, y, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x, y + dy * len);
      ctx.lineTo(x, y);
      ctx.lineTo(x + dx * len, y);
      ctx.stroke();
    }
  }
  if (frame === "laurel") {
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.38, Math.PI * 0.72, Math.PI * 1.28);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.38, -Math.PI * 0.28, Math.PI * 0.28);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMark(ctx: CanvasRenderingContext2D, mark: LogoMark, font: LogoFont, text: string, s: number, ink: string) {
  ctx.save();
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = /[\u0590-\u05FF]/.test(text) ? "rtl" : "ltr";
  const family = inkFont(font, text);
  const label = letters(text);

  if (mark === "monogram" || mark === "numeral") {
    ctx.font = `500 ${s * (mark === "numeral" ? 0.34 : 0.42)}px ${family}`;
    ctx.fillText(mark === "numeral" ? label : initial(label), s / 2, s / 2 + s * 0.02);
  } else if (mark === "double") {
    ctx.font = `500 ${s * 0.28}px ${family}`;
    ctx.fillText(initial(label).slice(0, 2), s / 2, s / 2);
  } else if (mark === "word" || mark === "horizon") {
    ctx.font = `500 ${s * 0.16}px ${family}`;
    ctx.fillText(label, s / 2, s * 0.56);
    if (mark === "horizon") {
      ctx.lineWidth = Math.max(1, s * 0.01);
      ctx.beginPath();
      ctx.moveTo(s * 0.22, s * 0.68);
      ctx.lineTo(s * 0.78, s * 0.68);
      ctx.stroke();
    }
  } else if (mark === "vertical") {
    ctx.font = `500 ${s * 0.09}px ${family}`;
    const chars = label.slice(0, 10).split("");
    chars.forEach((ch, i) => ctx.fillText(ch, s / 2, s * 0.22 + i * s * 0.07));
  } else if (mark === "stacked") {
    const parts = label.split(" ");
    ctx.font = `500 ${s * 0.13}px ${family}`;
    const rows = parts.length > 1 ? parts.slice(0, 3) : [label];
    rows.forEach((row, i) => ctx.fillText(row, s / 2, s * 0.4 + i * s * 0.16));
  } else if (mark === "seal") {
    ctx.lineWidth = Math.max(1, s * 0.015);
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `500 ${s * 0.11}px ${family}`;
    ctx.fillText(label.slice(0, 14), s / 2, s / 2);
  } else if (mark === "droplet") {
    ctx.beginPath();
    ctx.moveTo(s / 2, s * 0.22);
    ctx.bezierCurveTo(s * 0.78, s * 0.48, s * 0.7, s * 0.78, s / 2, s * 0.8);
    ctx.bezierCurveTo(s * 0.3, s * 0.78, s * 0.22, s * 0.48, s / 2, s * 0.22);
    ctx.stroke();
    ctx.font = `500 ${s * 0.1}px ${family}`;
    ctx.fillText(initial(label), s / 2, s * 0.58);
  } else if (mark === "diamond") {
    ctx.lineWidth = Math.max(1, s * 0.012);
    ctx.beginPath();
    ctx.moveTo(s / 2, s * 0.18);
    ctx.lineTo(s * 0.8, s / 2);
    ctx.lineTo(s / 2, s * 0.82);
    ctx.lineTo(s * 0.2, s / 2);
    ctx.closePath();
    ctx.stroke();
    ctx.font = `500 ${s * 0.12}px ${family}`;
    ctx.fillText(initial(label), s / 2, s / 2);
  } else if (mark === "sun") {
    ctx.lineWidth = Math.max(1, s * 0.01);
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.16, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(s / 2 + Math.cos(a) * s * 0.22, s / 2 + Math.sin(a) * s * 0.22);
      ctx.lineTo(s / 2 + Math.cos(a) * s * 0.36, s / 2 + Math.sin(a) * s * 0.36);
      ctx.stroke();
    }
  } else if (mark === "wave") {
    ctx.lineWidth = Math.max(1, s * 0.012);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const y = s * (0.4 + i * 0.1);
      ctx.moveTo(s * 0.18, y);
      ctx.bezierCurveTo(s * 0.35, y - s * 0.06, s * 0.45, y + s * 0.06, s * 0.62, y);
      ctx.bezierCurveTo(s * 0.72, y - s * 0.04, s * 0.78, y + s * 0.02, s * 0.84, y);
      ctx.stroke();
    }
  } else if (mark === "crest") {
    ctx.lineWidth = Math.max(1, s * 0.012);
    ctx.beginPath();
    ctx.moveTo(s * 0.28, s * 0.24);
    ctx.lineTo(s * 0.72, s * 0.24);
    ctx.lineTo(s * 0.72, s * 0.58);
    ctx.quadraticCurveTo(s / 2, s * 0.86, s * 0.28, s * 0.58);
    ctx.closePath();
    ctx.stroke();
    ctx.font = `500 ${s * 0.12}px ${family}`;
    ctx.fillText(initial(label), s / 2, s * 0.48);
  } else if (mark === "star") {
    ctx.lineWidth = Math.max(1, s * 0.012);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? s * 0.32 : s * 0.14;
      const x = s / 2 + Math.cos(a) * r;
      const y = s / 2 + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  } else if (mark === "deco") {
    ctx.lineWidth = Math.max(1, s * 0.01);
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(s / 2, s * 0.72, s * (0.08 + i * 0.045), Math.PI, 0);
      ctx.stroke();
    }
  } else if (mark === "laurel") {
    ctx.lineWidth = Math.max(1, s * 0.01);
    ctx.beginPath();
    ctx.arc(s * 0.42, s / 2, s * 0.28, Math.PI * 0.65, Math.PI * 1.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s * 0.58, s / 2, s * 0.28, -Math.PI * 0.35, Math.PI * 0.35);
    ctx.stroke();
    ctx.font = `500 ${s * 0.1}px ${family}`;
    ctx.fillText(label.slice(0, 12), s / 2, s / 2);
  } else if (mark === "dots") {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = s * (0.12 + (i % 3) * 0.08);
      ctx.beginPath();
      ctx.arc(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r * 0.8, s * 0.012, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (mark === "chevron") {
    ctx.lineWidth = Math.max(1, s * 0.012);
    ctx.beginPath();
    ctx.moveTo(s * 0.28, s * 0.62);
    ctx.lineTo(s / 2, s * 0.38);
    ctx.lineTo(s * 0.72, s * 0.62);
    ctx.stroke();
    ctx.font = `500 ${s * 0.1}px ${family}`;
    ctx.fillText(label.slice(0, 14), s / 2, s * 0.74);
  } else if (mark === "oval") {
    ctx.lineWidth = Math.max(1, s * 0.012);
    ctx.beginPath();
    ctx.ellipse(s / 2, s / 2, s * 0.28, s * 0.36, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `500 ${s * 0.1}px ${family}`;
    ctx.fillText(initial(label), s / 2, s / 2);
  } else if (mark === "bars") {
    ctx.lineWidth = Math.max(1, s * 0.01);
    for (let i = 0; i < 5; i++) {
      const y = s * (0.32 + i * 0.09);
      ctx.beginPath();
      ctx.moveTo(s * 0.28, y);
      ctx.lineTo(s * (0.55 + (i % 2) * 0.18), y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function plateColor(ink: string): string {
  const body = ink.trim().replace("#", "");
  const n = Number.parseInt(body.length >= 6 ? body.slice(0, 6) : "ffffff", 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r + g + b) / 3 > 170 ? "#171411" : "#f4efe6";
}

function fitWord(ctx: CanvasRenderingContext2D, word: string, family: string, maxPx: number, maxWidth: number): number {
  let px = Math.max(18, Math.floor(maxPx));
  ctx.font = `600 ${px}px ${family}`;
  while (px > 16 && ctx.measureText(word).width > maxWidth) {
    px -= 2;
    ctx.font = `600 ${px}px ${family}`;
  }
  return px;
}

export function drawLogo(spec: Pick<LogoSpec, "mark" | "font" | "frame">, text: string, ink: string, size: number, height?: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const w = Math.max(32, Math.round(size));
  const h = Math.max(32, Math.round(height ?? size));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const plate = plateColor(ink);
  const word = letters(text).slice(0, 12);
  const family = inkFont(spec.font, text);
  ctx.fillStyle = plate;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = /[\u0590-\u05FF]/.test(word) ? "rtl" : "ltr";

  // A wide plaque must keep the word's own aspect. A square texture stretched
  // across that plaque turned the letters into a black smear.
  if (w > h * 1.35) {
    const inset = Math.max(3, h * 0.1);
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = Math.max(2, h * 0.035);
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
    ctx.globalAlpha = 1;
    fitWord(ctx, word, family, h * 0.62, w - inset * 4);
    ctx.fillText(word, w / 2, h / 2);
    return canvas;
  }

  drawFrame(ctx, spec.frame, w, ink);
  drawMark(ctx, spec.mark, spec.font, text, w, ink);
  ctx.fillStyle = plate;
  ctx.fillRect(0, h * 0.62, w, h * 0.38);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = /[\u0590-\u05FF]/.test(word) ? "rtl" : "ltr";
  fitWord(ctx, word, family, h * (word.length > 6 ? 0.16 : 0.22), w * 0.84);
  ctx.fillText(word, w / 2, h * 0.8);
  return canvas;
}

export function logoTexture(spec: LogoSpec, text: string, ink: string, size = 512, height?: number): HTMLCanvasElement {
  return drawLogo(spec, text, ink, size, height);
}
