import DOMPurify from "dompurify";
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

export function reviveStoredPack(raw: unknown): { pack: SupplierPack | null; warnings: PackNotice[] } {
  const checked = checkPack(raw, "drop");
  if (!checked.ok) return { pack: null, warnings: [{ type: "droppedPack" }] };
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

const PACK_EXPORT_KEYS = ["id", "name", "createdAt", "version", "source", "supplier", "parts"] as const;
const PART_EXPORT_KEYS = ["id", "kind", "code", "name", "neck", "widthMm", "heightMm", "depthMm", "capacityMl", "profile", "color", "thumb", "page", "lathe", "price", "mesh", "scan", "measurements"] as const;

function pickKeys(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (Object.hasOwn(source, key) && source[key] !== undefined) out[key] = source[key];
  }
  return out;
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

/**
 * JSON for a strict iOS-style pack: only known pack and part keys.
 * No schema file is in this repo or the budget branch. The allowlist is the
 * fields this importer already understands. A price without an allowed currency
 * is omitted, with a warning. `currencyText` and `hiddenParts` are not written.
 */
export function exportPackDocument(pack: SupplierPack): { text: string; warnings: PackNotice[] } {
  const warnings: PackNotice[] = [];
  const source = pack as unknown as Record<string, unknown>;
  const body = pickKeys(source, PACK_EXPORT_KEYS);
  const parts = Array.isArray(pack.parts) ? pack.parts : [];
  body.parts = parts.map((part) => {
    const row = pickKeys(part as unknown as Record<string, unknown>, PART_EXPORT_KEYS);
    const ref = part.code || part.id || "part";
    if (Object.hasOwn(row, "price")) {
      const price = exportPrice(row.price, ref, warnings);
      if (price) row.price = price;
      else delete row.price;
    }
    return row;
  });
  return { text: JSON.stringify(body, null, 2), warnings };
}

export function downloadPack(pack: SupplierPack): PackNotice[] {
  const result = exportPackDocument(pack);
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
