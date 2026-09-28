import type { LogoFont, LogoFrame, LogoMark, LogoSpec } from "../model/types.ts";

const TYPEFACE: Record<LogoFont, string> = {
  cormorant: "Cormorant Garamond",
  cinzel: "Cinzel",
  italiana: "Italiana",
  vibes: "Great Vibes",
  heebo: "Heebo",
};

const FONT_FAMILY: Record<LogoFont, string> = {
  cormorant: '"Cormorant Garamond", Georgia, serif',
  cinzel: '"Cinzel", "Times New Roman", serif',
  italiana: '"Italiana", "Times New Roman", serif',
  vibes: '"Great Vibes", cursive',
  heebo: '"Heebo", sans-serif',
};

function inkFont(font: LogoFont, text: string): string {
  return labelFontFamily(font, text);
}

/** Hebrew anywhere in the string sets the paragraph to rtl, so English and digits stay one embedded run. */
export function labelDirection(text: string): "rtl" | "ltr" {
  return /[\u0590-\u05FF]/.test(text) ? "rtl" : "ltr";
}

/** Display faces have no Hebrew glyphs. Any Hebrew run uses Heebo, which also covers Latin and digits. */
export function labelTypeface(font: LogoFont, text: string): string {
  return labelDirection(text) === "rtl" ? "Heebo" : TYPEFACE[font];
}

export function labelFontFamily(font: LogoFont, text: string): string {
  return labelDirection(text) === "rtl" ? FONT_FAMILY.heebo : FONT_FAMILY[font];
}

