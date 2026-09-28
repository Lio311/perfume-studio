import { listFor } from "./catalog.ts";
import { createDefaultDesign } from "./design.ts";
import { FINISHES } from "./materials.ts";
import { NECKS } from "./necks.ts";
import type { Design, FinishId, NeckId, VariantPart } from "./types.ts";

const PART_KEYS = ["bottle", "cap", "label", "pump", "collar", "box", "liquid"] as const;
const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const FINISH_IDS = new Set(FINISHES.map((finish) => finish.id));

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Own data keys only. Skips prototype keys so a link cannot pollute Object. */
function safeRecord(value: object): Record<string, unknown> {
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    if (BLOCKED_KEYS.has(key)) continue;
    out[key] = (value as Record<string, unknown>)[key];
  }
  return out;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pickNumber(source: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return clamp(value, min, max);
}

function pickBool(source: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = source[key];
  return typeof value === "boolean" ? value : fallback;
}

function pickColor(source: Record<string, unknown>, key: string, fallback: string): string {
  const value = source[key];
  return typeof value === "string" && HEX_COLOR.test(value) ? value : fallback;
}

function pickFinish(source: Record<string, unknown>, key: string, fallback: FinishId): FinishId {
  const value = source[key];
  return typeof value === "string" && FINISH_IDS.has(value as FinishId) ? (value as FinishId) : fallback;
}

function pickVariant(source: Record<string, unknown>, kind: VariantPart, fallback: string): string {
  const value = source.variantId;
  return typeof value === "string" && listFor(kind).some((item) => item.id === value) ? value : fallback;
}

function pickNeck(source: Record<string, unknown>, fallback: NeckId): NeckId {
  const value = source.neck;
  // `in` walks the prototype, so "constructor" and "toString" would pass and later throw in computeFit.
  return typeof value === "string" && Object.hasOwn(NECKS, value) ? (value as NeckId) : fallback;
}

function partRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? safeRecord(value) : null;
}

/**
 * Build a full design from a share payload.
 * Missing parts, unknown keys, and invalid values keep the current defaults.
 * Numbers use the same ranges as the chat commands, except liquid fill, which follows
 * the 0–1 slider. A missing or invalid `step` stays unset so the wizard does not reopen.
 */
