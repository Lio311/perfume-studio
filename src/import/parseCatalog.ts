import type { NeckId, VariantPart } from "../model/types.ts";

/**
 * A catalog page after text extraction. A future vision backend can ignore
 * `text` and read `image` instead; both extractors return `DraftItem`.
 */
export interface CatalogPageInput {
  page: number;
  text: string;
}

export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ImportProfile = "cylinder" | "cube" | "sphere" | "taper" | "dome" | "bottle" | "rect-bottle" | "box" | "label" | "pump" | "collar";

export interface DraftItem {
  id: string;
  page: number;
  kind: VariantPart;
  code: string;
  neck: NeckId | null;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  capacityMl: number | null;
  profile: ImportProfile;
  crop: NormRect;
  /** 1 when kind and a real measurement were both found. */
  confidence: number;
  /** True when the page had no text layer and the row is a blank for the user. */
  manual: boolean;
}

export interface CatalogSource {
  id: string;
  extract(pages: CatalogPageInput[]): DraftItem[];
}

const KIND_WORDS: Array<{ kind: VariantPart; words: string[] }> = [
  { kind: "pump", words: ["lotion pump", "spray pump", "sprayer", "atomizer", "atomiser", "pump", "משאבה", "מרסס", "بخاخ", "مضخة"] },
  { kind: "collar", words: ["ferrule", "collar", "צווארון", "طوق"] },
  { kind: "label", words: ["sticker", "decal", "label", "מדבקה", "תווית", "ملصق", "ستيكر"] },
  { kind: "box", words: ["gift box", "paper box", "paper tube", "carton", "coffret", "packaging", "box", "קופסה", "علبة", "كرتون"] },
  { kind: "bottle", words: ["glass bottle", "bottle", "flacon", "vial", "בקבוק", "زجاجة"] },
  { kind: "cap", words: ["overcap", "closure", "stopper", "zamac", "surlyn", "aluminium", "aluminum", "wooden cap", "cap", "lid", "פקק", "מכסה", "غطاء", "سدادة"] },
];

const UNIT = String.raw`(?:mm|cm|מ״מ|מ"מ|ממ|ملم)?`;
const NUM = String.raw`(\d+(?:[.,]\d+)?)`;

function detectKind(text: string): VariantPart | null {
  const hay = text.toLowerCase();
  for (const entry of KIND_WORDS) {
    if (entry.words.some((word) => hay.includes(word.toLowerCase()))) return entry.kind;
  }
  return null;
}

function parseNum(raw: string): number {
  return Number(raw.replace(",", "."));
}

function asMm(value: number, unit: string | undefined): number {
  if (!unit) return value;
  return /^cm$/i.test(unit) ? value * 10 : value;
}

function readNeck(text: string): NeckId | null {
  const match = text.match(/FEA\s*-?\s*(13|15|17|18|20)\b/i);
  if (!match) return null;
  return `FEA${match[1]}` as NeckId;
}

