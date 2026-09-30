import type { LogoApplication, LogoFont, LogoFrame, LogoMark, LogoSpec } from "../model/types.ts";

const TYPEFACE: Record<LogoFont, string> = {
  cormorant: "Cormorant Garamond",
  cinzel: "Cinzel",
  italiana: "Italiana",
  vibes: "Great Vibes",
  heebo: "Heebo",
};

const FONT_FAMILY: Record<LogoFont, string> = {
  cormorant: '"Cormorant Garamond", "Heebo", Georgia, serif',
  cinzel: '"Cinzel", "Heebo", "Times New Roman", serif',
  italiana: '"Italiana", "Heebo", "Times New Roman", serif',
  vibes: '"Great Vibes", "Heebo", Georgia, serif',
  heebo: '"Heebo", sans-serif',
};

function inkFont(font: LogoFont, text: string): string {
  return labelFontFamily(font, text);
}

/** First strong directional letter (Unicode bidi). Neutrals such as digits and punctuation are skipped. */
export function labelDirection(text: string): "rtl" | "ltr" {
  for (const char of text) {
    if (!/\p{L}/u.test(char)) continue;
    if (/\p{Script=Hebrew}|\p{Script=Arabic}|\p{Script=Thaana}/u.test(char)) return "rtl";
    return "ltr";
  }
  return "ltr";
}

/** Grapheme clusters, so a joiner sequence or Hebrew niqqud counts as one character. */
function labelGraphemes(text: string): string[] {
  const Segmenter = Intl.Segmenter;
  if (typeof Segmenter !== "function") return Array.from(text);
  return [...new Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((part) => part.segment);
}

/** Cap stored brand text by grapheme so an emoji sequence or niqqud is not split. */
export function clampLabelText(text: string, max = 32): string {
  return labelGraphemes(text).slice(0, max).join("");
}

/**
 * Italiana and Great Vibes ship only at 400. Cormorant, Cinzel, and Heebo (including a Hebrew paragraph) are 500.
 */
export function labelFontWeight(font: LogoFont, text: string): 400 | 500 {
  if (labelDirection(text) === "rtl") return 500;
  if (font === "italiana" || font === "vibes") return 400;
  return 500;
}

export function labelFontSpec(font: LogoFont, text: string): string {
  return `${labelFontWeight(font, text)} 96px "${labelTypeface(font, text)}"`;
}

/** Repaint the plate only when a load brought in a face that was not already available. */
export function shouldRepaintLabel(alreadyLoaded: boolean): boolean {
  return !alreadyLoaded;
}

/** Raised mark when the caller has no substrate colour yet. */
export const EMBOSS_SUBSTRATE = "#cfc8bc";

/** Linear 0–1 channel to an sRGB byte. */
function linearToSrgbByte(channel: number): number {
  const clamped = Math.min(1, Math.max(0, channel));
  const srgb = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(srgb * 255)));
}

