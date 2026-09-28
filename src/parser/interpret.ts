import { findByTag } from "../model/catalog.ts";
import { BOTTLES } from "../model/bottles.ts";
import { FINISHES } from "../model/materials.ts";
import type { FinishId, NeckId, PartKey, VariantPart } from "../model/types.ts";

export type LabCommand =
  | { type: "finish"; part: VariantPart; finish: FinishId }
  | { type: "color"; part: PartKey; color: string }
  | { type: "variant"; part: VariantPart; id: string }
  | { type: "cycle"; part: VariantPart; dir: 1 | -1 }
  | { type: "nudge"; part: VariantPart; axis: "height" | "width" | "both"; delta: number }
  | { type: "size"; part: VariantPart; axis: "height" | "width" | "depth"; mm: number }
  | { type: "visible"; part: PartKey; visible: boolean }
  | { type: "neck"; neck: NeckId }
  | { type: "fill"; value: number }
  | { type: "text"; text: string }
  | { type: "explode"; value: boolean }
  | { type: "rotate"; value: "toggle" | "on" | "off" }
  | { type: "reset" }
  | { type: "random" }
  | { type: "select"; part: PartKey }
  | { type: "help" };

export interface InterpretContext {
  lang: "he" | "en";
  selected: PartKey | null;
  bottleId: string;
  capId: string;
  labelId: string;
  pumpId: string;
  collarId: string;
  boxId: string;
}

export interface InterpretResult {
  commands: LabCommand[];
  reply: { he: string; en: string };
}

type Hit =
  | { k: "part"; part: PartKey }
  | { k: "finish"; finish: FinishId }
  | { k: "color"; color: string }
  | { k: "cycle"; part?: VariantPart; dir: 1 | -1 }
  | { k: "action"; action: "bigger" | "taller" | "smaller" | "shorter" | "wider" | "narrower" | "remove" | "show" | "explode" | "assemble" | "rotate" | "stop" | "reset" }
  | { k: "tag"; part: VariantPart; tag: string }
  | { k: "neck"; neck: NeckId }
  | { k: "random" }
  | { k: "help" }
  | { k: "fill"; value: number };

const PARTS: Array<[string, PartKey]> = [
  ["bottle", "bottle"],
  ["בקבוק", "bottle"],
  ["הבקבוק", "bottle"],
  ["cap", "cap"],
  ["פקק", "cap"],
  ["הפקק", "cap"],
  ["מכסה", "cap"],
  ["collar", "collar"],
  ["ferrule", "collar"],
  ["צווארון", "collar"],
  ["הצווארון", "collar"],
  ["פרול", "collar"],
  ["pump", "pump"],
  ["atomizer", "pump"],
  ["spray", "pump"],
  ["משאבה", "pump"],
  ["המשאבה", "pump"],
  ["מרסס", "pump"],
  ["המרסס", "pump"],
  ["אטומייזר", "pump"],
  ["label", "label"],
  ["logo", "label"],
  ["תווית", "label"],
  ["התווית", "label"],
  ["לוגו", "label"],
  ["הלוגו", "label"],
  ["box", "box"],
  ["packaging", "box"],
  ["קופסה", "box"],
  ["הקופסה", "box"],
  ["קופסא", "box"],
  ["אריזה", "box"],
  ["liquid", "liquid"],
  ["juice", "liquid"],
  ["נוזל", "liquid"],
  ["הנוזל", "liquid"],
];

const FINISH_PHRASES: Array<[string, FinishId]> = [
  ["rose gold", "rose"],
  ["זהב ורוד", "rose"],
  ["רוז גולד", "rose"],
  ["matte black", "matteBlack"],
  ["matt black", "matteBlack"],
  ["שחור מט", "matteBlack"],
  ["מט שחור", "matteBlack"],
  ["frosted glass", "frosted"],
  ["זכוכית חלבית", "frosted"],
  ["clear glass", "clear"],
  ["זכוכית שקופה", "clear"],
  ["tinted glass", "tinted"],
  ["זכוכית כהה", "tinted"],
  ["frosted", "frosted"],
  ["חלבית", "frosted"],
  ["חלבי", "frosted"],
  ["tinted", "tinted"],
  ["smoked", "tinted"],
  ["מעושנת", "tinted"],
  ["clear", "clear"],
  ["שקופה", "clear"],
  ["שקוף", "clear"],
  ["gold", "gold"],
  ["זהב", "gold"],
  ["silver", "silver"],
  ["chrome", "silver"],
  ["כסף", "silver"],
  ["leather", "leather"],
  ["עור", "leather"],
  ["wooden", "wood"],
  ["wood", "wood"],
  ["עץ", "wood"],
];