export function mergeShareDesign(input: unknown): Design | null {
  if (!isRecord(input)) return null;
  const source = safeRecord(input);
  const hasPart = PART_KEYS.some((key) => Object.hasOwn(source, key));
  if (!hasPart && !Object.hasOwn(source, "step")) return null;
  const base = createDefaultDesign();
  const bottle = partRecord(source.bottle);
  const cap = partRecord(source.cap);
  const label = partRecord(source.label);
  const pump = partRecord(source.pump);
  const collar = partRecord(source.collar);
  const box = partRecord(source.box);
  const liquid = partRecord(source.liquid);

  const design: Design = {
    bottle: {
      variantId: bottle ? pickVariant(bottle, "bottle", base.bottle.variantId) : base.bottle.variantId,
      neck: bottle ? pickNeck(bottle, base.bottle.neck) : base.bottle.neck,
      finish: bottle ? pickFinish(bottle, "finish", base.bottle.finish) : base.bottle.finish,
      color: bottle ? pickColor(bottle, "color", base.bottle.color) : base.bottle.color,
      heightMm: bottle ? pickNumber(bottle, "heightMm", base.bottle.heightMm, 48, 180) : base.bottle.heightMm,
      widthMm: bottle ? pickNumber(bottle, "widthMm", base.bottle.widthMm, 26, 96) : base.bottle.widthMm,
      depthMm: bottle ? pickNumber(bottle, "depthMm", base.bottle.depthMm, 20, 90) : base.bottle.depthMm,
      visible: bottle ? pickBool(bottle, "visible", base.bottle.visible) : base.bottle.visible,
    },
    cap: {
      variantId: cap ? pickVariant(cap, "cap", base.cap.variantId) : base.cap.variantId,
      finish: cap ? pickFinish(cap, "finish", base.cap.finish) : base.cap.finish,
      color: cap ? pickColor(cap, "color", base.cap.color) : base.cap.color,
      heightMm: cap ? pickNumber(cap, "heightMm", base.cap.heightMm, 10, 78) : base.cap.heightMm,
      widthMm: cap ? pickNumber(cap, "widthMm", base.cap.widthMm, 16, 48) : base.cap.widthMm,
      visible: cap ? pickBool(cap, "visible", base.cap.visible) : base.cap.visible,
    },
    label: {
      variantId: label ? pickVariant(label, "label", base.label.variantId) : base.label.variantId,
      finish: label ? pickFinish(label, "finish", base.label.finish) : base.label.finish,
      color: label ? pickColor(label, "color", base.label.color) : base.label.color,
      text: label && typeof label.text === "string" ? label.text.slice(0, 32) : base.label.text,
      scale: label ? pickNumber(label, "scale", base.label.scale, 0.55, 1.6) : base.label.scale,
      visible: label ? pickBool(label, "visible", base.label.visible) : base.label.visible,
    },
    pump: {
      variantId: pump ? pickVariant(pump, "pump", base.pump.variantId) : base.pump.variantId,
      finish: pump ? pickFinish(pump, "finish", base.pump.finish) : base.pump.finish,
      color: pump ? pickColor(pump, "color", base.pump.color) : base.pump.color,
      visible: pump ? pickBool(pump, "visible", base.pump.visible) : base.pump.visible,
    },
    collar: {
      variantId: collar ? pickVariant(collar, "collar", base.collar.variantId) : base.collar.variantId,
      finish: collar ? pickFinish(collar, "finish", base.collar.finish) : base.collar.finish,
      color: collar ? pickColor(collar, "color", base.collar.color) : base.collar.color,
      visible: collar ? pickBool(collar, "visible", base.collar.visible) : base.collar.visible,
    },
    box: {
      variantId: box ? pickVariant(box, "box", base.box.variantId) : base.box.variantId,
      finish: box ? pickFinish(box, "finish", base.box.finish) : base.box.finish,
      color: box ? pickColor(box, "color", base.box.color) : base.box.color,
      heightMm: box ? pickNumber(box, "heightMm", base.box.heightMm, 70, 240) : base.box.heightMm,
      widthMm: box ? pickNumber(box, "widthMm", base.box.widthMm, 40, 160) : base.box.widthMm,
      depthMm: box ? pickNumber(box, "depthMm", base.box.depthMm, 30, 140) : base.box.depthMm,
      linked: box ? pickBool(box, "linked", base.box.linked) : base.box.linked,
      visible: box ? pickBool(box, "visible", base.box.visible) : base.box.visible,
    },
    liquid: {
      color: liquid ? pickColor(liquid, "color", base.liquid.color) : base.liquid.color,
      fill: liquid ? pickNumber(liquid, "fill", base.liquid.fill, 0, 1) : base.liquid.fill,
      visible: liquid ? pickBool(liquid, "visible", base.liquid.visible) : base.liquid.visible,
    },
  };

  const opacity = bottle?.opacity;
  if (typeof opacity === "number" && Number.isFinite(opacity)) design.bottle.opacity = clamp(opacity, 0, 1);

  if (Object.hasOwn(source, "step")) {
    const step = source.step;
    if (typeof step === "number" && Number.isInteger(step) && step >= 0 && step <= 7) design.step = step;
  }
  return design;
}