function hexFromLinear(color: { r: number; g: number; b: number }): string {
  const r = linearToSrgbByte(color.r).toString(16).padStart(2, "0");
  const g = linearToSrgbByte(color.g).toString(16).padStart(2, "0");
  const b = linearToSrgbByte(color.b).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

/**
 * Colour of the glyph itself.
 * Print keeps the chosen ink. Foil is that same colour, including black, so a saved tint stays put.
 * Engrave and emboss have no ink of their own and take the substrate.
 */
export function labelInk(color: string, application: LogoApplication = "decal", substrate?: string): string {
  if (application === "foil") return color;
  if (application === "engrave" || application === "emboss") {
    const ground = substrate?.trim();
    if (ground) return ground;
    return EMBOSS_SUBSTRATE;
  }
  return color;
}

/**
 * Ink colour stored designs used before the label colour became the ink.
 * Foil was always cream. Other applications picked a light or dark ink from the plate luminance.
 * The luminance matches that old helper, including its second pass over already-linear channels.
 */
export function legacyLabelInk(application: string, plate: string): string {
  const color = parsedColor(plate);
  const lin = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * lin(color.r) + 0.7152 * lin(color.g) + 0.0722 * lin(color.b);
  if (application === "foil") return "#fff6e4";
  if (application === "emboss") return lum > 0.62 ? "#6d583c" : "#f6f1e6";
  if (application === "engrave") return lum > 0.45 ? "#241c14" : "#0c0b0a";
  return lum > 0.55 ? "#221910" : "#f4eee4";
}

export interface LabelFinish {
  /** Metalness of the ink. The plate stays non-metallic via the ink mask. */
  metalness: number;
  /** Roughness of the ink. The plate stays rough (1) via the same mask. */
  roughness: number;
  /** Bump height of the glyph mask. Positive raises the ink, negative recesses it, zero stays flat. */
  bumpScale: number;
  /** Environment reflection strength. Foil never falls below {@link FOIL_ENV_FLOOR}. */
  envMapIntensity: number;
  /**
   * Emissive strength in the ink colour, masked to the glyphs.
   * Zero leaves print, emboss, and engrave unlit.
   */
  emissive: number;
}

/**
 * Hot foil must not be a black mirror of a dark studio.
 * The face is rough enough to carry the ink colour, and this is the least environment response it keeps.
 */
export const FOIL_ENV_FLOOR = 1.2;
/** Below this WCAG ratio a foil tint disappears into the plate. */
export const FOIL_CONTRAST_FLOOR = 1.6;
/** Linear channel floor for a foil that would otherwise match its plate. A small lift keeps black foil black. */
export const FOIL_METAL_MIN = 0.035;
/** Metalness when the tint is too close to the plate for a mirror to read. */
export const FOIL_LOW_METALNESS = 0.3;

/**
 * Finish of the ink region.
 * Print is flat ink on a plate. Foil is bright metal with a tight highlight.
 * Emboss is raised in the substrate colour. Engrave is a frosted recess.
 * The colour canvas carries the difference; these uniforms keep the light honest.
 */
export function labelFinish(application: LogoApplication = "decal"): LabelFinish {
  switch (application) {
    case "foil":
      return {
        metalness: 0.86,
        roughness: 0.18,
        bumpScale: 0,
        envMapIntensity: 2.8,
        emissive: 1.05,
      };
    case "emboss":
      return { metalness: 0.02, roughness: 0.42, bumpScale: 16, envMapIntensity: 0.35, emissive: 0 };
    case "engrave":
      return { metalness: 0, roughness: 0.94, bumpScale: -14, envMapIntensity: 0.15, emissive: 0 };
    default:
      return { metalness: 0, roughness: 1, bumpScale: 0, envMapIntensity: 1, emissive: 0 };
  }
}

/** Emissive colour for a finish. Foil glows in the ink; every other application stays black. */
export function labelEmissive(ink: string, application: LogoApplication = "decal"): string {
  return labelFinish(application).emissive > 0 ? ink : "#000000";
}

/**
 * Foil keeps its chosen colour, except when that colour is too close to the plate.
 * The metal is then lifted to {@link FOIL_METAL_MIN} so black on black still reads.
 */
export function foilDisplayInk(ink: string, substrate?: string): string {
  const ground = substrate?.trim();
  if (!ground || contrastRatio(ink, ground) >= FOIL_CONTRAST_FLOOR) return ink;
  const parsed = parsedColor(ink);
  return hexFromLinear({
    r: Math.max(parsed.r, FOIL_METAL_MIN),
    g: Math.max(parsed.g, FOIL_METAL_MIN),
    b: Math.max(parsed.b, FOIL_METAL_MIN),
  });
}

export interface FoilRelief {
  ink: string;
  substrate: string;
}

/** 0 on the contrasting plate, 1 on solid ink. Edges in between stay partial so anti-aliasing survives. */
export function inkCoverage(plate: readonly [number, number, number], rgb: readonly [number, number, number]): number {
  const dist = Math.hypot(rgb[0] - plate[0], rgb[1] - plate[1], rgb[2] - plate[2]);
  return Math.min(1, Math.max(0, (dist - 8) / 36));
}

function plateRgb(ink: string): [number, number, number] {
  const hex = contrastingPlate(ink);
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function blurCoverage(coverage: Float32Array, width: number, height: number, radius: number): Float32Array {
  const horizontal = new Float32Array(coverage.length);
  const vertical = new Float32Array(coverage.length);
  const denom = radius * 2 + 1;
  const clamp = (value: number, max: number) => (value < 0 ? 0 : value > max ? max : value);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += coverage[row + clamp(k, width - 1)];
    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = sum / denom;
      sum -= coverage[row + clamp(x - radius, width - 1)];
      sum += coverage[row + clamp(x + radius + 1, width - 1)];
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += horizontal[clamp(k, height - 1) * width + x];
    for (let y = 0; y < height; y += 1) {
      vertical[y * width + x] = sum / denom;
      sum -= horizontal[clamp(y - radius, height - 1) * width + x];
      sum += horizontal[clamp(y + radius + 1, height - 1) * width + x];
    }
  }
  return vertical;
}

/**
 * 1 on the glyph, 0 on the ground.
 * Print reads an opaque plate by colour. Every other application is transparent outside the strokes, so alpha is the mask.
 */
function glyphCoverage(
  source: Uint8ClampedArray,
  index: number,
  ink: string,
  application: LogoApplication,
): number {
  const alpha = source[index + 3] / 255;
  if (alpha === 0) return 0;
  if (application === "decal") return inkCoverage(plateRgb(ink), [source[index], source[index + 1], source[index + 2]]);
  return alpha;
}

/**
 * Packs the ink mask into one canvas for a lit finish.
 * R is glyph height (bump), G is roughness, B is the metalness mask.
 * Plate pixels stay rough and non-metallic so the ground stays readable.
 */
export function paintLabelSurface(
  source: Uint8ClampedArray,
  ink: string,
  application: LogoApplication,
  target: Uint8ClampedArray,
  width = 0,
  height = 0,
): void {
  const finish = labelFinish(application);
  const count = Math.floor(source.length / 4);
  const coverage = new Float32Array(count);
  for (let pixel = 0; pixel < count; pixel += 1) {
    const index = pixel * 4;
    // Letterboxed margins are transparent. Their RGB is empty, so coverage must stay 0 or the plate reads as ink.
    coverage[pixel] = glyphCoverage(source, index, ink, application);
  }
  const bevel = finish.bumpScale !== 0 && width >= 8 && height >= 8 && width * height === count;
  const radius = bevel ? Math.min(18, Math.max(1, Math.round(Math.min(width, height) * 0.018))) : 0;
  const heightMap = radius > 0 ? blurCoverage(coverage, width, height, radius) : coverage;
  const inkRough = Math.round(Math.min(1, Math.max(0, finish.roughness)) * 255);
  for (let pixel = 0; pixel < count; pixel += 1) {
    const index = pixel * 4;
    const cover = coverage[pixel];
    target[index] = Math.round(Math.min(1, Math.max(0, heightMap[pixel])) * 255);
    target[index + 1] = Math.round(255 + (inkRough - 255) * cover);
    target[index + 2] = Math.round(cover * 255);
    target[index + 3] = 255;
  }
}

/**
 * White on the ink and black on the plate, so an emissive colour can be multiplied in without lighting the ground.
 * Applications with no emissive stay fully black.
 */
export function paintLabelEmissive(
  source: Uint8ClampedArray,
  ink: string,
  application: LogoApplication,
  target: Uint8ClampedArray,
): void {
  const glow = labelFinish(application).emissive > 0 ? 1 : 0;
  const count = Math.floor(source.length / 4);
  for (let pixel = 0; pixel < count; pixel += 1) {
    const index = pixel * 4;
    const cover = glyphCoverage(source, index, ink, application) * glow;
    const value = Math.round(Math.min(1, Math.max(0, cover)) * 255);
    target[index] = value;
    target[index + 1] = value;
    target[index + 2] = value;
    target[index + 3] = 255;
  }
}

/** Emissive mask aligned to the colour canvas. Plate pixels stay black. */
export function labelEmissiveCanvas(source: HTMLCanvasElement, ink: string, application: LogoApplication): HTMLCanvasElement {
  const limit = 1024;
  const scale = Math.min(1, limit / Math.max(source.width, source.height, 1));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const sample = document.createElement("canvas");
  sample.width = width;
  sample.height = height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
  const dst = canvas.getContext("2d");
  if (!sampleCtx || !dst) return canvas;
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.drawImage(source, 0, 0, width, height);
  const image = sampleCtx.getImageData(0, 0, width, height);
  const out = dst.createImageData(width, height);
  paintLabelEmissive(image.data, ink, application, out.data);
  dst.putImageData(out, 0, 0);
  return canvas;
}

/** Mask derived from the painted plate. Same pixels as the colour canvas, so the ink lines up. */
export function labelSurfaceCanvas(source: HTMLCanvasElement, ink: string, application: LogoApplication): HTMLCanvasElement {
  const limit = 1024;
  const scale = Math.min(1, limit / Math.max(source.width, source.height, 1));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const sample = document.createElement("canvas");
  sample.width = width;
  sample.height = height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
  const dst = canvas.getContext("2d");
  if (!sampleCtx || !dst) return canvas;
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.drawImage(source, 0, 0, width, height);
  const image = sampleCtx.getImageData(0, 0, width, height);
  const out = dst.createImageData(width, height);
  paintLabelSurface(image.data, ink, application, out.data, width, height);
  dst.putImageData(out, 0, 0);
  return canvas;
}

function clampIndex(value: number, max: number): number {
  if (value < 0) return 0;
  if (value > max) return max;
  return value;
}

/**
 * Bakes a finish into the colour canvas so the four applications stay apart even under flat light.
 * Print is left as coloured ink on its plate. Foil keeps its hue and gains a white specular lip.
 * Engrave becomes an even frost. Emboss lights a raised bevel.
 */
export function relieveLabelPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  application: LogoApplication,
  foil?: FoilRelief,
): void {
  if (application === "decal" || width < 2 || height < 2) return;
  const src = new Uint8ClampedArray(data);
  const radius = Math.max(2, Math.round(Math.min(width, height) * 0.02));
  const embossField = application === "emboss" ? embossHeightField(src, width, height) : null;
  const sobel = embossSobelRadius(width, height);
  const lowContrast =
    application === "foil" &&
    foil !== undefined &&
    contrastRatio(foil.ink, foil.substrate) < FOIL_CONTRAST_FLOOR;
  const alphaAt = (x: number, y: number) => {
    const cx = clampIndex(x, width - 1);
    const cy = clampIndex(y, height - 1);
    return src[(cy * width + cx) * 4 + 3];
  };
  // A fixed 2px band is a quarter of a thin stroke on the 1024-wide carton canvas. Scale it to the plate.
  const rimBand = Math.max(1, Math.round(Math.min(width, height) * 0.004));
  const onRim = (x: number, y: number) => {
    for (let dy = -rimBand; dy <= rimBand; dy += 1) {
      for (let dx = -rimBand; dx <= rimBand; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        if (alphaAt(x + dx, y + dy) < 128) return true;
      }
    }
    return false;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = src[index + 3];
      if (alpha === 0) continue;
      if (application === "foil") {
        let red = src[index];
        let green = src[index + 1];
        let blue = src[index + 2];
        if (lowContrast) {
          red = liftSrgbByte(red);
          green = liftSrgbByte(green);
          blue = liftSrgbByte(blue);
        }
        if (lowContrast && onRim(x, y)) {
          data[index] = Math.min(128, Math.round(red + (255 - red) * 0.32));
          data[index + 1] = Math.min(128, Math.round(green + (255 - green) * 0.32));
          data[index + 2] = Math.min(128, Math.round(blue + (255 - blue) * 0.32));
        } else if (!lowContrast && alphaAt(x, y - radius) < alpha * 0.45) {
          data[index] = Math.min(255, Math.round(red + (255 - red) * 0.45));
          data[index + 1] = Math.min(255, Math.round(green + (255 - green) * 0.45));
          data[index + 2] = Math.min(255, Math.round(blue + (255 - blue) * 0.45));
        } else {
          data[index] = Math.round(red * 0.94);
          data[index + 1] = Math.round(green * 0.94);
          data[index + 2] = Math.round(blue * 0.94);
        }
        continue;
      }
      if (application === "engrave") {
        // Even frost. A near-black inner rim disappeared into a dark label and bit the letters.
        data[index] = 168;
        data[index + 1] = 178;
        data[index + 2] = 190;
        data[index + 3] = engraveAlpha(alpha);
        continue;
      }
      const slopeX = embossField
        ? embossSample(embossField, width, height, x + sobel, y) - embossSample(embossField, width, height, x - sobel, y)
        : (alphaAt(x + radius, y) - alphaAt(x - radius, y)) / 255;
      const slopeY = embossField
        ? embossSample(embossField, width, height, x, y + sobel) - embossSample(embossField, width, height, x, y - sobel)
        : (alphaAt(x, y + radius) - alphaAt(x, y - radius)) / 255;
      const light = Math.max(-1, Math.min(1, slopeX * 1.15 + slopeY * 1.25));
      if (light >= 0) {
        // Relative lift so an ivory board still catches a highlight. A hard cap at 232 left only the dark edge.
        const gain = light * 0.28;
        data[index] = Math.round(src[index] + (255 - src[index]) * gain);
        data[index + 1] = Math.round(src[index + 1] + (255 - src[index + 1]) * gain);
        data[index + 2] = Math.round(src[index + 2] + (255 - src[index + 2]) * gain);
      } else {
        const scale = Math.max(0.72, 1 + light * 0.28);
        data[index] = Math.max(0, Math.round(src[index] * scale));
        data[index + 1] = Math.max(0, Math.round(src[index + 1] * scale));
        data[index + 2] = Math.max(0, Math.round(src[index + 2] * scale));
      }
    }
  }
}

