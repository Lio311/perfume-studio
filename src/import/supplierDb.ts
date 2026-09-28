import DOMPurify from "dompurify";
import { bdi, ltr } from "./fieldText.ts";
import type { PackNotice } from "./notices.ts";
import { checkPack, validatePackText, type PackFileError, type ValidatedPack } from "./packValidate.ts";
import type { SupplierPack } from "./registry.ts";
import { isDataObject, plainData } from "./safeJson.ts";
import { sanitizeSupplierPrice, type SupplierPrice } from "../model/price.ts";

export { sanitizeSupplierPrice };
export type { PriceIssue, SupplierPriceResult } from "../model/price.ts";

const DB_NAME = "perfume-lab-suppliers";
const STORE = "packs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function shellForInvalidPack(raw: unknown, error: { he: string; en: string }): SupplierPack | null {
  if (!isDataObject(raw) || typeof raw.id !== "string" || !raw.id.trim()) return null;
  const id = raw.id.trim();
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : id;
  const createdAt = typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt) && raw.createdAt >= 0 ? raw.createdAt : 0;
  return {
    id,
    name,
    createdAt,
    parts: [],
    unreadable: true,
    hiddenParts: [{ id, code: "", name, he: error.he, en: error.en }],
  };
}

export function reviveStoredPack(raw: unknown): { pack: SupplierPack | null; warnings: PackNotice[] } {
  const checked = checkPack(raw, "drop");
  if (!checked.ok) return { pack: shellForInvalidPack(raw, checked.error), warnings: [{ type: "droppedPack" }] };
  return { pack: materialize(checked.value), warnings: checked.warnings };
}

/** True when an empty lab should take the result of `loadPacks()`. */
export function adoptLoadedSuppliers(
  loaded: { packs: readonly unknown[]; warnings: readonly unknown[] },
  suppliersAlreadyLoaded: number,
): boolean {
  return suppliersAlreadyLoaded === 0 && (loaded.packs.length > 0 || loaded.warnings.length > 0);
}

const SEEN_WARNINGS_KEY = "perfume-lab-seen-pack-warnings";

function packSeenKey(id: string, version: unknown): string {
  return `${id}@${typeof version === "number" ? version : 0}`;
}

function readSeenWarnings(): Set<string> {
  try {
    if (typeof localStorage === "undefined") return new Set();
    const raw = localStorage.getItem(SEEN_WARNINGS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function writeSeenWarnings(keys: Set<string>) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(SEEN_WARNINGS_KEY, JSON.stringify([...keys]));
  } catch {
    // A private window can refuse storage. The record itself is still left untouched.
  }
}

/** Remember that this pack version's load warnings were shown, so the next load stays quiet. */
export function markPackWarningsSeen(pack: { id: string; version?: number }) {
  acknowledgePackLoads([packSeenKey(pack.id, pack.version)]);
}

/** Call only after the warnings were actually put on screen. A discarded load must not consume them. */
export function acknowledgePackLoads(keys: readonly string[]) {
  if (!keys.length) return;
  const seen = readSeenWarnings();
  for (const key of keys) seen.add(key);
  writeSeenWarnings(seen);
}

export async function loadPacks(): Promise<{ packs: SupplierPack[]; warnings: PackNotice[]; unseenKeys: string[] }> {
  const db = await openDb();
  const rows = await new Promise<unknown[]>((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as unknown[]);
    request.onerror = () => reject(request.error);
  });
  const revived = rows.map((row) => ({ row, ...reviveStoredPack(row) }));
  const seen = readSeenWarnings();
  const warnings: PackNotice[] = [];
  const unseenKeys: string[] = [];
  const packs: SupplierPack[] = [];
  for (const item of revived) {
    if (item.pack) packs.push(item.pack);
    if (!item.warnings.length) continue;
    const id = isDataObject(item.row) && typeof item.row.id === "string" ? item.row.id : "";
    const version = isDataObject(item.row) ? item.row.version : undefined;
    const key = id ? packSeenKey(id, version) : "";
    if (key && seen.has(key)) continue;
    warnings.push(...item.warnings);
    if (key) unseenKeys.push(key);
  }
  packs.sort((a, b) => b.createdAt - a.createdAt);
  return { packs, warnings, unseenKeys };
}

