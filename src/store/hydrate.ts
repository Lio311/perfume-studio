import type { PersistStorage } from "zustand/middleware";
import { catalogHas } from "../model/catalog.ts";
import { createDefaultDesign } from "../model/design.ts";
import { FINISHES } from "../model/materials.ts";
import { NECKS } from "../model/necks.ts";
import type { ThemeId } from "../theme/themes.ts";
import type {
  BottleState,
  BoxState,
  CapState,
  CollarState,
  Design,
  FinishId,
  LabelState,
  Lang,
  LiquidState,
  NeckId,
  PumpState,
  VariantPart,
} from "../model/types.ts";
import type { ChatMessage, PendingFile, PendingPart, SavedDesign } from "./labStore.ts";

const FINISH_IDS = new Set<string>(FINISHES.map((finish) => finish.id));
const PARTS: VariantPart[] = ["bottle", "cap", "label", "pump", "collar", "box"];
const PENDING_KINDS = new Set<string>([...PARTS, "unassigned"]);

/** Fields the lab may read back from `perfume-lab-v1`. */
export interface HydratedSlice {
  design: Design;
  theme: ThemeId;
  lang: Lang;
  chat: ChatMessage[];
  saved: SavedDesign[];
  pending: PendingPart[];
  compareIds: string[];
  past: Design[];
  future: Design[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function own(source: Record<string, unknown>, key: string): unknown {
  if (key === "__proto__" || key === "constructor" || key === "prototype") return undefined;
  if (!Object.hasOwn(source, key)) return undefined;
  return source[key];
}

function copyOwn(source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    out[key] = source[key];
  }
  return out;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return clamp(value, min, max);
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function colorOf(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) return fallback;
  return value;
}

function finishOf(value: unknown, fallback: FinishId): FinishId {
  if (typeof value === "string" && FINISH_IDS.has(value)) return value as FinishId;
  return fallback;
}

function isNeck(value: unknown): value is NeckId {
  return typeof value === "string" && Object.hasOwn(NECKS, value);
}

function knownId(kind: VariantPart, value: unknown): value is string {
  return typeof value === "string" && catalogHas(kind, value);
}

function sanitizeBottle(raw: unknown, fallback: BottleState): BottleState {
  if (!isRecord(raw) || !knownId("bottle", own(raw, "variantId"))) return { ...fallback };
  const next: BottleState = {
    variantId: own(raw, "variantId") as string,
    neck: isNeck(own(raw, "neck")) ? (own(raw, "neck") as NeckId) : fallback.neck,
    finish: finishOf(own(raw, "finish"), fallback.finish),
    color: colorOf(own(raw, "color"), fallback.color),
    heightMm: num(own(raw, "heightMm"), fallback.heightMm, 48, 180),
    widthMm: num(own(raw, "widthMm"), fallback.widthMm, 26, 96),
    depthMm: num(own(raw, "depthMm"), fallback.depthMm, 20, 90),
    visible: bool(own(raw, "visible"), fallback.visible),
  };
  if (Object.hasOwn(raw, "opacity")) {
    const opacity = own(raw, "opacity");
    if (typeof opacity === "number" && Number.isFinite(opacity)) next.opacity = clamp(opacity, 0, 1);
  }
  return next;
}

function sanitizeCap(raw: unknown, fallback: CapState): CapState {
  if (!isRecord(raw) || !knownId("cap", own(raw, "variantId"))) return { ...fallback };
  return {
    variantId: own(raw, "variantId") as string,
    finish: finishOf(own(raw, "finish"), fallback.finish),
    color: colorOf(own(raw, "color"), fallback.color),
    heightMm: num(own(raw, "heightMm"), fallback.heightMm, 10, 78),
    widthMm: num(own(raw, "widthMm"), fallback.widthMm, 16, 48),
    visible: bool(own(raw, "visible"), fallback.visible),
  };
}

function sanitizeLabel(raw: unknown, fallback: LabelState): LabelState {
  if (!isRecord(raw) || !knownId("label", own(raw, "variantId"))) return { ...fallback };
  const text = own(raw, "text");
  return {
    variantId: own(raw, "variantId") as string,
    finish: finishOf(own(raw, "finish"), fallback.finish),
    color: colorOf(own(raw, "color"), fallback.color),
    text: typeof text === "string" ? text.slice(0, 32) : fallback.text,
    scale: num(own(raw, "scale"), fallback.scale, 0.55, 1.6),
    visible: bool(own(raw, "visible"), fallback.visible),
  };
}

function sanitizePump(raw: unknown, fallback: PumpState): PumpState {
  if (!isRecord(raw) || !knownId("pump", own(raw, "variantId"))) return { ...fallback };
  return {
    variantId: own(raw, "variantId") as string,
    finish: finishOf(own(raw, "finish"), fallback.finish),
    color: colorOf(own(raw, "color"), fallback.color),
    visible: bool(own(raw, "visible"), fallback.visible),
  };
}

function sanitizeCollar(raw: unknown, fallback: CollarState): CollarState {
  if (!isRecord(raw) || !knownId("collar", own(raw, "variantId"))) return { ...fallback };
  return {
    variantId: own(raw, "variantId") as string,
    finish: finishOf(own(raw, "finish"), fallback.finish),
    color: colorOf(own(raw, "color"), fallback.color),
    visible: bool(own(raw, "visible"), fallback.visible),
  };
}

function sanitizeBox(raw: unknown, fallback: BoxState): BoxState {
  if (!isRecord(raw) || !knownId("box", own(raw, "variantId"))) return { ...fallback };
  return {
    variantId: own(raw, "variantId") as string,
    finish: finishOf(own(raw, "finish"), fallback.finish),
    color: colorOf(own(raw, "color"), fallback.color),
    heightMm: num(own(raw, "heightMm"), fallback.heightMm, 70, 240),
    widthMm: num(own(raw, "widthMm"), fallback.widthMm, 40, 160),
    depthMm: num(own(raw, "depthMm"), fallback.depthMm, 30, 140),
    linked: bool(own(raw, "linked"), fallback.linked),
    visible: bool(own(raw, "visible"), fallback.visible),
  };
}

function sanitizeLiquid(raw: unknown, fallback: LiquidState): LiquidState {
  if (!isRecord(raw)) return { ...fallback };
  return {
    color: colorOf(own(raw, "color"), fallback.color),
    fill: num(own(raw, "fill"), fallback.fill, 0, 1),
    visible: bool(own(raw, "visible"), fallback.visible),
  };
}

function sanitizeStep(value: unknown, fallback: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 7) return fallback;
  return value;
}