/** Smooth edge instead of a hard cut at 80, so a solid stroke stays above alphaTest 0.35. */
export function engraveAlpha(alpha: number): number {
  const t = Math.max(0, Math.min(1, alpha / 255));
  const eased = t * t * (3 - 2 * t);
  return Math.round(eased * 255);
}

/** Smallest stroke that still reads. Print may stay a hairline; every other finish keeps about 2px. */
export function hairlineWidth(span: number, ratio: number, application: LogoApplication = "decal"): number {
  const minPx = application === "decal" ? 1 : 2;
  return Math.max(minPx, span * ratio);
}

export function applyLabelRelief(canvas: HTMLCanvasElement, application: LogoApplication, foil?: FoilRelief): void {
  if (application === "decal") return;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || canvas.width < 2 || canvas.height < 2) return;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  relieveLabelPixels(image.data, canvas.width, canvas.height, application, foil);
  ctx.putImageData(image, 0, 0);
}

function liftSrgbByte(byte: number): number {
  return linearToSrgbByte(Math.max(srgbChannelToLinear(byte / 255), FOIL_METAL_MIN));
}

function embossSobelRadius(width: number, height: number): number {
  return Math.min(width, height) >= 64 ? 2 : 1;
}

function embossSample(field: Float32Array, width: number, height: number, x: number, y: number): number {
  return field[clampIndex(y, height - 1) * width + clampIndex(x, width - 1)];
}

