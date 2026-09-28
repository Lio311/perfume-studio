import DOMPurify from "dompurify";
import { normalizeStoredPack, type PriceWarning } from "./packPrice.ts";
import type { SupplierPack, SupplierPart } from "./registry.ts";

export type { PriceWarning };

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
  const stored = await new Promise<SupplierPack[]>((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as SupplierPack[]).sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error);
  });
  const normalized = stored.map((pack) => normalizeStoredPack(pack));
  await Promise.all(normalized.filter((item) => item.changed).map((item) => savePack(item.pack)));
  return normalized.map((item) => item.pack);
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

export function downloadPack(pack: SupplierPack): void {
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${pack.name.replace(/\s+/g, "-").toLowerCase() || "supplier"}-pack.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function cleanPart(part: SupplierPart): SupplierPart {
  return {
    ...part,
    name: DOMPurify.sanitize(part.name || ""),
    code: DOMPurify.sanitize(part.code || ""),
  };
}

/** A parsed pack plus the price warnings collected while reading it. */
export function parsePackFile(text: string): { pack: SupplierPack; warnings: PriceWarning[] } | null {
  try {
    const value = JSON.parse(text) as SupplierPack & Record<string, unknown>;
    if (!value || typeof value.name !== "string" || !Array.isArray(value.parts)) return null;
    const { id, name, createdAt, parts, ...rest } = value;
    const draft: SupplierPack = {
      ...rest,
      id: typeof id === "string" && id ? id : `pack-${Date.now().toString(36)}`,
      name: DOMPurify.sanitize(name),
      createdAt: typeof createdAt === "number" ? createdAt : Date.now(),
      parts: parts.filter((part) => part && typeof part.id === "string" && typeof part.kind === "string").map((part) => cleanPart(part)),
    };
    const normalized = normalizeStoredPack(draft);
    return { pack: normalized.pack, warnings: normalized.warnings };
  } catch {
    return null;
  }
}
