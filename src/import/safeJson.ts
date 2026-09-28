const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function isDataObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function copyValue(value: unknown): unknown {
  if (value === null) return null;
  const kind = typeof value;
  if (kind === "string" || kind === "boolean") return value;
  if (kind === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) {
      const copied = copyValue(item);
      if (copied !== undefined) items.push(copied);
    }
    return items;
  }
  if (isDataObject(value)) return safeRecord(value);
  return undefined;
}

/** Copy own data, skipping keys that change an object's prototype. */
export function safeRecord(value: object): Record<string, unknown> {
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(value, key) || BLOCKED_KEYS.has(key)) continue;
    const copied = copyValue((value as Record<string, unknown>)[key]);
    if (copied !== undefined) out[key] = copied;
  }
  return out;
}

/** Same filter as `safeRecord`, written onto an ordinary object so equality and JSON stay plain. */
export function plainData<T = unknown>(value: unknown): T {
  return copyPlain(value) as T;
}

function copyPlain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => copyPlain(item));
  if (!isDataObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(value, key) || BLOCKED_KEYS.has(key)) continue;
    const copied = copyPlain(value[key]);
    if (copied !== undefined) out[key] = copied;
  }
  return out;
}