/** Glyph alpha blurred by about half a stem, so a thin stroke has a ridge instead of a flat top. */
function embossHeightField(source: Uint8ClampedArray, width: number, height: number): Float32Array {
  const coverage = new Float32Array(width * height);
  for (let pixel = 0; pixel < coverage.length; pixel += 1) coverage[pixel] = source[pixel * 4 + 3] / 255;
  const radius = Math.max(1, Math.round(Math.min(width, height) * 0.04));
  return blurCoverage(coverage, width, height, radius);
}

/** Tangent-space normal from a blurred glyph height. Emboss uses it as lit relief; other applications stay flat. */
export function paintLabelNormal(
  source: Uint8ClampedArray,
  application: LogoApplication,
  target: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const count = Math.floor(source.length / 4);
  for (let pixel = 0; pixel < count; pixel += 1) {
    const index = pixel * 4;
    target[index] = 128;
    target[index + 1] = 128;
    target[index + 2] = 255;
    target[index + 3] = 255;
  }
  if (application !== "emboss" || width < 2 || height < 2 || width * height !== count) return;
  const field = embossHeightField(source, width, height);
  const radius = embossSobelRadius(width, height);
  const strength = 8;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const slopeX = embossSample(field, width, height, x + radius, y) - embossSample(field, width, height, x - radius, y);
      const slopeY = embossSample(field, width, height, x, y - radius) - embossSample(field, width, height, x, y + radius);
      let nx = -slopeX * strength;
      let ny = slopeY * strength;
      let nz = 1;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;
      const index = (y * width + x) * 4;
      target[index] = Math.round((nx * 0.5 + 0.5) * 255);
      target[index + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      target[index + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  }
}

export function labelNormalCanvas(source: HTMLCanvasElement, application: LogoApplication): HTMLCanvasElement {
  const limit = 1024;
  const scale = Math.min(1, limit / Math.max(source.width, source.height, 1));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const sample = document.createElement("canvas");
  sample.width = width;
  sample.height = height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
  const dst = canvas.getContext("2d");
  if (!sampleCtx || !dst) return canvas;
  sampleCtx.drawImage(source, 0, 0, width, height);
  const image = sampleCtx.getImageData(0, 0, width, height);
  const out = dst.createImageData(width, height);
  paintLabelNormal(image.data, application, out.data, width, height);
  dst.putImageData(out, 0, 0);
  return canvas;
}

/** Display faces have no Hebrew glyphs. A right-to-left paragraph uses Heebo, which also covers Latin and digits. */
export function labelTypeface(font: LogoFont, text: string): string {
  return labelDirection(text) === "rtl" ? "Heebo" : TYPEFACE[font];
}

export function labelFontFamily(font: LogoFont, text: string): string {
  return labelDirection(text) === "rtl" ? FONT_FAMILY.heebo : FONT_FAMILY[font];
}

const DARK_PLATE = "#16130f";
const LIGHT_PLATE = "#f7f2e8";
const DEFAULT_INK = "#e6cc98";

/** sRGB byte to the linear channel THREE.Color stores. Matches ColorManagement in three r152+. */
function srgbChannelToLinear(channel: number): number {
  return channel < 0.04045 ? channel * 0.0773993808 : (channel * 0.9478672986 + 0.0521327014) ** 2.4;
}

function linearFromBytes(red: number, green: number, blue: number): { r: number; g: number; b: number } {
  return {
    r: srgbChannelToLinear(red / 255),
    g: srgbChannelToLinear(green / 255),
    b: srgbChannelToLinear(blue / 255),
  };
}

/**
 * Linear channels for a CSS colour, matching THREE.Color.
 * An unknown name keeps the previous ink, or the default gold when nothing came before.
 */
function parsedColor(input: string, previous?: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  const value = input.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(value);
  if (short) {
    const hex = short[1];
    return linearFromBytes(
      Number.parseInt(hex[0] + hex[0], 16),
      Number.parseInt(hex[1] + hex[1], 16),
      Number.parseInt(hex[2] + hex[2], 16),
    );
  }
  const long = /^#([0-9a-f]{6})$/i.exec(value);
  if (long) {
    const hex = Number.parseInt(long[1], 16);
    return linearFromBytes((hex >> 16) & 255, (hex >> 8) & 255, hex & 255);
  }
  const rgb = /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i.exec(value);
  if (rgb) return linearFromBytes(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  const named = value.toLowerCase();
  if (named === "black") return { r: 0, g: 0, b: 0 };
  if (named === "white") return { r: 1, g: 1, b: 1 };
  return previous ?? parsedColor(DEFAULT_INK);
}

function srgbBytes(input: string): [number, number, number] {
  const linear = parsedColor(input);
  return [linearToSrgbByte(linear.r), linearToSrgbByte(linear.g), linearToSrgbByte(linear.b)];
}

/** WCAG relative luminance. Channels are linear, matching THREE.Color. */
export function relativeLuminance(color: string, fallback = DEFAULT_INK): number {
  const previous = fallback === color ? undefined : parsedColor(fallback);
  const parsed = parsedColor(color, previous);
  return 0.2126 * parsed.r + 0.7152 * parsed.g + 0.0722 * parsed.b;
}

export function contrastRatio(ink: string, plate: string): number {
  const a = relativeLuminance(ink);
  const b = relativeLuminance(plate);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Opaque ground with the higher WCAG contrast against the ink. */
export function contrastingPlate(ink: string): string {
  return contrastRatio(ink, DARK_PLATE) >= contrastRatio(ink, LIGHT_PLATE) ? DARK_PLATE : LIGHT_PLATE;
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
  const clean = clampLabelText(text.replace(/\s+/g, " ").trim());
  const direction = labelDirection(clean);
  if (!clean) return { lines: [], px: 0, direction, text: "" };
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
  const widths = new Map<string, number>();
  const widthOf = (line: string, px: number) => {
    const key = `${px}\0${line}`;
    const cached = widths.get(key);
    if (cached !== undefined) return cached;
    const value = measure(line, px);
    widths.set(key, value);
    return value;
  };
  let chosen = { lines: [clean], px: 0 };
  for (const lines of lineSets) {
    const px = fitFontSize(lines, maxWidth, Math.max(8, Math.floor(maxHeight / (lines.length * 1.16))), widthOf);
    if (px > chosen.px) chosen = { lines, px };
  }
  return { ...chosen, direction, text: clean };
}

/** Horizontal inset so the brand line fills the carton face without touching the mesh edge. */
const CARTON_PAD_X = 0.04;
/** Vertical inset matching the line box the painter uses. */
const CARTON_PAD_Y = 0.06;
export const CARTON_MARK_MAX_W = 52;
export const CARTON_MARK_MAX_H = 18;

/**
 * Width/height of the brand line, including the painter's padding.
 * A long Latin word stays wide; the carton mesh uses this instead of the bottle plate.
 */
export function cartonTextAspect(text: string, measure: (line: string, px: number) => number): number {
  const clean = clampLabelText(text.replace(/\s+/g, " ").trim());
  if (!clean) return 3;
  const px = 100;
  const width = Math.max(1, measure(clean, px));
  const lineHeight = px * 1.16;
  const contentW = 1 - CARTON_PAD_X * 2;
  const contentH = 1 - CARTON_PAD_Y * 2;
  return (width / contentW) / (lineHeight / contentH);
}

/** Fit the line to the 52 mm carton budget, then the 18 mm height, without stretching it. */
export function cartonMarkSize(faceWidth: number, aspect: number): { width: number; height: number } {
  const maxW = Math.min(CARTON_MARK_MAX_W, Math.max(8, faceWidth) * 0.92);
  const safe = Number.isFinite(aspect) && aspect > 0.15 ? aspect : 3;
  let width = maxW;
  let height = width / safe;
  if (height > CARTON_MARK_MAX_H) {
    height = CARTON_MARK_MAX_H;
    width = Math.min(maxW, height * safe);
  }
  return { width, height };
}

function fitFontSize(
  lines: string[],
  maxWidth: number,
  maxPx: number,
  widthOf: (line: string, px: number) => number,
): number {
  const fits = (px: number) => lines.every((line) => widthOf(line, px) <= maxWidth);
  let lo = 8;
  let hi = Math.max(lo, Math.floor(maxPx));
  if (!fits(lo)) return lo;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function letters(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function initial(text: string): string {
  const clean = letters(text);
  if (!clean) return "";
  const parts = clean.split(" ").filter(Boolean);
  if (parts.length >= 2) return (Array.from(parts[0])[0] + Array.from(parts[1])[0]).toUpperCase();
  return Array.from(clean)[0]?.toUpperCase() ?? "";
}

function drawFrame(ctx: CanvasRenderingContext2D, frame: LogoFrame, s: number, ink: string, minStroke = 1) {
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(minStroke, s * 0.012);
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

function drawMark(ctx: CanvasRenderingContext2D, mark: LogoMark, font: LogoFont, text: string, s: number, ink: string, minStroke = 1) {
  ctx.save();
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = labelDirection(text);
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
      ctx.lineWidth = Math.max(minStroke, s * 0.01);
      ctx.beginPath();
      ctx.moveTo(s * 0.22, s * 0.68);
      ctx.lineTo(s * 0.78, s * 0.68);
      ctx.stroke();
    }
  } else if (mark === "vertical") {
    ctx.font = `500 ${s * 0.09}px ${family}`;
    const chars = Array.from(label).slice(0, 10);
    chars.forEach((ch, i) => ctx.fillText(ch, s / 2, s * 0.22 + i * s * 0.07, s * 0.8));
  } else if (mark === "stacked") {
    const parts = label.split(" ");
    const rows = parts.length > 1 ? parts.slice(0, 3) : [label];
    rows.forEach((row, i) => {
      fitWord(ctx, row, family, s * 0.13, s * 0.85, "500");
      ctx.fillText(row, s / 2, s * 0.4 + i * s * 0.16, s * 0.85);
    });
  } else if (mark === "seal") {
    ctx.lineWidth = Math.max(minStroke, s * 0.015);
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
    ctx.lineWidth = Math.max(minStroke, s * 0.012);
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
    ctx.lineWidth = Math.max(minStroke, s * 0.01);
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
    ctx.lineWidth = Math.max(minStroke, s * 0.012);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const y = s * (0.4 + i * 0.1);
      ctx.moveTo(s * 0.18, y);
      ctx.bezierCurveTo(s * 0.35, y - s * 0.06, s * 0.45, y + s * 0.06, s * 0.62, y);
      ctx.bezierCurveTo(s * 0.72, y - s * 0.04, s * 0.78, y + s * 0.02, s * 0.84, y);
      ctx.stroke();
    }
  } else if (mark === "crest") {
    ctx.lineWidth = Math.max(minStroke, s * 0.012);
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
    ctx.lineWidth = Math.max(minStroke, s * 0.012);
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
    ctx.lineWidth = Math.max(minStroke, s * 0.01);
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(s / 2, s * 0.72, s * (0.08 + i * 0.045), Math.PI, 0);
      ctx.stroke();
    }
  } else if (mark === "laurel") {
    ctx.lineWidth = Math.max(minStroke, s * 0.01);
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
      ctx.arc(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r * 0.8, Math.max(minStroke * 0.5, s * 0.012), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (mark === "chevron") {
    ctx.lineWidth = Math.max(minStroke, s * 0.012);
    ctx.beginPath();
    ctx.moveTo(s * 0.28, s * 0.62);
    ctx.lineTo(s / 2, s * 0.38);
    ctx.lineTo(s * 0.72, s * 0.62);
    ctx.stroke();
    fitWord(ctx, label.slice(0, 14), family, s * 0.1, s * 0.8, "500");
    ctx.fillText(label.slice(0, 14), s / 2, s * 0.74, s * 0.85);
  } else if (mark === "oval") {
    ctx.lineWidth = Math.max(minStroke, s * 0.012);
    ctx.beginPath();
    ctx.ellipse(s / 2, s / 2, s * 0.28, s * 0.36, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `500 ${s * 0.1}px ${family}`;
    ctx.fillText(initial(label), s / 2, s / 2);
  } else if (mark === "bars") {
    ctx.lineWidth = Math.max(minStroke, s * 0.01);
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
  if (!word) return 0;
  const widths = new Map<number, number>();
  const widthAt = (px: number) => {
    const cached = widths.get(px);
    if (cached !== undefined) return cached;
    ctx.font = `${weight} ${px}px ${family}`;
    const value = ctx.measureText(word).width;
    widths.set(px, value);
    return value;
  };
  let lo = 8;
  let hi = Math.max(lo, Math.floor(maxPx));
  if (widthAt(lo) > maxWidth) {
    ctx.font = `${weight} ${lo}px ${family}`;
    return lo;
  }
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (widthAt(mid) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  ctx.font = `${weight} ${lo}px ${family}`;
  return lo;
}

const TYPE_MARKS = new Set<LogoSpec["mark"]>(["word", "horizon", "stacked", "vertical", "numeral"]);

/**
 * Ground behind carton ink.
 * Print keeps a plate. Emboss stays clear: the normal map is the glyph alpha, and the board shows through.
 * Foil and engrave stay clear. An empty colour stays clear so a missing board does not paint black.
 */
export function cartonMarkPlate(application: LogoApplication | "print", plateColour?: string | null): string | "clear" {
  const plated = application === "decal" || application === "print";
  if (!plated) return "clear";
  const colour = plateColour?.trim() ?? "";
  return colour ? colour : "clear";
}

export function paintLabel(
  ctx: CanvasRenderingContext2D,
  spec: Pick<LogoSpec, "mark" | "font" | "frame">,
  text: string,
  ink: string,
  w: number,
  h: number,
  plate: "contrast" | "clear" | string = "contrast",
  minStroke = 1,
): LabelLineLayout {
  const family = labelFontFamily(spec.font, text);
  const weight = labelFontWeight(spec.font, text);
  const typeMark = TYPE_MARKS.has(spec.mark) || h < w * 0.62;
  const direction = labelDirection(text);
  const canvasEl = ctx.canvas as HTMLCanvasElement | undefined;
  if (canvasEl?.setAttribute) canvasEl.setAttribute("dir", direction);
  ctx.save();
  ctx.direction = direction;
  if (plate === "clear") {
    ctx.clearRect(0, 0, w, h);
  } else {
    ctx.fillStyle = plate === "contrast" ? contrastingPlate(ink) : plate;
    ctx.fillRect(0, 0, w, h);
  }

  const layout = layoutLabelLines(text, Math.max(8, w * 0.86), h * (typeMark ? 0.78 : 0.58), (line, px) => {
    ctx.font = `${weight} ${px}px ${family}`;
    return ctx.measureText(line).width;
  });

  const textShare = typeMark ? 0.78 : 0.58;
  const textHeight = h * textShare;
  const textTop = h - h * 0.06 - textHeight;
  if (!typeMark) {
    const markBox = Math.min(w * 0.62, Math.max(8, textTop * 0.9));
    ctx.save();
    ctx.translate((w - markBox) / 2, Math.max(h * 0.045, (textTop - markBox) / 2));
    drawFrame(ctx, spec.frame, markBox, ink, minStroke);
    drawMark(ctx, spec.mark, spec.font, text, markBox, ink, minStroke);
    ctx.restore();
  } else if (spec.frame !== "none") {
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(Math.max(minStroke, 1.5), Math.min(w, h) * 0.012);
    const m = Math.min(w, h) * 0.055;
    ctx.strokeRect(m, m, w - m * 2, h - m * 2);
  }

  let y = textTop + textHeight / 2;
  if (layout.text) {
    ctx.direction = layout.direction;
    ctx.font = `${weight} ${layout.px}px ${family}`;
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const leading = layout.px * 1.16;
    const block = layout.lines.length * leading;
    y = textTop + (textHeight - block) / 2 + leading * 0.5;
    for (const line of layout.lines) {
      ctx.direction = layout.direction;
      ctx.fillText(line, w / 2, y);
      y += leading;
    }
  }
  
  if (spec.mark === "horizon") {
    ctx.lineWidth = Math.max(Math.max(minStroke, 1.5), h * 0.012);
    ctx.beginPath();
    ctx.moveTo(w * 0.18, Math.min(h - h * 0.08, y));
    ctx.lineTo(w * 0.82, Math.min(h - h * 0.08, y));
    ctx.stroke();
  }
  ctx.restore();
  return layout;
}

/**
 * Brand line for the carton face.
 * Print gets a contrasting plate. Emboss, foil, and engrave sit on the board.
 */
export function paintCartonMark(
  ctx: CanvasRenderingContext2D,
  spec: Pick<LogoSpec, "font">,
  text: string,
  ink: string,
  w: number,
  h: number,
  application: LogoApplication,
  plateColour?: string | null,
): void {
  const supplied = plateColour ?? (application === "decal" ? contrastingPlate(ink) : "");
  const plate = cartonMarkPlate(application, supplied);
  ctx.clearRect(0, 0, w, h);
  if (plate !== "clear") {
    ctx.fillStyle = plate;
    ctx.fillRect(0, 0, w, h);
  }
  const family = labelFontFamily(spec.font, text);
  const weight = labelFontWeight(spec.font, text);
  const direction = labelDirection(text);
  const canvasEl = ctx.canvas as HTMLCanvasElement | undefined;
  if (canvasEl?.setAttribute) canvasEl.setAttribute("dir", direction);
  ctx.save();
  ctx.direction = direction;
  const maxWidth = Math.max(8, w * (1 - CARTON_PAD_X * 2));
  const maxHeight = Math.max(8, h * (1 - CARTON_PAD_Y * 2));
  const layout = layoutLabelLines(text, maxWidth, maxHeight, (line, px) => {
    ctx.font = `${weight} ${px}px ${family}`;
    return ctx.measureText(line).width;
  });
  if (!layout.text) {
    ctx.restore();
    return;
  }
  ctx.font = `${weight} ${layout.px}px ${family}`;
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineWidth = hairlineWidth(layout.px, 0.012, application);
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const leading = layout.px * 1.16;
  const block = layout.lines.length * leading;
  let y = (h - block) / 2 + leading * 0.5;
  for (const line of layout.lines) {
    ctx.direction = layout.direction;
    if (application !== "decal") ctx.strokeText(line, w / 2, y);
    ctx.fillText(line, w / 2, y);
    y += leading;
  }
  ctx.restore();
}

/** Canvas whose aspect is the brand line, so the mesh can be 52 mm wide without letterboxing. */
export function cartonMarkCanvas(
  spec: Pick<LogoSpec, "font">,
  text: string,
  ink: string,
  application: LogoApplication,
  foil?: FoilRelief,
): HTMLCanvasElement {
  const probe = document.createElement("canvas");
  const probeCtx = probe.getContext("2d");
  const family = labelFontFamily(spec.font, text);
  const weight = labelFontWeight(spec.font, text);
  const aspect = cartonTextAspect(text, (line, px) => {
    if (!probeCtx) return Math.max(1, [...line].length * px * 0.55);
    probeCtx.font = `${weight} ${px}px ${family}`;
    return probeCtx.measureText(line).width || 1;
  });
  const longSide = 1536;
  const width = aspect >= 1 ? longSide : Math.max(64, Math.round(longSide * aspect));
  const height = aspect >= 1 ? Math.max(64, Math.round(longSide / aspect)) : longSide;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.dataset.aspect = String(aspect);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    paintCartonMark(ctx, spec, text, ink, width, height, application);
    applyLabelRelief(canvas, application, foil);
  }
  return canvas;
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

export function logoTexture(
  spec: LogoSpec,
  text: string,
  ink: string,
  size = 512,
  height?: number,
  application: LogoApplication = "decal",
  foil?: FoilRelief,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const w = Math.max(32, Math.round(size));
  const h = Math.max(32, Math.round(height ?? size));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const minStroke = hairlineWidth(1, 0, application);
  paintLabel(ctx, spec, text, ink, w, h, application === "decal" ? "contrast" : "clear", minStroke);
  applyLabelRelief(canvas, application, foil);
  if (application === "emboss") sealEmbossPlate(canvas, ink);
  return canvas;
}

const embossHeights = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

/** Glyph alpha captured before the emboss plate is painted, so the normal map still has relief. */
export function embossHeightCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  return embossHeights.get(canvas) ?? canvas;
}

/** Put the substrate behind transparent pixels and keep an opaque plate. Glyph colour stays. */
export function compositeEmbossPlatePixels(data: Uint8ClampedArray, plate: readonly [number, number, number]): void {
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    if (alpha >= 1) {
      data[index + 3] = 255;
      continue;
    }
    data[index] = Math.round(data[index] * alpha + plate[0] * (1 - alpha));
    data[index + 1] = Math.round(data[index + 1] * alpha + plate[1] * (1 - alpha));
    data[index + 2] = Math.round(data[index + 2] * alpha + plate[2] * (1 - alpha));
    data[index + 3] = 255;
  }
}

function sealEmbossPlate(canvas: HTMLCanvasElement, plate: string): void {
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const copyCtx = copy.getContext("2d");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!copyCtx || !ctx || canvas.width < 1 || canvas.height < 1) return;
  copyCtx.drawImage(canvas, 0, 0);
  embossHeights.set(canvas, copy);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  compositeEmbossPlatePixels(image.data, srgbBytes(plate));
  ctx.putImageData(image, 0, 0);
}