export function encodeShareDesign(design: Design): string {
  const json = JSON.stringify(design);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function parseShareJson(hash: string): unknown {
  const base = hash.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base.length % 4 === 0 ? "" : "=".repeat(4 - (base.length % 4));
  const json = decodeURIComponent(escape(atob(base + pad)));
  return JSON.parse(json) as unknown;
}

const VARIANT_KEYS = ["bottle", "cap", "label", "pump", "collar", "box"] as const;

/** Variant ids the link asked for that the catalog could not keep. */
export function droppedVariantIds(input: unknown, design: Design): string[] {
  if (!isRecord(input)) return [];
  const source = safeRecord(input);
  const missing: string[] = [];
  for (const key of VARIANT_KEYS) {
    const part = partRecord(source[key]);
    const requested = part?.variantId;
    if (typeof requested !== "string") continue;
    if (design[key].variantId !== requested) missing.push(requested);
  }
  return missing;
}

export function decodeShareDesign(hash: string): Design | null {
  try {
    return mergeShareDesign(parseShareJson(hash));
  } catch {
    return null;
  }
}

/** How long a share link waits for IndexedDB before applying with the catalog already loaded. */
export const SHARE_PACK_WAIT_MS = 2000;

function settleWithin(work: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    work.then(finish, finish);
  });
}

/**
 * Wait up to `timeoutMs` for hydration, then up to `timeoutMs` again for supplier packs.
 * The worst case is about four seconds. If the design object changed during the pack wait,
 * the link is not applied. A timed-out wait still applies, and reports part ids the catalog could not keep.
 */
export function applyIncomingShareHash(options: {
  read: () => { hash: string; pathname: string; search: string; state: unknown };
  ready: Promise<void>;
  hydrated?: Promise<void>;
  baseline: () => Design;
  cancelled?: () => boolean;
  timeoutMs?: number;
  noteMissing?: (ids: string[]) => void;
  apply: (design: Design) => void;
  replaceState: (state: unknown, title: string, url: string) => void;
}): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? SHARE_PACK_WAIT_MS;
  const hydrated = options.hydrated ?? Promise.resolve();
  return settleWithin(hydrated, timeoutMs).then(() => {
    const snapshot = options.baseline();
    return settleWithin(options.ready, timeoutMs).then(() => {
      if (options.cancelled?.()) return false;
      const loc = options.read();
      if (!loc.hash.startsWith("#d=")) return false;
      if (options.baseline() !== snapshot) {
        options.replaceState(loc.state, "", `${loc.pathname}${loc.search}`);
        return false;
      }
      return applyShareHash({
        hash: loc.hash,
        pathname: loc.pathname,
        search: loc.search,
        state: loc.state,
        apply: options.apply,
        replaceState: options.replaceState,
        noteMissing: options.noteMissing,
      });
    });
  });
}

/**
 * A pasted `#d=` arrives as `hashchange` (and sometimes `popstate`).
 * Apply the link. Do not run the Back handler for that navigation.
 * A hashchange that is not a share link is ignored. A pop without `#d=` is Back.
 */
export async function respondToLocation(options: {
  kind: "pop" | "hash";
  hash: string;
  applyShare: () => Promise<boolean>;
  back: () => void;
}): Promise<void> {
  if (options.hash.startsWith("#d=")) {
    await options.applyShare();
    return;
  }
  if (options.kind === "pop") options.back();
}

/** Apply a `#d=` hash, then strip it without pushing a history entry. */
export function applyShareHash(options: {
  hash: string;
  pathname: string;
  search: string;
  state: unknown;
  apply: (design: Design) => void;
  replaceState: (state: unknown, title: string, url: string) => void;
  noteMissing?: (ids: string[]) => void;
}): boolean {
  if (!options.hash.startsWith("#d=")) return false;
  let raw: unknown;
  try {
    raw = parseShareJson(options.hash.slice(3));
  } catch {
    return false;
  }
  const design = mergeShareDesign(raw);
  if (!design) return false;
  const missing = droppedVariantIds(raw, design);
  if (missing.length) options.noteMissing?.(missing);
  options.apply(design);
  options.replaceState(options.state, "", `${options.pathname}${options.search}`);
  return true;
}