const COLORS: Array<[string, string]> = [
  ["pink", "#f3c9d6"],
  ["ורוד", "#f3c9d6"],
  ["ורודה", "#f3c9d6"],
  ["blush", "#e7a0b4"],
  ["red", "#9c2b36"],
  ["אדום", "#9c2b36"],
  ["אדומה", "#9c2b36"],
  ["bordeaux", "#7c2432"],
  ["burgundy", "#7c2432"],
  ["בורדו", "#7c2432"],
  ["blue", "#1d3344"],
  ["כחול", "#1d3344"],
  ["כחולה", "#1d3344"],
  ["green", "#8d9a84"],
  ["ירוק", "#8d9a84"],
  ["ירוקה", "#8d9a84"],
  ["purple", "#6d4a78"],
  ["סגול", "#6d4a78"],
  ["orange", "#c4783a"],
  ["כתום", "#c4783a"],
  ["brown", "#5c4033"],
  ["חום", "#5c4033"],
  ["חומה", "#5c4033"],
  ["beige", "#e6d3bc"],
  ["בז", "#e6d3bc"],
  ["champagne", "#e7d3ae"],
  ["שמפניה", "#e7d3ae"],
  ["white", "#f4f0e8"],
  ["ivory", "#f4f0e8"],
  ["לבן", "#f4f0e8"],
  ["לבנה", "#f4f0e8"],
  ["black", "#141414"],
  ["שחור", "#141414"],
  ["שחורה", "#141414"],
  ["amber", "#e2a24a"],
  ["ענבר", "#e2a24a"],
];

const ACTIONS: Array<[string, Hit]> = [
  ["יותר גדול", { k: "action", action: "bigger" }],
  ["גדול יותר", { k: "action", action: "bigger" }],
  ["תגדיל", { k: "action", action: "bigger" }],
  ["הגדל", { k: "action", action: "bigger" }],
  ["bigger", { k: "action", action: "bigger" }],
  ["larger", { k: "action", action: "bigger" }],
  ["enlarge", { k: "action", action: "bigger" }],
  ["יותר גבוה", { k: "action", action: "taller" }],
  ["גבוה יותר", { k: "action", action: "taller" }],
  ["תגביה", { k: "action", action: "taller" }],
  ["taller", { k: "action", action: "taller" }],
  ["higher", { k: "action", action: "taller" }],
  ["יותר קטן", { k: "action", action: "smaller" }],
  ["קטן יותר", { k: "action", action: "smaller" }],
  ["תקטין", { k: "action", action: "smaller" }],
  ["הקטן", { k: "action", action: "smaller" }],
  ["smaller", { k: "action", action: "smaller" }],
  ["יותר נמוך", { k: "action", action: "shorter" }],
  ["נמוך יותר", { k: "action", action: "shorter" }],
  ["shorter", { k: "action", action: "shorter" }],
  ["יותר רחב", { k: "action", action: "wider" }],
  ["רחב יותר", { k: "action", action: "wider" }],
  ["wider", { k: "action", action: "wider" }],
  ["תרחיב", { k: "action", action: "wider" }],
  ["יותר צר", { k: "action", action: "narrower" }],
  ["צר יותר", { k: "action", action: "narrower" }],
  ["narrower", { k: "action", action: "narrower" }],
  ["תסתיר", { k: "action", action: "remove" }],
  ["הסתר", { k: "action", action: "remove" }],
  ["תסיר", { k: "action", action: "remove" }],
  ["להסיר", { k: "action", action: "remove" }],
  ["הסר", { k: "action", action: "remove" }],
  ["remove", { k: "action", action: "remove" }],
  ["delete", { k: "action", action: "remove" }],
  ["hide", { k: "action", action: "remove" }],
  ["without", { k: "action", action: "remove" }],
  ["תחזיר", { k: "action", action: "show" }],
  ["החזר", { k: "action", action: "show" }],
  ["תציג", { k: "action", action: "show" }],
  ["הצג", { k: "action", action: "show" }],
  ["restore", { k: "action", action: "show" }],
  ["show", { k: "action", action: "show" }],
  ["disassemble", { k: "action", action: "explode" }],
  ["explode", { k: "action", action: "explode" }],
  ["תפרק", { k: "action", action: "explode" }],
  ["פירוק", { k: "action", action: "explode" }],
  ["פרק", { k: "action", action: "explode" }],
  ["assemble", { k: "action", action: "assemble" }],
  ["תרכיב", { k: "action", action: "assemble" }],
  ["הרכבה", { k: "action", action: "assemble" }],
  ["הרכב", { k: "action", action: "assemble" }],
  ["rotate", { k: "action", action: "rotate" }],
  ["spin", { k: "action", action: "rotate" }],
  ["תסובב", { k: "action", action: "rotate" }],
  ["סיבוב", { k: "action", action: "rotate" }],
  ["סובב", { k: "action", action: "rotate" }],
  ["pause", { k: "action", action: "stop" }],
  ["stop", { k: "action", action: "stop" }],
  ["תעצור", { k: "action", action: "stop" }],
  ["עצור", { k: "action", action: "stop" }],
  ["reset", { k: "action", action: "reset" }],
  ["איפוס", { k: "action", action: "reset" }],
  ["אפס", { k: "action", action: "reset" }],
];

