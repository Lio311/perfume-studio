import type { PersistStorage } from "zustand/middleware";
import { BOTTLES } from "../model/bottles.ts";
import { CAPS } from "../model/caps.ts";
import { hydrateBox } from "../model/boxFields.ts";
import { createDefaultDesign } from "../model/design.ts";
import { BOXES } from "../model/hardware.ts";
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

/** Persist schema. Version 6 is reserved for a later change. */
export const LAB_PERSIST_VERSION = 5;

const SANITIZED_KEYS = new Set(["design", "theme", "lang", "chat", "saved", "pending", "compareIds", "past", "future"]);

/** Live UI fields. They are not part of a saved design and must not come back from storage. */
const EPHEMERAL_KEYS = new Set([
  "selected", "hovered", "mode", "explode", "viewPreset", "gesturing", "autoRotate",
  "viewToken", "focusToken", "libraryOpen", "sideOpen", "modal", "units", "suppliers",
  "voice", "soundOn", "stage", "blueprint", "fullToken", "aimed", "solo", "present",
  "exporting", "palette", "help", "boxOpen", "toast",
]);

let storageWritesOpen = true;

/** Ignore later persist writes. A design reset uses this so a queued write cannot restore the old blob. */
export function pauseLabStorageWrites(): void {
  storageWritesOpen = false;
}

/** Tests resume writes after a reset that does not actually reload the page. */
export function resumeLabStorageWrites(): void {
  storageWritesOpen = true;
}

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

function idString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!id || id.length > 80) return null;
  return id;
}

/** A finite number inside the inclusive range. Out of range is missing, not clamped into another bottle. */
function ranged(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return undefined;
  return value;
}

function withOpacity(raw: Record<string, unknown>, next: BottleState): BottleState {
  if (!Object.hasOwn(raw, "opacity")) return next;
  const opacity = own(raw, "opacity");
  if (typeof opacity !== "number" || !Number.isFinite(opacity)) return next;
  return { ...next, opacity: clamp(opacity, 0, 1) };
}

function inferBottleId(raw: Record<string, unknown>): string | null {
  const heightMm = ranged(own(raw, "heightMm"), 48, 180);
  const widthMm = ranged(own(raw, "widthMm"), 26, 96);
  const depthMm = ranged(own(raw, "depthMm"), 20, 90);
  if (heightMm == null || widthMm == null || depthMm == null) return null;
  const neck = own(raw, "neck");
  const matches = BOTTLES.filter((item) => {
    if (item.heightMm !== heightMm || item.widthMm !== widthMm || item.depthMm !== depthMm) return false;
    return !isNeck(neck) || item.neck === neck;
  });
  return matches.length === 1 ? matches[0].id : null;
}

function inferCapId(raw: Record<string, unknown>): string | null {
  const heightMm = ranged(own(raw, "heightMm"), 10, 78);
  const widthMm = ranged(own(raw, "widthMm"), 16, 48);
  if (heightMm == null || widthMm == null) return null;
  const matches = CAPS.filter((item) => item.heightMm === heightMm && item.widthMm === widthMm);
  return matches.length === 1 ? matches[0].id : null;
}

/**
 * Ids are not checked against the catalog here. Supplier packs load after the
 * store is created, so an imported id must be kept when the slot already has a
 * valid shape. A known built-in bottle or cap fills its own missing dimensions.
 */
function sanitizeBottle(raw: unknown, fallback: BottleState): BottleState {
  if (!isRecord(raw)) return { ...fallback };
  let id = idString(own(raw, "variantId"));
  if (!id) {
    id = inferBottleId(raw);
    if (!id) return { ...fallback };
  }
  const spec = BOTTLES.find((item) => item.id === id);
  const finish = finishOf(own(raw, "finish"), fallback.finish);
  const color = colorOf(own(raw, "color"), fallback.color);
  const visible = bool(own(raw, "visible"), fallback.visible);
  if (spec) {
    return withOpacity(raw, {
      variantId: spec.id,
      neck: isNeck(own(raw, "neck")) ? (own(raw, "neck") as NeckId) : spec.neck,
      finish,
      color,
      heightMm: ranged(own(raw, "heightMm"), 48, 180) ?? spec.heightMm,
      widthMm: ranged(own(raw, "widthMm"), 26, 96) ?? spec.widthMm,
      depthMm: ranged(own(raw, "depthMm"), 20, 90) ?? spec.depthMm,
      visible,
    });
  }
  const neck = own(raw, "neck");
  const heightMm = ranged(own(raw, "heightMm"), 48, 180);
  const widthMm = ranged(own(raw, "widthMm"), 26, 96);
  const depthMm = ranged(own(raw, "depthMm"), 20, 90);
  if (!isNeck(neck) || heightMm == null || widthMm == null || depthMm == null) return { ...fallback };
  return withOpacity(raw, {
    variantId: id,
    neck,
    finish,
    color,
    heightMm,
    widthMm,
    depthMm,
    visible,
  });
}