function channelLin(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const body = hex.trim().replace("#", "");
  const n = Number.parseInt(body.length >= 6 ? body.slice(0, 6) : "000000", 16);
  if (!Number.isFinite(n)) return 0;
  const r = channelLin(((n >> 16) & 255) / 255);
  const g = channelLin(((n >> 8) & 255) / 255);
  const b = channelLin((n & 255) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Opaque ground so the word stays readable on clear, tinted, and dark glass. */
export function contrastingPlate(ink: string): string {
  return relativeLuminance(ink) > 0.42 ? "#16130f" : "#f7f2e8";
}

export interface LabelLineLayout {
  lines: string[];
  px: number;
  direction: "rtl" | "ltr";
  text: string;
}

/** Pick 1–3 lines and the largest size that fits the plate. The strings stay in logical order. */
export function layoutLabelLines(
  text: string,
  maxWidth: number,
  maxHeight: number,
  measure: (line: string, px: number) => number,
): LabelLineLayout {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 32) || "Nº";
  const direction = labelDirection(clean);
  const words = clean.split(" ").filter(Boolean);
  const lineSets: string[][] = [[clean]];
  if (words.length >= 2) {
    let bestScore = Infinity;
    let best: string[] | null = null;
    for (let i = 1; i < words.length; i += 1) {
      const left = words.slice(0, i).join(" ");
      const right = words.slice(i).join(" ");
      const score = Math.abs([...left].length - [...right].length);
      if (score < bestScore) {
        bestScore = score;
        best = [left, right];
      }
    }
    if (best) lineSets.push(best);
  }
  if (words.length >= 3) {
    const third = Math.max(1, Math.round(words.length / 3));
    const twoThird = Math.max(third + 1, Math.round((2 * words.length) / 3));
    if (twoThird < words.length) {
      lineSets.push([
        words.slice(0, third).join(" "),
        words.slice(third, twoThird).join(" "),
        words.slice(twoThird).join(" "),
      ]);
    }
  }
  let chosen = { lines: [clean], px: 18 };
  for (const lines of lineSets) {
    let px = Math.max(18, Math.floor(maxHeight / (lines.length * 1.16)));
    while (px > 18 && lines.some((line) => measure(line, px) > maxWidth)) px -= 2;
    if (px > chosen.px) chosen = { lines, px };
  }
  return { ...chosen, direction, text: clean };
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
    const textToDraw = mark === "numeral" ? label : initial(label);
    if (mark === "numeral") fitWord(ctx, textToDraw, family, s * 0.34, s * 0.75, "500");
    else ctx.font = `500 ${s * 0.42}px ${family}`;
    ctx.fillText(textToDraw, s / 2, s / 2 + s * 0.02, s * 0.8);
  } else if (mark === "double") {
    ctx.font = `500 ${s * 0.28}px ${family}`;
    ctx.fillText(initial(label).slice(0, 2), s / 2, s / 2, s * 0.8);
  } else if (mark === "word" || mark === "horizon") {
    fitWord(ctx, label, family, s * 0.16, s * 0.85, "500");
    ctx.fillText(label, s / 2, s * 0.56, s * 0.85);
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
    chars.forEach((ch, i) => ctx.fillText(ch, s / 2, s * 0.22 + i * s * 0.07, s * 0.8));
  } else if (mark === "stacked") {
    const parts = label.split(" ");
    const rows = parts.length > 1 ? parts.slice(0, 3) : [label];
    rows.forEach((row, i) => {
      fitWord(ctx, row, family, s * 0.13, s * 0.85, "500");
      ctx.fillText(row, s / 2, s * 0.4 + i * s * 0.16, s * 0.85);
    });
  } else if (mark === "seal") {
    ctx.lineWidth = Math.max(1, s * 0.015);
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.34, 0, Math.PI * 2);
    ctx.stroke();
    fitWord(ctx, label.slice(0, 14), family, s * 0.11, s * 0.55, "500");
    ctx.fillText(label.slice(0, 14), s / 2, s / 2, s * 0.6);
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
    fitWord(ctx, label.slice(0, 12), family, s * 0.1, s * 0.65, "500");
    ctx.fillText(label.slice(0, 12), s / 2, s / 2, s * 0.7);
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
    fitWord(ctx, label.slice(0, 14), family, s * 0.1, s * 0.8, "500");
    ctx.fillText(label.slice(0, 14), s / 2, s * 0.74, s * 0.85);
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

function fitWord(ctx: CanvasRenderingContext2D, word: string, family: string, maxPx: number, maxWidth: number, weight = "600"): number {
  let px = Math.max(18, Math.floor(maxPx));
  ctx.font = `${weight} ${px}px ${family}`;
  while (px > 16 && ctx.measureText(word).width > maxWidth) {
    px -= 2;
    ctx.font = `${weight} ${px}px ${family}`;
  }
  return px;
}

const TYPE_MARKS = new Set<LogoSpec["mark"]>(["word", "horizon", "stacked", "vertical", "numeral"]);

export function paintLabel(
  ctx: CanvasRenderingContext2D,
  spec: Pick<LogoSpec, "mark" | "font" | "frame">,
  text: string,
  ink: string,
  w: number,
  h: number,
): LabelLineLayout {
  const family = labelFontFamily(spec.font, text);
  const typeMark = TYPE_MARKS.has(spec.mark) || h < w * 0.62;
  const direction = labelDirection(text);
  const canvasEl = ctx.canvas as HTMLCanvasElement | undefined;
  if (canvasEl?.setAttribute) canvasEl.setAttribute("dir", direction);
  ctx.save();
  ctx.direction = direction;
  ctx.fillStyle = contrastingPlate(ink);
  ctx.fillRect(0, 0, w, h);

  const textShare = typeMark ? 0.78 : 0.58;
  const textHeight = h * textShare;
  const textTop = h - h * 0.06 - textHeight;
  if (!typeMark) {
    const markBox = Math.min(w * 0.62, Math.max(8, textTop * 0.9));
    ctx.save();
    ctx.translate((w - markBox) / 2, Math.max(h * 0.045, (textTop - markBox) / 2));
    drawFrame(ctx, spec.frame, markBox, ink);
    drawMark(ctx, spec.mark, spec.font, text, markBox, ink);
    ctx.restore();
  } else if (spec.frame !== "none") {
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1.5, Math.min(w, h) * 0.012);
    const m = Math.min(w, h) * 0.055;
    ctx.strokeRect(m, m, w - m * 2, h - m * 2);
  }

  const layout = layoutLabelLines(text, Math.max(8, w * 0.86), textHeight, (line, px) => {
    ctx.font = `600 ${px}px ${family}`;
    return ctx.measureText(line).width;
  });
  ctx.direction = layout.direction;
  ctx.font = `600 ${layout.px}px ${family}`;
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const leading = layout.px * 1.16;
  const block = layout.lines.length * leading;
  let y = textTop + (textHeight - block) / 2 + leading * 0.5;
  for (const line of layout.lines) {
    ctx.direction = layout.direction;
    ctx.fillText(line, w / 2, y);
    y += leading;
  }
  if (spec.mark === "horizon") {
    ctx.lineWidth = Math.max(1.5, h * 0.012);
    ctx.beginPath();
    ctx.moveTo(w * 0.18, Math.min(h - h * 0.08, y));
    ctx.lineTo(w * 0.82, Math.min(h - h * 0.08, y));
    ctx.stroke();
  }
  ctx.restore();
  return layout;
}

export function drawLogo(spec: Pick<LogoSpec, "mark" | "font" | "frame">, text: string, ink: string, size: number, height?: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const w = Math.max(32, Math.round(size));
  const h = Math.max(32, Math.round(height ?? size));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  paintLabel(ctx, spec, text, ink, w, h);
  return canvas;
}

export function logoTexture(spec: LogoSpec, text: string, ink: string, size = 512, height?: number): HTMLCanvasElement {
  return drawLogo(spec, text, ink, size, height);
}