const CYCLES: Array<[string, VariantPart | undefined, 1 | -1]> = [
  ["next cap", "cap", 1],
  ["previous cap", "cap", -1],
  ["prev cap", "cap", -1],
  ["next bottle", "bottle", 1],
  ["previous bottle", "bottle", -1],
  ["next logo", "label", 1],
  ["next label", "label", 1],
  ["previous logo", "label", -1],
  ["next box", "box", 1],
  ["previous box", "box", -1],
  ["next pump", "pump", 1],
  ["next collar", "collar", 1],
  ["פקק הבא", "cap", 1],
  ["הפקק הבא", "cap", 1],
  ["פקק הקודם", "cap", -1],
  ["הפקק הקודם", "cap", -1],
  ["בקבוק הבא", "bottle", 1],
  ["הבקבוק הבא", "bottle", 1],
  ["בקבוק הקודם", "bottle", -1],
  ["הבקבוק הקודם", "bottle", -1],
  ["קופסה הבאה", "box", 1],
  ["הקופסה הבאה", "box", 1],
  ["קופסה הקודמת", "box", -1],
  ["הקופסה הקודמת", "box", -1],
  ["לוגו הבא", "label", 1],
  ["הלוגו הבא", "label", 1],
  ["תווית הבאה", "label", 1],
  ["התווית הבאה", "label", 1],
  ["לוגו הקודם", "label", -1],
  ["משאבה הבאה", "pump", 1],
  ["המשאבה הבאה", "pump", 1],
  ["מרסס הבא", "pump", 1],
  ["צווארון הבא", "collar", 1],
  ["הצווארון הבא", "collar", 1],
  ["הבא", undefined, 1],
  ["הבאה", undefined, 1],
  ["הקודם", undefined, -1],
  ["הקודמת", undefined, -1],
  ["next", undefined, 1],
  ["previous", undefined, -1],
  ["prev", undefined, -1],
];

const TAGS: Array<[string, VariantPart, string]> = [
  ["square", "bottle", "square"],
  ["מרובע", "bottle", "square"],
  ["מרובעת", "bottle", "square"],
  ["ריבוע", "bottle", "square"],
  ["round", "bottle", "round"],
  ["עגול", "bottle", "round"],
  ["עגולה", "bottle", "round"],
  ["cylinder", "bottle", "cylinder"],
  ["גליל", "bottle", "cylinder"],
  ["צילינדר", "bottle", "cylinder"],
  ["flacon", "bottle", "flacon"],
  ["פלקון", "bottle", "flacon"],
  ["oval", "bottle", "oval"],
  ["אובל", "bottle", "oval"],
  ["pebble", "bottle", "pebble"],
  ["חלוק", "bottle", "pebble"],
  ["diamond", "bottle", "diamond"],
  ["יהלום", "bottle", "diamond"],
  ["hex", "bottle", "hex"],
  ["משושה", "bottle", "hex"],
  ["cara", "bottle", "cara"],
  ["קארה", "bottle", "cara"],
  ["sphere cap", "cap", "sphere"],
  ["כדור", "cap", "sphere"],
  ["cube", "cap", "cube"],
  ["קובייה", "cap", "cube"],
  ["קוביה", "cap", "cube"],
  ["magnetic cap", "cap", "magnetic"],
  ["פקק מגנטי", "cap", "magnetic"],
  ["sleeve", "box", "sleeve"],
  ["שרוול", "box", "sleeve"],
  ["magnetic box", "box", "magnetic"],
  ["קופסה מגנטית", "box", "magnetic"],
  ["מגנטית", "box", "magnetic"],
];