function readCode(text: string): string {
  const labeled = text.match(/(?:^|\s)(?:ref(?:erence)?|item(?:\s*no\.?)?|code|sku)\b\s*[:#.]?\s*([A-Za-z0-9][A-Za-z0-9./-]{1,})/i)
    ?? text.match(/(?:קוד|كود|מק["״']?ט)\s*[:#.]?\s*([A-Za-z0-9][A-Za-z0-9./-]{1,})/);
  const leading = text.trim().match(/^([A-Z]{1,6}-\d{2,}[A-Z0-9-]*)/im);
  if (leading && /[A-Z]/i.test(leading[1])) return leading[1].toUpperCase();
  if (leading && labeled && /^\d+$/.test(labeled[1])) return leading[1].toUpperCase();
  if (labeled) return labeled[1].toUpperCase();
  return leading ? leading[1].toUpperCase() : "";
}

function readMl(text: string): number | null {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:ml|מ״ל|מ"ל|مل)\b/i);
  return match ? parseNum(match[1]) : null;
}

interface Measures {
  dia?: number;
  w?: number;
  h?: number;
  d?: number;
  triple?: boolean;
  pair?: boolean;
}

function readMeasures(text: string): Measures {
  const found: Measures = {};
  const triple = text.match(new RegExp(`${NUM}\\s*${UNIT}\\s*[x×*]\\s*${NUM}\\s*${UNIT}\\s*[x×*]\\s*${NUM}\\s*(mm|cm|מ״מ|מ"מ|ממ)?`, "i"));
  if (triple) {
    const unit = triple[4];
    found.w = asMm(parseNum(triple[1]), unit);
    found.h = asMm(parseNum(triple[2]), unit);
    found.d = asMm(parseNum(triple[3]), unit);
    found.triple = true;
  } else {
    const pair = text.match(new RegExp(`${NUM}\\s*${UNIT}\\s*[x×*]\\s*${NUM}\\s*(mm|cm|מ״מ|מ"מ|ממ)?`, "i"));
    if (pair) {
      const unit = pair[3];
      found.w = asMm(parseNum(pair[1]), unit);
      found.h = asMm(parseNum(pair[2]), unit);
      found.pair = true;
    }
  }
  const dia = text.match(new RegExp(`(?:Ø|⌀|dia(?:meter)?\\.?|קוטר|قطر)\\s*[:=]?\\s*${NUM}\\s*(mm|cm|מ״מ|מ"מ|ממ)?`, "i"));
  if (dia) found.dia = asMm(parseNum(dia[1]), dia[2]);
  const height = text.match(new RegExp(`(?:height|גובה|ارتفاع)\\s*[:=]?\\s*${NUM}\\s*(mm|cm|מ״מ|מ"מ|ממ)?|\\bH\\s*[:=]?\\s*${NUM}\\s*(mm|cm|מ״מ|מ"מ|ממ)?`, "i"));
  if (height) found.h = asMm(parseNum(height[1] || height[3]), height[2] || height[4]);
  const width = text.match(new RegExp(`(?:width|רוחב|عرض)\\s*[:=]?\\s*${NUM}\\s*(mm|cm|מ״מ|מ"מ|ממ)?|\\b[WL]\\s*[:=]?\\s*${NUM}\\s*(mm|cm|מ״מ|מ"מ|ממ)?`, "i"));
  if (width) found.w = asMm(parseNum(width[1] || width[3]), width[2] || width[4]);
  const depth = text.match(new RegExp(`(?:depth|עומק|عمق)\\s*[:=]?\\s*${NUM}\\s*(mm|cm|מ״מ|מ"מ|ממ)?|\\bD\\s*[:=]?\\s*${NUM}\\s*(mm|cm|מ״מ|מ"מ|ממ)?`, "i"));
  if (depth) found.d = asMm(parseNum(depth[1] || depth[3]), depth[2] || depth[4]);
  return found;
}

function profileFor(kind: VariantPart, text: string): ImportProfile {
  const hay = text.toLowerCase();
  if (kind === "box") return "box";
  if (kind === "label") return "label";
  if (kind === "pump") return "pump";
  if (kind === "collar") return "collar";
  if (kind === "bottle") return /square|rect|מלבן|مربع/.test(hay) ? "rect-bottle" : /sphere|ball|כדור|كرة/.test(hay) ? "sphere" : "bottle";
  if (/sphere|ball|כדור|كرة/.test(hay)) return "sphere";
  if (/cube|square|קובי|מרובע|مربع/.test(hay)) return "cube";
  if (/taper|cone|חרוט|مخروط/.test(hay)) return "taper";
  if (/dome|כיפה|قبة/.test(hay)) return "dome";
  return "cylinder";
}

function finishDims(kind: VariantPart, measures: Measures): { widthMm: number; heightMm: number; depthMm: number } {
  let width = measures.w ?? measures.dia ?? 0;
  let height = measures.h ?? 0;
  let depth = measures.d ?? 0;
  if (measures.pair && !measures.triple && (kind === "cap" || kind === "pump" || kind === "collar")) {
    width = measures.dia ?? measures.w ?? width;
    depth = depth || width;
  }
  if (kind === "cap" || kind === "pump" || kind === "collar") {
    width = width || 30;
    depth = depth || width;
    height = height || (kind === "collar" ? 6.5 : kind === "pump" ? 18 : 32);
  } else if (kind === "label") {
    width = width || 40;
    height = height || 22;
    depth = depth || 0.4;
  } else if (kind === "box") {
    width = width || 80;
    depth = depth || 70;
    height = height || 120;
  } else {
    width = width || 51;
    depth = depth || 43;
    height = height || 90;
  }
  return {
    widthMm: roundMm(width),
    heightMm: roundMm(height),
    depthMm: roundMm(depth),
  };
}

function roundMm(value: number): number {
  return Math.round(value * 10) / 10;
}

function hasMeasure(text: string): boolean {
  return /Ø|⌀|\d+(?:[.,]\d+)?\s*(?:mm|cm|מ״מ|מ"מ|ממ)/i.test(text) || /\d+\s*[x×]\s*\d+/i.test(text) || /FEA\s*-?\s*1[3578]|FEA\s*-?\s*20/i.test(text);
}

function blocksOf(text: string): string[] {
  const chunks = text.split(/\n\s*\n/).map((chunk) => chunk.trim()).filter(Boolean);
  const blocks: string[] = [];
  for (const chunk of chunks.length ? chunks : [text.trim()]) {
    const lines = chunk.split(/\n/).map((line) => line.trim()).filter(Boolean);
    let current: string[] = [];
    const flush = () => {
      if (current.length) blocks.push(current.join("\n"));
      current = [];
    };
    for (const line of lines) {
      const starts = /^(?:cap|closure|box|carton|bottle|pump|label|sticker|collar|zamac|surlyn|פקק|קופסה|בקבוק|מדבקה|غطاء|علبة)/i.test(line)
        || /^[A-Z]{1,6}\s*-\s*\d{2,}/.test(line);
      const soFar = current.join(" ");
      if (starts && current.length && (detectKind(soFar) || hasMeasure(soFar))) flush();
      current.push(line);
    }
    flush();
  }
  return blocks.filter(Boolean);
}

function cropFor(index: number, count: number): NormRect {
  const slot = 1 / Math.max(1, count);
  const pad = Math.min(0.04, slot * 0.12);
  return { x: 0.08, y: index * slot + pad, w: 0.84, h: Math.max(0.08, slot - pad * 2) };
}

function itemFromBlock(block: string, page: number, index: number, count: number): DraftItem | null {
  const kind = detectKind(block);
  const measures = readMeasures(block);
  const measured = Boolean(measures.triple || measures.pair || measures.dia || measures.h || measures.w);
  const code = readCode(block);
  if (!kind && !measured) return null;
  if (!measured && !code) return null;
  const resolved = kind ?? inferKind(measures, block);
  if (!resolved) return null;
  const dims = finishDims(resolved, measures);
  return {
    id: `p${page}-${index}`,
    page,
    kind: resolved,
    code: code || `${resolved.toUpperCase()}-${page}${index + 1}`,
    neck: readNeck(block),
    ...dims,
    capacityMl: readMl(block),
    profile: profileFor(resolved, block),
    crop: cropFor(index, count),
    confidence: kind && measured ? 0.9 : 0.55,
    manual: false,
  };
}

function inferKind(measures: Measures, text: string): VariantPart | null {
  if (readMl(text) && (measures.triple || measures.h)) return "bottle";
  if (measures.triple) return "box";
  if (measures.dia && measures.h && measures.h < 80) return "cap";
  return null;
}

/** Regex extractor. Replace `regexCatalogSource` with a vision client that returns the same drafts. */
export function parseCatalogPages(pages: CatalogPageInput[]): DraftItem[] {
  const drafts: DraftItem[] = [];
  for (const page of pages) {
    const text = page.text.replace(/\u00a0/g, " ").trim();
    if (text.length < 4) continue;
    const blocks = blocksOf(text);
    const made: DraftItem[] = [];
    blocks.forEach((block, index) => {
      const item = itemFromBlock(block, page.page, index, blocks.length);
      if (item) made.push(item);
    });
    made.forEach((item, index) => {
      item.crop = cropFor(index, made.length);
      drafts.push(item);
    });
  }
  return drafts;
}

export const regexCatalogSource: CatalogSource = {
  id: "regex",
  extract: parseCatalogPages,
};
