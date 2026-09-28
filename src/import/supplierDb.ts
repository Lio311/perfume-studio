import DOMPurify from "dompurify";
import { validatePackText, type PackFileError } from "./packValidate.ts";
import type { SupplierPack, SupplierPart } from "./registry.ts";

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

export async function loadPacks(): Promise<SupplierPack[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as SupplierPack[]).sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error);
  });
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
  | { ok: true; pack: SupplierPack }
  | { ok: false; error: PackFileError };

export type { PackFileError };

function sanitizePart(part: Record<string, unknown>): SupplierPart {
  return {
    ...part,
    name: DOMPurify.sanitize(typeof part.name === "string" ? part.name : ""),
    code: DOMPurify.sanitize(typeof part.code === "string" ? part.code : ""),
  } as SupplierPart;
}

export function parsePackFile(text: string): PackFileResult {
  const checked = validatePackText(text);
  if (!checked.ok) return checked;
  const name = DOMPurify.sanitize(checked.value.name);
  if (!name.trim()) {
    return { ok: false, error: { he: "הקובץ נדחה. חסר שם ספק.", en: "The pack was rejected. The supplier name is missing." } };
  }
  const { id, createdAt, parts, rest } = checked.value;
  const pack = {
    ...rest,
    id: typeof id === "string" && id.trim() ? id : `pack-${Date.now().toString(36)}`,
    name,
    createdAt: createdAt ?? Date.now(),
    parts: parts.map(sanitizePart),
  } as SupplierPack;
  return { ok: true, pack };
}