export async function savePack(pack: SupplierPack): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(pack);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deletePack(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function serializePack(pack: SupplierPack): string {
  return JSON.stringify(pack, null, 2);
}

const PACK_EXPORT_KEYS = ["id", "name", "createdAt", "version", "source", "generator", "supplier", "parts"] as const;
const PART_EXPORT_KEYS = ["id", "kind", "code", "name", "neck", "widthMm", "heightMm", "depthMm", "capacityMl", "profile", "color", "thumb", "page", "lathe", "source", "names", "neckFinish", "notes", "price", "measurements", "scan", "mesh", "params"] as const;
const GENERATOR_KEYS = ["name", "version", "exportedAt"] as const;
const SUPPLIER_KEYS = ["company", "booth", "event", "country", "contactName", "role", "email", "phone", "whatsapp", "wechat", "website", "notes", "businessCard"] as const;
const CARD_KEYS = ["dataUri", "bundlePath", "ocrText"] as const;
const NAME_KEYS = ["he", "en"] as const;
const MEASUREMENT_KEYS = ["key", "value", "source", "toleranceMm"] as const;
const SCAN_KEYS = ["method", "capturedAt", "device", "appVersion", "material", "scale", "referenceObject", "confidence", "neckSuggestion"] as const;
const NECK_SUGGESTION_KEYS = ["suggested", "confidence", "measuredMm", "basis", "confirmedByUser"] as const;
const MESH_KEYS = ["format", "url", "dataUri", "bundlePath", "units", "upAxis", "origin", "triangles", "bytes", "sha256"] as const;
const PARAM_KEYS = ["section", "profile", "shoulder", "softness", "faceted", "overhangMm", "style", "radiusFactor", "nozzleMm", "wallMm", "rings", "knurl", "flareMm", "form", "padMm", "liftMm"] as const;

function pickKeys(source: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (!isDataObject(source)) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (Object.hasOwn(source, key) && source[key] !== undefined) out[key] = source[key];
  }
  return Object.keys(out).length ? out : undefined;
}

function assignNested(row: Record<string, unknown>, key: string, keys: readonly string[]) {
  if (!Object.hasOwn(row, key)) return;
  const nested = pickKeys(row[key], keys);
  if (nested) row[key] = nested;
  else delete row[key];
}

function exportPrice(raw: unknown, ref: string, warnings: PackNotice[]): SupplierPrice | undefined {
  const checked = sanitizeSupplierPrice(raw);
  if (!checked.price || checked.unpriced || !checked.price.currency) {
    const issue = checked.issues.find((item) => item.code === "price_currency") ?? checked.issues[0];
    warnings.push({
      type: "priceIssue",
      ref,
      path: issue?.path ?? "currency",
      code: issue?.code ?? "price_currency",
      severity: "warning",
      he: issue?.he ?? "אין מטבע תקין, ולכן המחיר לא יוצא.",
      en: issue?.en ?? "There is no valid currency, so the price was left out of the export.",
    });
    return undefined;
  }
  const price: SupplierPrice = { value: checked.price.value, currency: checked.price.currency };
  if (checked.price.moq !== undefined) price.moq = checked.price.moq;
  if (checked.price.tiers) price.tiers = checked.price.tiers.map((tier) => ({ minQty: tier.minQty, value: tier.value }));
  if (checked.price.quotedAt) price.quotedAt = checked.price.quotedAt;
  return price;
}

function exportSupplier(raw: unknown): Record<string, unknown> | undefined {
  const supplier = pickKeys(raw, SUPPLIER_KEYS);
  if (!supplier) return undefined;
  assignNested(supplier, "businessCard", CARD_KEYS);
  return supplier;
}

function exportMeasurements(raw: unknown): unknown[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.flatMap((item) => {
    const row = pickKeys(item, MEASUREMENT_KEYS);
    return row ? [row] : [];
  });
}

function exportScan(raw: unknown): Record<string, unknown> | undefined {
  const scan = pickKeys(raw, SCAN_KEYS);
  if (!scan) return undefined;
  assignNested(scan, "neckSuggestion", NECK_SUGGESTION_KEYS);
  return scan;
}

function exportPart(part: SupplierPack["parts"][number], warnings: PackNotice[]): Record<string, unknown> {
  const raw = part as unknown as Record<string, unknown>;
  const row = pickKeys(raw, PART_EXPORT_KEYS) ?? {};
  assignNested(row, "names", NAME_KEYS);
  if (Object.hasOwn(row, "scan")) {
    const scan = exportScan(row.scan);
    if (scan) row.scan = scan;
    else delete row.scan;
  }
  assignNested(row, "mesh", MESH_KEYS);
  assignNested(row, "params", PARAM_KEYS);
  if (Object.hasOwn(row, "measurements")) {
    const measurements = exportMeasurements(row.measurements);
    if (measurements) row.measurements = measurements;
    else delete row.measurements;
  }
  const ref = part.code || part.id || "part";
  if (Object.hasOwn(row, "price")) {
    const price = exportPrice(row.price, ref, warnings);
    if (price) row.price = price;
    else delete row.price;
  }
  return row;
}

