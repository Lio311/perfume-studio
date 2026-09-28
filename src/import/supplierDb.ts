import DOMPurify from "dompurify";
import type { PackNotice } from "./notices.ts";
import { checkPack, validatePackText, type PackFileError, type ValidatedPack } from "./packValidate.ts";
import type { SupplierPack } from "./registry.ts";
import { isDataObject, plainData } from "./safeJson.ts";
import { sanitizeSupplierPrice } from "../model/price.ts";

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

export async function loadPacks(): Promise<{ packs: SupplierPack[]; warnings: PackNotice[] }> {
  const db = await openDb();
  const rows = await new Promise<unknown[]>((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as unknown[]);
    request.onerror = () => reject(request.error);
  });
  const revived = rows.map((row) => ({ row, ...reviveStoredPack(row) }));
  const warnings = revived.flatMap((item) => item.warnings);
  const packs = revived.flatMap((item) => (item.pack ? [item.pack] : []));
  packs.sort((a, b) => b.createdAt - a.createdAt);
  await Promise.all(revived.map(async (item) => {
    if (!item.pack) {
      if (isDataObject(item.row) && typeof item.row.id === "string") await deletePack(item.row.id);
      return;
    }
    if (item.warnings.length) await savePack(item.pack);
  }));
  return { packs, warnings };
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

export function downloadPack(pack: SupplierPack): void {
  const blob = new Blob([serializePack(pack)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${pack.name.replace(/\s+/g, "-").toLowerCase() || "supplier"}-pack.json`;
  link.click();
  URL.revokeObjectURL(url);
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