function sanitizeCap(raw: unknown, fallback: CapState): CapState {
  if (!isRecord(raw)) return { ...fallback };
  let id = idString(own(raw, "variantId"));
  if (!id) {
    id = inferCapId(raw);
    if (!id) return { ...fallback };
  }
  const spec = CAPS.find((item) => item.id === id);
  const finish = finishOf(own(raw, "finish"), fallback.finish);
  const color = colorOf(own(raw, "color"), fallback.color);
  const visible = bool(own(raw, "visible"), fallback.visible);
  if (spec) {
    return {
      variantId: spec.id,
      finish,
      color,
      heightMm: ranged(own(raw, "heightMm"), 10, 78) ?? spec.heightMm,
      widthMm: ranged(own(raw, "widthMm"), 16, 48) ?? spec.widthMm,
      visible,
    };
  }
  const heightMm = ranged(own(raw, "heightMm"), 10, 78);
  const widthMm = ranged(own(raw, "widthMm"), 16, 48);
  if (heightMm == null || widthMm == null) return { ...fallback };
  return { variantId: id, finish, color, heightMm, widthMm, visible };
}

function sanitizeLabel(raw: unknown, fallback: LabelState): LabelState {
  if (!isRecord(raw)) return { ...fallback };
  const id = idString(own(raw, "variantId"));
  if (!id) return { ...fallback };
  const text = own(raw, "text");
  return {
    variantId: id,
    finish: finishOf(own(raw, "finish"), fallback.finish),
    color: colorOf(own(raw, "color"), fallback.color),
    text: typeof text === "string" ? text.slice(0, 32) : fallback.text,
    scale: num(own(raw, "scale"), fallback.scale, 0.55, 1.6),
    visible: bool(own(raw, "visible"), fallback.visible),
  };
}

function sanitizePump(raw: unknown, fallback: PumpState): PumpState {
  if (!isRecord(raw)) return { ...fallback };
  const id = idString(own(raw, "variantId"));
  if (!id) return { ...fallback };
  return {
    variantId: id,
    finish: finishOf(own(raw, "finish"), fallback.finish),
    color: colorOf(own(raw, "color"), fallback.color),
    visible: bool(own(raw, "visible"), fallback.visible),
  };
}

function sanitizeCollar(raw: unknown, fallback: CollarState): CollarState {
  if (!isRecord(raw)) return { ...fallback };
  const id = idString(own(raw, "variantId"));
  if (!id) return { ...fallback };
  return {
    variantId: id,
    finish: finishOf(own(raw, "finish"), fallback.finish),
    color: colorOf(own(raw, "color"), fallback.color),
    visible: bool(own(raw, "visible"), fallback.visible),
  };
}

type BoxCore = Pick<BoxState, "variantId" | "finish" | "color" | "heightMm" | "widthMm" | "depthMm" | "linked" | "visible">;

function sanitizeBox(raw: unknown, fallback: BoxState): BoxCore {
  if (!isRecord(raw)) return { ...fallback };
  const id = idString(own(raw, "variantId"));
  if (!id) return { ...fallback };
  const known = BOXES.some((item) => item.id === id);
  const heightMm = ranged(own(raw, "heightMm"), 70, 240);
  const widthMm = ranged(own(raw, "widthMm"), 40, 160);
  const depthMm = ranged(own(raw, "depthMm"), 30, 140);
  if (!known && (heightMm == null || widthMm == null || depthMm == null)) return { ...fallback };
  return {
    variantId: id,
    finish: finishOf(own(raw, "finish"), fallback.finish),
    color: colorOf(own(raw, "color"), fallback.color),
    heightMm: heightMm ?? fallback.heightMm,
    widthMm: widthMm ?? fallback.widthMm,
    depthMm: depthMm ?? fallback.depthMm,
    linked: bool(own(raw, "linked"), fallback.linked),
    visible: bool(own(raw, "visible"), fallback.visible),
  };
}