/** Deep-merge a stored design onto the catalog defaults. Never throws. */
export function sanitizeDesign(input: unknown): Design {
  const defaults = createDefaultDesign();
  try {
    if (!isRecord(input)) return defaults;
    const design: Design = {
      bottle: sanitizeBottle(own(input, "bottle"), defaults.bottle),
      cap: sanitizeCap(own(input, "cap"), defaults.cap),
      label: sanitizeLabel(own(input, "label"), defaults.label),
      pump: sanitizePump(own(input, "pump"), defaults.pump),
      collar: sanitizeCollar(own(input, "collar"), defaults.collar),
      box: sanitizeBox(own(input, "box"), defaults.box),
      liquid: sanitizeLiquid(own(input, "liquid"), defaults.liquid),
    };
    const step = sanitizeStep(Object.hasOwn(input, "step") ? own(input, "step") : defaults.step, defaults.step);
    if (step !== undefined) design.step = step;
    return design;
  } catch {
    return defaults;
  }
}

function themeOf(value: unknown, fallback: ThemeId): ThemeId {
  return value === "dark" || value === "light" ? value : fallback;
}

function langOf(value: unknown, fallback: Lang): Lang {
  return value === "he" || value === "en" ? value : fallback;
}

function sanitizeChat(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  const out: ChatMessage[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = own(item, "id");
    const role = own(item, "role");
    if (typeof id !== "string" || !id) continue;
    if (role !== "user" && role !== "lab") continue;
    const message: ChatMessage = { id: id.slice(0, 80), role };
    const text = own(item, "text");
    const he = own(item, "he");
    const en = own(item, "en");
    if (typeof text === "string") message.text = text.slice(0, 2000);
    if (typeof he === "string") message.he = he.slice(0, 2000);
    if (typeof en === "string") message.en = en.slice(0, 2000);
    if (isRecord(own(item, "snapshot"))) message.snapshot = sanitizeDesign(own(item, "snapshot"));
    out.push(message);
    if (out.length >= 40) break;
  }
  return out;
}

function sanitizeSaved(value: unknown, fallback: SavedDesign[]): SavedDesign[] {
  if (!Array.isArray(value)) return fallback;
  const out: SavedDesign[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = own(item, "id");
    const name = own(item, "name");
    const createdAt = own(item, "createdAt");
    if (typeof id !== "string" || !id) continue;
    if (typeof name !== "string") continue;
    if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) continue;
    const thumb = own(item, "thumb");
    out.push({
      id: id.slice(0, 80),
      name: name.slice(0, 80),
      design: sanitizeDesign(own(item, "design")),
      thumb: typeof thumb === "string" ? thumb : "",
      createdAt,
    });
    if (out.length >= 24) break;
  }
  return out;
}