const NECK_WORDS: Array<[string, NeckId]> = [
  ["fea 13", "FEA13"],
  ["fea13", "FEA13"],
  ["fea 15", "FEA15"],
  ["fea15", "FEA15"],
  ["fea 17", "FEA17"],
  ["fea17", "FEA17"],
  ["fea 18", "FEA18"],
  ["fea18", "FEA18"],
  ["fea 20", "FEA20"],
  ["fea20", "FEA20"],
  ["פיאה 13", "FEA13"],
  ["פיאה 15", "FEA15"],
  ["פיאה 17", "FEA17"],
  ["פיאה 18", "FEA18"],
  ["פיאה 20", "FEA20"],
];

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[׳'"`״]/g, "")
    .replace(/[^\p{L}\p{N}%]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phrases(): Array<{ text: string; hit: Hit }> {
  const list: Array<{ text: string; hit: Hit }> = [];
  for (const [text, part, dir] of CYCLES) list.push({ text, hit: { k: "cycle", part, dir } });
  for (const [text, finish] of FINISH_PHRASES) list.push({ text, hit: { k: "finish", finish } });
  for (const [text, part, tag] of TAGS) list.push({ text, hit: { k: "tag", part, tag } });
  for (const [text, neck] of NECK_WORDS) list.push({ text, hit: { k: "neck", neck } });
  for (const [text, action] of ACTIONS) list.push({ text, hit: action });
  for (const [text, color] of COLORS) list.push({ text, hit: { k: "color", color } });
  for (const [text, part] of PARTS) list.push({ text, hit: { k: "part", part } });
  list.push({ text: "חצי מלא", hit: { k: "fill", value: 0.5 } });
  list.push({ text: "half full", hit: { k: "fill", value: 0.5 } });
  list.push({ text: "half", hit: { k: "fill", value: 0.5 } });
  list.push({ text: "חצי", hit: { k: "fill", value: 0.5 } });
  list.push({ text: "כמעט מלא", hit: { k: "fill", value: 0.9 } });
  list.push({ text: "מלא", hit: { k: "fill", value: 0.92 } });
  list.push({ text: "full", hit: { k: "fill", value: 0.92 } });
  list.push({ text: "empty", hit: { k: "fill", value: 0.08 } });
  list.push({ text: "ריק", hit: { k: "fill", value: 0.08 } });
  list.push({ text: "randomize", hit: { k: "random" } });
  list.push({ text: "random", hit: { k: "random" } });
  list.push({ text: "surprise", hit: { k: "random" } });
  list.push({ text: "ערבב", hit: { k: "random" } });
  list.push({ text: "אקראי", hit: { k: "random" } });
  list.push({ text: "הפתע", hit: { k: "random" } });
  list.push({ text: "help", hit: { k: "help" } });
  list.push({ text: "עזרה", hit: { k: "help" } });
  return list.sort((a, b) => b.text.length - a.text.length);
}

const PHRASES = phrases();

const HE_PREFIX = new Set(["ל", "ב", "ה", "ו", "מ", "ש", "כ"]);

function locate(scratch: string, phrase: string, from: number): number {
  let at = scratch.indexOf(phrase, from);
  while (at !== -1) {
    const prev = at === 0 ? " " : scratch[at - 1];
    const prev2 = at <= 1 ? " " : scratch[at - 2];
    const next = scratch[at + phrase.length] ?? " ";
    const boundaryBefore = prev === " " || (HE_PREFIX.has(prev) && prev2 === " ");
    const boundaryAfter = next === " ";
    if (boundaryBefore && boundaryAfter) return at;
    at = scratch.indexOf(phrase, at + 1);
  }
  return -1;
}

function scan(text: string): Hit[] {
  let scratch = ` ${text} `;
  const hits: Hit[] = [];
  for (const phrase of PHRASES) {
    let at = locate(scratch, phrase.text, 0);
    while (at !== -1) {
      hits.push(phrase.hit);
      scratch = `${scratch.slice(0, at)}${"#".repeat(phrase.text.length)}${scratch.slice(at + phrase.text.length)}`;
      at = locate(scratch, phrase.text, at + phrase.text.length);
    }
  }
  return hits;
}

function currentId(ctx: InterpretContext, part: VariantPart): string {
  if (part === "bottle") return ctx.bottleId;
  if (part === "cap") return ctx.capId;
  if (part === "label") return ctx.labelId;
  if (part === "pump") return ctx.pumpId;
  if (part === "collar") return ctx.collarId;
  return ctx.boxId;
}

function bottleForVolume(ml: number, currentId: string): string | null {
  const current = BOTTLES.find((b) => b.id === currentId);
  const family = current?.tags.find((tag) => ["cara", "round", "column", "square", "flacon", "oval", "pebble", "hex"].includes(tag));
  const sized = BOTTLES.filter((b) => b.tags.includes(String(ml)));
  const same = sized.find((b) => family && b.tags.includes(family));
  return same?.id ?? sized[0]?.id ?? null;
}

function variantPart(part: PartKey | undefined, fallback: VariantPart): VariantPart {
  if (part && part !== "liquid") return part;
  return fallback;
}

export function interpretUtterance(input: string, ctx: InterpretContext): InterpretResult {
  const text = normalize(input);
  const hits = scan(text);
  const commands: LabCommand[] = [];
  const parts = hits.filter((h): h is { k: "part"; part: PartKey } => h.k === "part").map((h) => h.part);
  const uniqueParts = [...new Set(parts)];
  const finishes = hits.filter((h): h is { k: "finish"; finish: FinishId } => h.k === "finish");
  const colors = hits.filter((h): h is { k: "color"; color: string } => h.k === "color");
  const actions = hits.filter((h): h is { k: "action"; action: Extract<Hit, { k: "action" }>["action"] } => h.k === "action");
  const cycles = hits.filter((h): h is { k: "cycle"; part?: VariantPart; dir: 1 | -1 } => h.k === "cycle");
  const tags = hits.filter((h): h is { k: "tag"; part: VariantPart; tag: string } => h.k === "tag");
  const necks = hits.filter((h): h is { k: "neck"; neck: NeckId } => h.k === "neck");
  const fills = hits.filter((h): h is { k: "fill"; value: number } => h.k === "fill");

  if (hits.some((h) => h.k === "help") && hits.length < 3) {
    commands.push({ type: "help" });
    return finish(commands);
  }
  if (hits.some((h) => h.k === "random")) commands.push({ type: "random" });

  for (const cycle of cycles) {
    const part = cycle.part ?? (ctx.selected && ctx.selected !== "liquid" ? ctx.selected : uniqueParts.find((p): p is VariantPart => p !== "liquid") ?? "bottle");
    commands.push({ type: "cycle", part, dir: cycle.dir });
    commands.push({ type: "select", part });
  }

  if (actions.some((a) => a.action === "explode")) commands.push({ type: "explode", value: true });
  if (actions.some((a) => a.action === "assemble")) commands.push({ type: "explode", value: false });
  if (actions.some((a) => a.action === "stop")) commands.push({ type: "rotate", value: "off" });
  else if (actions.some((a) => a.action === "rotate")) commands.push({ type: "rotate", value: "toggle" });
  if (actions.some((a) => a.action === "reset")) commands.push({ type: "reset" });

  for (const neck of necks) commands.push({ type: "neck", neck: neck.neck });

  const vol = text.match(/(?:^|\s)(30|50|100|200)\s*(?:ml|מל)/);
  if (vol) {
    const id = bottleForVolume(Number(vol[1]), ctx.bottleId);
    if (id) {
      commands.push({ type: "variant", part: "bottle", id });
      commands.push({ type: "select", part: "bottle" });
    }
  }

  const pct = text.match(/(\d{1,3})\s*(?:%|אחוז)/);
  if (pct) commands.push({ type: "fill", value: Math.min(0.95, Math.max(0.05, Number(pct[1]) / 100)) });
  for (const fill of fills) {
    if (!commands.some((c) => c.type === "fill")) commands.push({ type: "fill", value: fill.value });
  }

  const measure = text.match(/(\d+(?:\.\d+)?)\s*(?:mm|ממ)/);
  if (measure) {
    const mm = Number(measure[1]);
    const part = variantPart(uniqueParts[0], ctx.selected && ctx.selected !== "liquid" ? ctx.selected : "bottle");
    if ([13, 15, 17, 18, 20].includes(mm) && (uniqueParts.includes("collar") || text.includes("fea") || text.includes("צוואר") || text.includes("קוטר") || text.includes("diameter"))) {
      commands.push({ type: "neck", neck: `FEA${mm}` as NeckId });
    } else if (text.includes("רוחב") || text.includes("width")) commands.push({ type: "size", part, axis: "width", mm });
    else if (text.includes("עומק") || text.includes("depth")) commands.push({ type: "size", part, axis: "depth", mm });
    else commands.push({ type: "size", part, axis: "height", mm });
  }

  const quoted = input.match(/[""«]([^""»]+)[""»]/);
  const spoken = input
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[׳'"`״-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const logoTo = spoken.match(/(?:שנה |תשנה |החלף |change |set )?(?:את )?(?:הלוגו|לוגו|logo|label|כיתוב|הכיתוב|טקסט|text) (?:ל |to )([A-Za-z0-9\u0590-\u05FF][A-Za-z0-9\u0590-\u05FF ]{0,24})/i);
  const logoWords = quoted?.[1]?.trim() || logoTo?.[1]?.trim();
  if (logoWords && (uniqueParts.includes("label") || /לוגו|כיתוב|טקסט|text|label|logo/.test(text))) {
    commands.push({ type: "text", text: logoWords.replace(/\s+$/g, "") });
  }

  for (const tag of tags) {
    const id = findByTag(tag.part, tag.tag, currentId(ctx, tag.part));
    if (id) {
      commands.push({ type: "variant", part: tag.part, id });
      commands.push({ type: "select", part: tag.part });
    }
  }

  const glass = finishes.some((f) => f.finish === "clear" || f.finish === "frosted" || f.finish === "tinted");
  let targets: PartKey[] = uniqueParts.length ? uniqueParts : [];
  if (!targets.length && tags.length) targets = [...new Set(tags.map((t) => t.part))];
  if (!targets.length && glass) targets = ["bottle"];
  if (!targets.length && ctx.selected) targets = [ctx.selected];
  if (!targets.length && (finishes.length || colors.length)) targets = colors.length && !finishes.length ? ["liquid"] : ["bottle"];

  for (const finish of finishes) {
    for (const part of targets) {
      if (part === "liquid") continue;
      commands.push({ type: "finish", part, finish: finish.finish });
      if (finish.finish === "wood" && part === "cap" && !commands.some((c) => c.type === "variant" && c.part === "cap")) {
        const id = findByTag("cap", "wood", ctx.capId);
        if (id) commands.push({ type: "variant", part: "cap", id });
      }
    }
  }

  for (const color of colors) {
    const black = color.color === "#141414";
    for (const part of targets) {
      if (part !== "liquid" && black && !finishes.length) commands.push({ type: "finish", part, finish: "matteBlack" });
      commands.push({ type: "color", part, color: color.color });
    }
  }

  const hide = actions.some((a) => a.action === "remove");
  const show = actions.some((a) => a.action === "show");
  if (hide || show) {
    const visParts = uniqueParts.length ? uniqueParts : targets;
    for (const part of visParts) commands.push({ type: "visible", part, visible: show && !hide });
  }

  const sized = Boolean(vol);
  for (const action of actions) {
    const part = variantPart(uniqueParts[0] ?? (tags[0]?.part as PartKey | undefined), ctx.selected && ctx.selected !== "liquid" ? ctx.selected : "bottle");
    if (sized && (action.action === "bigger" || action.action === "taller" || action.action === "smaller" || action.action === "shorter")) continue;
    if (action.action === "bigger") commands.push({ type: "nudge", part, axis: "both", delta: 8 });
    if (action.action === "taller") commands.push({ type: "nudge", part, axis: "height", delta: 8 });
    if (action.action === "smaller") commands.push({ type: "nudge", part, axis: "both", delta: -8 });
    if (action.action === "shorter") commands.push({ type: "nudge", part, axis: "height", delta: -8 });
    if (action.action === "wider") commands.push({ type: "nudge", part, axis: "width", delta: 4 });
    if (action.action === "narrower") commands.push({ type: "nudge", part, axis: "width", delta: -4 });
  }

  if (uniqueParts[0] && !commands.some((c) => c.type === "select")) {
    commands.push({ type: "select", part: uniqueParts[0] });
  }

  return finish(dedupe(commands));
}

function dedupe(commands: LabCommand[]): LabCommand[] {
  const seen = new Set<string>();
  return commands.filter((command) => {
    const key = JSON.stringify(command);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const PART_NAME = {
  he: { bottle: "הבקבוק", cap: "הפקק", collar: "הצווארון", pump: "המרסס", label: "הלוגו", box: "הקופסה", liquid: "הנוזל" },
  en: { bottle: "Bottle", cap: "Cap", collar: "Collar", pump: "Pump", label: "Logo", box: "Box", liquid: "Liquid" },
} as const;

function finishName(id: FinishId, lang: "he" | "en"): string {
  return FINISHES.find((f) => f.id === id)?.name[lang] ?? id;
}

function line(command: LabCommand, lang: "he" | "en"): string {
  const he = lang === "he";
  switch (command.type) {
    case "finish":
      return he ? `${PART_NAME.he[command.part]} — ${finishName(command.finish, "he")}.` : `${PART_NAME.en[command.part]} set to ${finishName(command.finish, "en")}.`;
    case "color":
      return he ? `${PART_NAME.he[command.part]} עודכן בצבע.` : `${PART_NAME.en[command.part]} recolored.`;
    case "variant":
      return he ? `${PART_NAME.he[command.part]} הוחלף.` : `${PART_NAME.en[command.part]} swapped.`;
    case "cycle":
      return he ? `${PART_NAME.he[command.part]} — ${command.dir > 0 ? "הבא" : "הקודם"}.` : `${PART_NAME.en[command.part]} ${command.dir > 0 ? "next" : "previous"}.`;
    case "nudge":
      return he ? `${PART_NAME.he[command.part]} ${command.delta > 0 ? "הוגדל" : "הוקטן"}.` : `${PART_NAME.en[command.part]} resized.`;
    case "size":
      return he ? `${PART_NAME.he[command.part]} — ${command.mm} מ״מ.` : `${PART_NAME.en[command.part]} set to ${command.mm} mm.`;
    case "visible":
      return he ? `${PART_NAME.he[command.part]} ${command.visible ? "חזר" : "הוסר"}.` : `${PART_NAME.en[command.part]} ${command.visible ? "restored" : "removed"}.`;
    case "neck":
      return he ? `צוואר ${command.neck}.` : `Neck set to ${command.neck}.`;
    case "fill":
      return he ? `מילוי ${Math.round(command.value * 100)}%.` : `Fill ${Math.round(command.value * 100)}%.`;
    case "text":
      return he ? `הטקסט עודכן.` : `Label text updated.`;
    case "explode":
      return he ? (command.value ? "החלקים פורקו." : "החלקים הורכבו.") : command.value ? "Exploded." : "Assembled.";
    case "rotate":
      return he ? (command.value === "off" ? "הסיבוב נעצר." : "סיבוב אוטומטי.") : command.value === "off" ? "Rotation stopped." : "Auto-rotate.";
    case "reset":
      return he ? "המבט אופס." : "View reset.";
    case "random":
      return he ? "הורכב שילוב חדש." : "New combination.";
    case "select":
      return he ? `${PART_NAME.he[command.part]} נבחר.` : `${PART_NAME.en[command.part]} selected.`;
    case "help":
      return he ? "אפשר לכתוב: «פקק הבא», «פקק שחור מט», «בקבוק מרובע חלבי», «תסיר את הקופסה», «נוזל ורוד», «תפרק»." : "Try: “next cap”, “matte black cap”, “square frosted bottle”, “remove the box”, “pink liquid”, “explode”.";
    default:
      return "";
  }
}

function finish(commands: LabCommand[]): InterpretResult {
  const useful = commands.filter((c) => c.type !== "select");
  const shown = useful.length ? useful : commands;
  if (!shown.length) {
    return {
      commands: [],
      reply: {
        he: "לא זיהיתי פקודה. נסו «פקק הבא», «פקק שחור מט» או «תפרק».",
        en: "I didn’t catch that. Try “next cap”, “matte black cap”, or “explode”.",
      },
    };
  }
  return {
    commands,
    reply: {
      he: shown.map((c) => line(c, "he")).join(" "),
      en: shown.map((c) => line(c, "en")).join(" "),
    },
  };
}