/** Keep the pack fields `sanitizeBox` does not know about, then let the box validator clamp them. */
function packedBox(raw: unknown, fallback: BoxState): BoxState {
  const safe = sanitizeBox(raw, fallback);
  if (!isRecord(raw)) return hydrateBox(safe);
  return hydrateBox({ ...(raw as Partial<BoxState>), ...safe });
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
      box: packedBox(own(input, "box"), defaults.box),
      liquid: sanitizeLiquid(own(input, "liquid"), defaults.liquid),
    };
    if (Object.hasOwn(input, "step")) {
      const step = sanitizeStep(own(input, "step"), undefined);
      if (step !== undefined) design.step = step;
    }
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
    const next: Record<string, unknown> = { ...(current as unknown as Record<string, unknown>) };
    for (const key of Object.keys(persisted)) {
      if (SANITIZED_KEYS.has(key) || EPHEMERAL_KEYS.has(key)) continue;
      const value = own(persisted, key);
      if (value !== undefined) next[key] = value;
    }
    if (Object.hasOwn(persisted, "design")) next.design = sanitizeDesign(own(persisted, "design"));
    if (Object.hasOwn(persisted, "theme")) next.theme = themeOf(own(persisted, "theme"), current.theme);
    if (Object.hasOwn(persisted, "lang")) next.lang = langOf(own(persisted, "lang"), current.lang);
    if (Object.hasOwn(persisted, "chat")) next.chat = sanitizeChat(own(persisted, "chat"));
    if (Object.hasOwn(persisted, "saved")) next.saved = sanitizeSaved(own(persisted, "saved"), current.saved);
    if (Object.hasOwn(persisted, "pending")) next.pending = sanitizePending(own(persisted, "pending"));
    if (Object.hasOwn(persisted, "compareIds")) next.compareIds = sanitizeIds(own(persisted, "compareIds"), current.compareIds);
    if (Object.hasOwn(persisted, "past")) next.past = sanitizeHistory(own(persisted, "past"));
    if (Object.hasOwn(persisted, "future")) next.future = sanitizeHistory(own(persisted, "future"));
    return next as T;
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
    if (version < 5 && isRecord(state.design)) {
      const design = copyOwn(state.design);
      const bottle = isRecord(design.bottle) ? copyOwn(design.bottle) : null;
      const step = own(design, "step");
      const untouched = !Object.hasOwn(design, "step") || step === 0;
      if (bottle?.variantId === "cara-50" && bottle.visible === false && untouched) {
        bottle.visible = true;
        design.bottle = bottle;
        state.design = design;
      }
    }
    return state;
  } catch {
    return {};
  }
}

/**
 * Parse a persist entry. Invalid JSON is ignored.
 * Accepts the zustand envelope `{state, version}` and a raw state object
 * such as `{design:{bottle:{},cap:{}}}`.
 */
export function readStorageValue(raw: string | null): { state: unknown; version?: number } | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (Object.hasOwn(parsed, "state")) {
      const version = own(parsed, "version");
      const value: { state: unknown; version?: number } = { state: own(parsed, "state") };
      if (typeof version === "number" && Number.isFinite(version)) value.version = version;
      return value;
    }
    if (Object.hasOwn(parsed, "design") || Object.hasOwn(parsed, "theme") || Object.hasOwn(parsed, "lang")) {
      return { state: parsed };
    }
    return null;
  } catch {
    return null;
  }
}

/** Drop live UI fields and keep every other top-level value, including ones this version does not know yet. */
export function partializeLabState(state: object): Record<string, unknown> {
  const source = state as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (EPHEMERAL_KEYS.has(key) || key === "past" || key === "future") continue;
    if (typeof source[key] === "function") continue;
    out[key] = source[key];
  }
  return out;
}

/**
 * Design, UI defaults, and undo history are replaced. Saved sketches, chat, and
 * pending uploads stay. Further persist writes are paused so they cannot put the old blob back.
 */
export function resetPersistedPayload(current: unknown): { state: Record<string, unknown>; version: number } {
  pauseLabStorageWrites();
  const record = isRecord(current) ? current : {};
  const state: Record<string, unknown> = {
    design: createDefaultDesign(),
    theme: "dark",
    lang: "he",
    chat: record.chat ?? [],
    saved: record.saved ?? [],
    pending: record.pending ?? [],
    compareIds: ["seed-atelier", "seed-blush", "seed-noir"],
    past: [],
    future: [],
  };
  for (const key of Object.keys(record)) {
    if (SANITIZED_KEYS.has(key) || EPHEMERAL_KEYS.has(key)) continue;
    const value = own(record, key);
    if (value !== undefined) state[key] = value;
  }
  return { state, version: LAB_PERSIST_VERSION };
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
      if (!storageWritesOpen) return;
      try {
        const store = globalThis.localStorage;
        if (!store) return;
        store.setItem(name, JSON.stringify(value));
      } catch (error) {
        console.error(error);
        throw error;
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