/**
 * JSON for `schema/supplier-pack.schema.json` (`additionalProperties: false`).
 * Only keys declared there are written. A price without an allowed currency is
 * omitted, with a warning, because `$defs/Price` requires `value` and `currency`.
 * `currencyText` and `hiddenParts` are not in the schema.
 */
export function exportPackDocument(pack: SupplierPack): { text: string; warnings: PackNotice[] } {
  if (pack.unreadable) return { text: "", warnings: [{ type: "unreadableExport" }] };
  const warnings: PackNotice[] = [];
  const source = pack as unknown as Record<string, unknown>;
  const body = pickKeys(source, PACK_EXPORT_KEYS) ?? {};
  assignNested(body, "generator", GENERATOR_KEYS);
  if (Object.hasOwn(body, "supplier")) {
    const supplier = exportSupplier(body.supplier);
    if (supplier) body.supplier = supplier;
    else delete body.supplier;
  }
  const parts = Array.isArray(pack.parts) ? pack.parts : [];
  body.parts = parts.map((part) => exportPart(part, warnings));
  warnings.push(...hiddenExportNotices(pack));
  return { text: JSON.stringify(body, null, 2), warnings };
}

const HIDDEN_EXPORT_EACH = 8;

function hiddenExportNotices(pack: SupplierPack): PackNotice[] {
  const hidden = pack.hiddenParts;
  const selfOnly = pack.unreadable
    || (pack.parts.length === 0 && hidden?.length === 1 && hidden[0].id === pack.id);
  if (selfOnly || !hidden?.length) return [];
  if (hidden.length > HIDDEN_EXPORT_EACH) {
    return [{
      type: "droppedPart",
      ref: String(hidden.length),
      he: `${bdi(hidden.length)} חלקים מוסתרים לא נכללו בייצוא.`,
      en: `${bdi(hidden.length)} hidden parts were left out of the export.`,
    }];
  }
  return hidden.map((part) => {
    const token = part.name ? bdi(part.name) : ltr(part.code || part.id);
    const reasonHe = part.he ? ` ${part.he}` : "";
    const reasonEn = part.en ? ` ${part.en}` : "";
    return {
      type: "droppedPart",
      ref: part.code || part.name || part.id,
      he: `${token} לא נכלל בייצוא.${reasonHe}`,
      en: `${token} was left out of the export.${reasonEn}`,
    };
  });
}

export function downloadPack(pack: SupplierPack): PackNotice[] {
  const result = exportPackDocument(pack);
  if (pack.unreadable || !result.text) return result.warnings;
  const blob = new Blob([result.text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${pack.name.replace(/\s+/g, "-").toLowerCase() || "supplier"}-pack.json`;
  link.click();
  URL.revokeObjectURL(url);
  return result.warnings;
}

export type PackFileResult =
  | { ok: true; pack: SupplierPack; warnings: PackNotice[] }
  | { ok: false; error: PackFileError };

export type { PackFileError };

function materialize(value: ValidatedPack): SupplierPack {
  const pack = plainData<Record<string, unknown>>(value.rest);
  pack.id = typeof value.id === "string" && value.id.trim() ? value.id : `pack-${Date.now().toString(36)}`;
  pack.name = DOMPurify.sanitize(value.name);
  pack.createdAt = value.createdAt ?? Date.now();
  pack.parts = value.parts.map((part) => {
    const next = plainData<Record<string, unknown>>(part);
    next.name = DOMPurify.sanitize(typeof next.name === "string" ? next.name : "");
    next.code = DOMPurify.sanitize(typeof next.code === "string" ? next.code : "");
    return next;
  });
  if (value.hidden.length) pack.hiddenParts = value.hidden;
  return pack as unknown as SupplierPack;
}

export function parsePackFile(text: string): PackFileResult {
  const checked = validatePackText(text);
  if (!checked.ok) return checked;
  const pack = materialize(checked.value);
  if (!pack.name.trim()) {
    return { ok: false, error: { he: "הקובץ נדחה. חסר שם ספק.", en: "The pack was rejected. The supplier name is missing." } };
  }
  return { ok: true, pack, warnings: checked.warnings };
}
