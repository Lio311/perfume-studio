import type { SupplierPack } from "./registry.ts";

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

export function downloadPack(pack: SupplierPack): void {
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${pack.name.replace(/\s+/g, "-").toLowerCase() || "supplier"}-pack.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function parsePackFile(text: string): SupplierPack | null {
  try {
    const value = JSON.parse(text) as SupplierPack;
    if (!value || typeof value.name !== "string" || !Array.isArray(value.parts)) return null;
    return {
      id: value.id || `pack-${Date.now().toString(36)}`,
      name: value.name,
      createdAt: value.createdAt || Date.now(),
      parts: value.parts.filter((part) => part && typeof part.id === "string" && typeof part.kind === "string"),
    };
  } catch {
    return null;
  }
}