function sanitizeFiles(value: unknown): PendingFile[] {
  if (!Array.isArray(value)) return [];
  const files: PendingFile[] = [];
  for (const file of value) {
    if (!isRecord(file)) continue;
    const name = own(file, "name");
    const type = own(file, "type");
    const size = own(file, "size");
    if (typeof name !== "string" || typeof type !== "string") continue;
    if (typeof size !== "number" || !Number.isFinite(size) || size < 0) continue;
    const next: PendingFile = { name: name.slice(0, 180), type: type.slice(0, 120), size };
    const thumb = own(file, "thumb");
    if (typeof thumb === "string") next.thumb = thumb;
    files.push(next);
    if (files.length >= 12) break;
  }
  return files;
}

function sanitizePending(value: unknown): PendingPart[] {
  if (!Array.isArray(value)) return [];
  const out: PendingPart[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = own(item, "id");
    const name = own(item, "name");
    const category = own(item, "category");
    const createdAt = own(item, "createdAt");
    if (typeof id !== "string" || !id || typeof name !== "string") continue;
    if (typeof category !== "string" || !PENDING_KINDS.has(category)) continue;
    if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) continue;
    out.push({
      id: id.slice(0, 80),
      name: name.slice(0, 80),
      category: category as PendingPart["category"],
      files: sanitizeFiles(own(item, "files")),
      createdAt,
    });
    if (out.length >= 30) break;
  }
  return out;
}

function sanitizeIds(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const ids: string[] = [];
  for (const id of value) {
    if (typeof id !== "string" || !id || ids.includes(id)) continue;
    ids.push(id.slice(0, 80));
    if (ids.length >= 12) break;
  }
  return ids;
}

function sanitizeHistory(value: unknown): Design[] {
  if (!Array.isArray(value)) return [];
  const out: Design[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    out.push(sanitizeDesign(item));
    if (out.length >= 30) break;
  }
  return out;
}

/**
 * Combine a stored blob with the live store. Missing or invalid slots use defaults.
 * A non-object blob leaves the current state alone.
 */
export function mergePersistedLab<T extends HydratedSlice>(persisted: unknown, current: T): T {
  try {
    if (!isRecord(persisted)) return current;
    const next: T = { ...current };
    if (Object.hasOwn(persisted, "design")) next.design = sanitizeDesign(own(persisted, "design"));
    if (Object.hasOwn(persisted, "theme")) next.theme = themeOf(own(persisted, "theme"), current.theme);
    if (Object.hasOwn(persisted, "lang")) next.lang = langOf(own(persisted, "lang"), current.lang);
    if (Object.hasOwn(persisted, "chat")) next.chat = sanitizeChat(own(persisted, "chat"));
    if (Object.hasOwn(persisted, "saved")) next.saved = sanitizeSaved(own(persisted, "saved"), current.saved);
    if (Object.hasOwn(persisted, "pending")) next.pending = sanitizePending(own(persisted, "pending"));
    if (Object.hasOwn(persisted, "compareIds")) next.compareIds = sanitizeIds(own(persisted, "compareIds"), current.compareIds);
    if (Object.hasOwn(persisted, "past")) next.past = sanitizeHistory(own(persisted, "past"));
    if (Object.hasOwn(persisted, "future")) next.future = sanitizeHistory(own(persisted, "future"));
    return next;
  } catch {
    return current;
  }
}

/** Version bumps from the persist middleware. A broken blob becomes an empty object. */
export function migratePersisted(persisted: unknown, version: number): unknown {
  try {
    if (!isRecord(persisted)) return {};
    const state = copyOwn(persisted);
    const design = isRecord(state.design) ? state.design : undefined;
    const cap = design && isRecord(design.cap) ? design.cap : undefined;
    const label = design && isRecord(design.label) ? design.label : undefined;
    if (version < 2 && cap?.variantId === "cap-cyl-32" && label?.text === "Nº 01") {
      state.design = createDefaultDesign();
    }
    if (version < 3) state.theme = "light";
    if (version < 4) state.theme = "dark";
    return state;
  } catch {
    return {};
  }
}

/** Parse a persist entry. Invalid JSON and a missing `state` are ignored. */
export function readStorageValue(raw: string | null): { state: unknown; version?: number } | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !Object.hasOwn(parsed, "state")) return null;
    const version = own(parsed, "version");
    return {
      state: own(parsed, "state"),
      version: typeof version === "number" && Number.isFinite(version) ? version : undefined,
    };
  } catch {
    return null;
  }
}

export function createLabStorage<S>(): PersistStorage<S> {
  return {
    getItem: (name) => {
      try {
        const store = globalThis.localStorage;
        if (!store) return null;
        const parsed = readStorageValue(store.getItem(name));
        if (!parsed) return null;
        return { state: parsed.state as S, version: parsed.version };
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        globalThis.localStorage?.setItem(name, JSON.stringify(value));
      } catch {
        // Private mode or a full disk should not take the lab down.
      }
    },
    removeItem: (name) => {
      try {
        globalThis.localStorage?.removeItem(name);
      } catch {
        // Ignore storage that cannot be written.
      }
    },
  };
}
