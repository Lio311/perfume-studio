export const SCAN_PACK_KEY = "perfume-scan-pack";
const DB_NAME = "perfume-lab-suppliers";
const STORE = "packs";

export function saveScanPack(pack: { id: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const put = request.result.transaction(STORE, "readwrite").objectStore(STORE).put(pack);
      put.onsuccess = () => resolve();
      put.onerror = () => reject(put.error);
    };
  });
}

export function rememberPack(id: string) {
  sessionStorage.setItem(SCAN_PACK_KEY, id);
}

export function configuratorUrl(): string {
  const url = new URL(location.href);
  url.pathname = url.pathname.replace(/\/scan\/?$/, "/") || "/";
  url.search = "";
  url.hash = "";
  return url.href;
}
