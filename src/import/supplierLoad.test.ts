import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("dompurify", () => ({
  default: { sanitize: (value: string) => value },
}));

type Row = { id: string };

class Request<T> {
  result!: T;
  error: unknown = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onupgradeneeded: (() => void) | null = null;
  onblocked: (() => void) | null = null;
}

class Store {
  rows: Map<string, unknown>;
  constructor(rows: Map<string, unknown>) {
    this.rows = rows;
  }
  put(value: Row) {
    this.rows.set(value.id, structuredClone(value));
    return done(undefined);
  }
  getAll() {
    return done([...this.rows.values()].map((row) => structuredClone(row)));
  }
  delete(id: string) {
    this.rows.delete(id);
    return done(undefined);
  }
}

class Database {
  rows: Map<string, unknown>;
  objectStoreNames = {
    contains: (name: string) => name === "packs",
  };
  constructor(rows: Map<string, unknown>) {
    this.rows = rows;
  }
  createObjectStore() {
    return new Store(this.rows);
  }
  transaction() {
    return { objectStore: () => new Store(this.rows) };
  }
  close() {}
}

const databases = new Map<string, Map<string, unknown>>();

function done<T>(result: T) {
  const request = new Request<T>();
  request.result = result;
  queueMicrotask(() => request.onsuccess?.());
  return request;
}

const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, String(value)),
  removeItem: (key: string) => memory.delete(key),
  clear: () => memory.clear(),
});
vi.stubGlobal("indexedDB", {
  open(name: string) {
    const request = new Request<Database>();
    const existing = databases.get(name);
    queueMicrotask(() => {
      if (!existing) {
        const rows = new Map<string, unknown>();
        databases.set(name, rows);
        request.result = new Database(rows);
        request.onupgradeneeded?.();
      } else {
        request.result = new Database(existing);
      }
      request.onsuccess?.();
    });
    return request;
  },
  deleteDatabase(name: string) {
    databases.delete(name);
    return done(undefined);
  },
});

import { acknowledgePackLoads, loadPacks } from "./supplierDb.ts";

const mainEra = {
  id: "main-era",
  name: "Old catalog",
  createdAt: 1,
  parts: [{ id: "only", kind: "cap" }],
};

const labBuilt = {
  id: "lab-30",
  name: "Lab",
  createdAt: 2,
  parts: [{
    id: "p1",
    kind: "bottle",
    code: "B",
    name: "Bottle",
    neck: "FEA15",
    widthMm: 30,
    heightMm: 32,
    depthMm: 30,
    capacityMl: null,
    profile: "bottle",
    color: "#c4a15a",
    thumb: "",
    page: 1,
  }],
};

async function put(row: Row) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction().objectStore().put(row);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function openDb(): Promise<Database> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("perfume-lab-suppliers", 1);
    request.onsuccess = () => resolve(request.result as unknown as Database);
    request.onerror = () => reject(request.error);
  });
}

async function stored(): Promise<Record<string, unknown>> {
  const db = await openDb();
  const rows = await new Promise<Row[]>((resolve, reject) => {
    const request = db.transaction().objectStore().getAll();
    request.onsuccess = () => resolve(request.result as Row[]);
    request.onerror = () => reject(request.error);
  });
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

afterEach(() => {
  memory.clear();
  databases.clear();
});

describe("loadPacks", () => {
  it("leaves stored records byte-identical, including an id+kind pack and a 30x32 lab part", async () => {
    await put(mainEra);
    await put(labBuilt);
    const before = JSON.stringify(await stored());

    const first = await loadPacks();
    expect(JSON.stringify(await stored())).toBe(before);
    const old = first.packs.find((pack) => pack.id === "main-era");
    const lab = first.packs.find((pack) => pack.id === "lab-30");
    expect(old?.parts).toEqual([]);
    expect(old?.hiddenParts?.[0].en).toContain("only");
    expect(old?.hiddenParts?.[0].he.length).toBeGreaterThan(0);
    expect(lab?.parts).toEqual([]);
    expect(lab?.hiddenParts?.[0].en).toContain("heightMm");
    expect(lab?.hiddenParts?.[0].en).toContain("between 48 and 180");
    expect(first.warnings.some((notice) => notice.type === "droppedPart" && notice.ref === "B")).toBe(true);

    acknowledgePackLoads(first.unseenKeys);
    const second = await loadPacks();
    expect(JSON.stringify(await stored())).toBe(before);
    expect(second.warnings).toEqual([]);
    expect(second.packs.find((pack) => pack.id === "lab-30")?.hiddenParts?.[0].en).toContain("heightMm");
  });
});
