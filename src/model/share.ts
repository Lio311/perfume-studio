import { createDefaultDesign } from "./design.ts";
import type { Design } from "./types.ts";

const PART_KEYS = ["bottle", "cap", "label", "pump", "collar", "box", "liquid"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Copy known fields when the types match, and keep extra scalar fields from newer links. */
function mergePart<T extends object>(fallback: T, value: unknown): T {
  const next: Record<string, unknown> = { ...(fallback as Record<string, unknown>) };
  if (!isRecord(value)) return next as T;
  for (const [key, fallbackValue] of Object.entries(fallback)) {
    const incoming = value[key];
    if (incoming == null) continue;
    if (typeof fallbackValue === "number") {
      if (typeof incoming === "number" && Number.isFinite(incoming)) next[key] = incoming;
    } else if (typeof fallbackValue === "string") {
      if (typeof incoming === "string") next[key] = incoming;
    } else if (typeof fallbackValue === "boolean") {
      if (typeof incoming === "boolean") next[key] = incoming;
    }
  }
  for (const [key, incoming] of Object.entries(value)) {
    if (key in next || incoming == null) continue;
    const kind = typeof incoming;
    if (kind === "string" || kind === "boolean" || (kind === "number" && Number.isFinite(incoming))) next[key] = incoming;
  }
  return next as T;
}

/**
 * Build a full design from a share payload.
 * Missing or mistyped parts keep the current defaults.
 * Returns null when the payload is not a design object.
 * A missing `step` stays unset so an older link does not reopen the wizard.
 */
export function mergeShareDesign(input: unknown): Design | null {
  if (!isRecord(input)) return null;
  const hasPart = PART_KEYS.some((key) => key in input);
  if (!hasPart && !("step" in input)) return null;
  const base = createDefaultDesign();
  const design: Design = {
    bottle: mergePart(base.bottle, input.bottle),
    cap: mergePart(base.cap, input.cap),
    label: mergePart(base.label, input.label),
    pump: mergePart(base.pump, input.pump),
    collar: mergePart(base.collar, input.collar),
    box: mergePart(base.box, input.box),
    liquid: mergePart(base.liquid, input.liquid),
  };
  if (typeof input.step === "number" && Number.isFinite(input.step)) design.step = input.step;
  return design;
}

export function encodeShareDesign(design: Design): string {
  const json = JSON.stringify(design);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeShareDesign(hash: string): Design | null {
  try {
    const base = hash.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base.length % 4 === 0 ? "" : "=".repeat(4 - (base.length % 4));
    const json = decodeURIComponent(escape(atob(base + pad)));
    return mergeShareDesign(JSON.parse(json) as unknown);
  } catch {
    return null;
  }
}
