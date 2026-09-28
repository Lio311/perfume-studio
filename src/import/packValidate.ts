import { tx } from "../i18n/copy.ts";
import { isBuiltinCatalogId } from "../model/catalog.ts";
import { isNeckId } from "../model/necks.ts";
import { sanitizeSupplierPrice } from "../model/price.ts";
import type { VariantPart } from "../model/types.ts";
import type { PackNotice } from "./notices.ts";
import type { ImportProfile } from "./parseCatalog.ts";
import { isVariantPart } from "./registry.ts";
import { isDataObject, plainData, safeRecord } from "./safeJson.ts";

export interface PackFileError {
  he: string;
  en: string;
}

export interface ValidatedPack {
  id: unknown;
  name: string;
  createdAt: number | undefined;
  parts: Array<Record<string, unknown>>;
  rest: Record<string, unknown>;
}

export type PackCheck =
  | { ok: true; value: ValidatedPack; warnings: PackNotice[] }
  | { ok: false; error: PackFileError };

export const MAX_PACK_BYTES = 5 * 1024 * 1024;
const MAX_ISSUES = 10;
const LATHE_MAX = 1.2;

const SOURCES = new Set(["pdf", "photo", "scan", "manual"]);

const PROFILES: readonly ImportProfile[] = [
  "cylinder",
  "cube",
  "sphere",
  "taper",
  "dome",
  "bottle",
  "rect-bottle",
  "box",
  "label",
  "pump",
  "collar",
];

/**
 * Inclusive millimetre bounds.
 * Bottle, cap, and box match the lab size clamps. Pump height matches the stock actuators
 * (8–18). Collar height spans the stock collars (5.4–11). Labels have no stock millimetres,
 * so their axes only reject absurd sizes.
 */
const MM: Record<VariantPart, { widthMm: readonly [number, number]; heightMm: readonly [number, number]; depthMm: readonly [number, number] }> = {
  bottle: { widthMm: [26, 96], heightMm: [48, 180], depthMm: [20, 90] },
  cap: { widthMm: [16, 48], heightMm: [10, 78], depthMm: [16, 48] },
  box: { widthMm: [40, 160], heightMm: [70, 240], depthMm: [30, 140] },
  pump: { widthMm: [8, 48], heightMm: [8, 18], depthMm: [8, 48] },
  collar: { widthMm: [8, 48], heightMm: [5, 12], depthMm: [8, 48] },
  label: { widthMm: [8, 160], heightMm: [8, 160], depthMm: [0, 160] },
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const THUMB = /^data:image\/(jpeg|png|webp);base64,/;

function fileError(): PackFileError {
  return { he: tx("he").packNotPack, en: tx("en").packNotPack };
}

function tooBig(): PackFileError {
  return { he: tx("he").packTooBig, en: tx("en").packTooBig };
}

function missingName(): PackFileError {
  return { he: tx("he").packMissingName, en: tx("en").packMissingName };
}

function partRef(part: Record<string, unknown>): string {
  if (typeof part.code === "string" && part.code.trim()) return part.code.trim();
  if (typeof part.id === "string" && part.id.trim()) return part.id.trim();
  return "";
}

function hePart(ref: string): string {
  return ref ? `החלק ${ref}` : "חלק";
}

function enPart(ref: string): string {
  return ref ? `Part ${ref}` : "A part";
}

function reject(issues: PackFileError[]): PackFileError {
  const shown = issues.slice(0, MAX_ISSUES);
  const extra = issues.length - shown.length;
  const heMore = extra > 0 ? ` ${tx("he").packAndMore.replace("{n}", String(extra))}` : "";
  const enMore = extra > 0 ? ` ${tx("en").packAndMore.replace("{n}", String(extra))}` : "";
  return {
    he: `${tx("he").packRejected} ${shown.map((item) => item.he).join(" ")}${heMore}`,
    en: `${tx("en").packRejected} ${shown.map((item) => item.en).join(" ")}${enMore}`,
  };
}

function isVersion(value: unknown): value is 2 {
  return typeof value === "number" && Number.isInteger(value) && value === 2;
}

function isSource(value: unknown): value is string {
  return typeof value === "string" && SOURCES.has(value);
}

function validatePart(raw: unknown): PackFileError[] {
  if (!isDataObject(raw)) {
    return [{ he: "אחד החלקים אינו אובייקט.", en: "One of the parts is not an object." }];
  }
  const ref = partRef(raw);
  const he = hePart(ref);
  const en = enPart(ref);
  const issues: PackFileError[] = [];

  if (typeof raw.id !== "string" || raw.id.trim() === "") {
    issues.push({ he: `${he}: חסר מזהה.`, en: `${en}: missing id.` });
  }
  if (!isVariantPart(raw.kind)) {
    const shown = typeof raw.kind === "string" && raw.kind ? raw.kind : "—";
    issues.push({
      he: `${he}: הסוג «${shown}» אינו מוכר, ולכן החלק נדחה ולא יהפוך לקופסה. הסוגים הנתמכים הם בקבוק, פקק, תווית, משאבה, צווארון וקופסה.`,
      en: `${en}: kind "${shown}" is not supported, so the part was rejected and will not become a box. Supported kinds are bottle, cap, label, pump, collar, and box.`,
    });
  }
  if (typeof raw.code !== "string") {
    issues.push({ he: `${he}: חסר קוד.`, en: `${en}: missing code.` });
  }
  if (typeof raw.name !== "string") {
    issues.push({ he: `${he}: חסר שם.`, en: `${en}: missing name.` });
  }
  if (raw.neck !== null && !isNeckId(raw.neck)) {
    const shown = typeof raw.neck === "string" && raw.neck ? raw.neck : "";
    issues.push(shown
      ? {
        he: `${he}: הצוואר «${shown}» אינו נתמך, ולכן החלק נדחה. הצווארים הנתמכים הם FEA13, FEA15, FEA17, FEA18 ו־FEA20.`,
        en: `${en}: neck "${shown}" is not supported, so the part was rejected. Supported necks are FEA13, FEA15, FEA17, FEA18, and FEA20.`,
      }
      : {
        he: `${he}: חסר צוואר. הערך חייב להיות null או אחד מ־FEA13, FEA15, FEA17, FEA18, FEA20.`,
        en: `${en}: missing neck. It must be null or one of FEA13, FEA15, FEA17, FEA18, FEA20.`,
      });
  }
  const ranges = isVariantPart(raw.kind) ? MM[raw.kind] : undefined;
  for (const field of ["widthMm", "heightMm", "depthMm"] as const) {
    const value = raw[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      issues.push({
        he: `${he}: ${field} חייב להיות מספר אי-שלילי.`,
        en: `${en}: ${field} must be a non-negative number.`,
      });
    } else if (ranges && (value < ranges[field][0] || value > ranges[field][1])) {
      const [min, max] = ranges[field];
      issues.push({
        he: `${he}: ${field} חייב להיות בין ${min} ל־${max}.`,
        en: `${en}: ${field} must be between ${min} and ${max}.`,
      });
    }
  }
  const capacity = raw.capacityMl;
  if (!(capacity === null || (typeof capacity === "number" && Number.isFinite(capacity) && capacity >= 0))) {
    issues.push({
      he: `${he}: capacityMl חייב להיות מספר אי-שלילי או null.`,
      en: `${en}: capacityMl must be a non-negative number or null.`,
    });
  }
  if (typeof raw.profile !== "string" || !(PROFILES as readonly string[]).includes(raw.profile)) {
    issues.push({ he: `${he}: פרופיל לא מוכר.`, en: `${en}: unknown profile.` });
  }
  if (typeof raw.color !== "string" || !HEX.test(raw.color)) {
    issues.push({
      he: `${he}: הצבע חייב להיות בפורמט #rrggbb.`,
      en: `${en}: color must be a #rrggbb hex.`,
    });
  }
  if (typeof raw.thumb !== "string" || (raw.thumb !== "" && !THUMB.test(raw.thumb))) {
    issues.push({
      he: `${he}: התמונה הממוזערת חייבת להיות ריקה או data URL של jpeg, png או webp.`,
      en: `${en}: thumb must be empty or a jpeg, png, or webp data URL.`,
    });
  }
  if (typeof raw.page !== "number" || !Number.isInteger(raw.page) || raw.page < 1) {
    issues.push({ he: `${he}: page חייב להיות מספר עמוד שלם מ־1 ומעלה.`, en: `${en}: page must be an integer of 1 or more.` });
  }
  if (Object.hasOwn(raw, "lathe") && raw.lathe !== undefined) {
    const lathe = raw.lathe;
    if (!Array.isArray(lathe) || lathe.some((sample) => typeof sample !== "number" || !Number.isFinite(sample))) {
      issues.push({
        he: `${he}: lathe חייב להיות מערך של מספרים.`,
        en: `${en}: lathe must be an array of numbers.`,
      });
    } else if (lathe.some((sample) => sample < 0 || sample > LATHE_MAX)) {
      issues.push({
        he: `${he}: ערכי lathe חייבים להיות בין 0 ל־${LATHE_MAX}.`,
        en: `${en}: lathe values must be between 0 and ${LATHE_MAX}.`,
      });
    }
  }
  return issues;
}

function identityIssues(part: Record<string, unknown>, seen: Set<string>): PackFileError[] {
  if (typeof part.id !== "string" || part.id.trim() === "") return [];
  const id = part.id.trim();
  const ref = partRef(part);
  const he = hePart(ref);
  const en = enPart(ref);
  const issues: PackFileError[] = [];
  if (seen.has(id)) {
    issues.push({
      he: `${he}: המזהה «${id}» מופיע יותר מפעם אחת בחבילה.`,
      en: `${en}: id "${id}" is duplicated in this pack.`,
    });
  }
  seen.add(id);
  if (isBuiltinCatalogId(id)) {
    issues.push({
      he: `${he}: המזהה «${id}» שמור לקטלוג המובנה.`,
      en: `${en}: id "${id}" belongs to the built-in catalog.`,
    });
  }
  return issues;
}

function envelopeIssues(value: Record<string, unknown>): PackFileError[] {
  const issues: PackFileError[] = [];
  if (Object.hasOwn(value, "createdAt") && value.createdAt !== undefined) {
    const createdAt = value.createdAt;
    if (typeof createdAt !== "number" || !Number.isFinite(createdAt) || createdAt < 0) {
      issues.push({
        he: "createdAt חייב להיות מספר אי-שלילי.",
        en: "createdAt must be a non-negative number.",
      });
    }
  }
  if (Object.hasOwn(value, "version") && value.version !== undefined && !isVersion(value.version)) {
    issues.push({
      he: "version חייב להיות המספר השלם 2.",
      en: "version must be the integer 2.",
    });
  }
  if (Object.hasOwn(value, "source") && value.source !== undefined && !isSource(value.source)) {
    issues.push({
      he: "source חייב להיות pdf, photo, scan או manual.",
      en: "source must be pdf, photo, scan, or manual.",
    });
  }
  if (Object.hasOwn(value, "supplier") && value.supplier !== undefined && !isDataObject(value.supplier)) {
    issues.push({
      he: "supplier חייב להיות אובייקט.",
      en: "supplier must be an object.",
    });
  }
  return issues;
}

function cleanMeasurements(value: unknown): unknown[] | Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    if (!value.every((item) => isDataObject(item))) return undefined;
    return value.map((item) => plainData(safeRecord(item)));
  }
  if (isDataObject(value)) return plainData(safeRecord(value));
  return undefined;
}

function takePart(raw: Record<string, unknown>, warnings: PackNotice[]): Record<string, unknown> {
  const ref = partRef(raw) || "part";
  const copy = safeRecord(raw);
  if (Object.hasOwn(raw, "price")) {
    const checked = sanitizeSupplierPrice(raw.price);
    for (const item of checked.issues) {
      warnings.push({ type: "priceIssue", ref, path: item.path, code: item.code, he: item.he, en: item.en });
    }
    if (checked.price) copy.price = checked.price;
    else delete copy.price;
  }
  for (const field of ["mesh", "scan"] as const) {
    if (!Object.hasOwn(raw, field)) continue;
    if (isDataObject(raw[field])) copy[field] = safeRecord(raw[field]);
    else {
      delete copy[field];
      warnings.push({ type: "droppedField", ref, field });
    }
  }
  if (Object.hasOwn(raw, "measurements")) {
    const cleaned = cleanMeasurements(raw.measurements);
    if (cleaned) copy.measurements = cleaned;
    else {
      delete copy.measurements;
      warnings.push({ type: "droppedField", ref, field: "measurements" });
    }
  }
  return plainData(copy);
}

function assemble(value: Record<string, unknown>, parts: Array<Record<string, unknown>>): ValidatedPack {
  const rest = safeRecord(value);
  delete rest.id;
  delete rest.name;
  delete rest.createdAt;
  delete rest.parts;
  return {
    id: value.id,
    name: value.name as string,
    createdAt: typeof value.createdAt === "number" ? value.createdAt : undefined,
    parts,
    rest,
  };
}

/**
 * Structural check for a supplier pack. Unknown optional fields are kept after
 * dangerous keys are removed. An invalid `price` becomes a warning, not a rejection.
 */
export function validatePackText(text: string): PackCheck {
  if (text.length > MAX_PACK_BYTES) return { ok: false, error: tooBig() };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: fileError() };
  }
  return checkPack(value, "reject");
}

function metaWarning(issue: PackFileError): PackNotice | undefined {
  if (issue.en.startsWith("version")) return { type: "droppedMeta", field: "version" };
  if (issue.en.startsWith("source")) return { type: "droppedMeta", field: "source" };
  if (issue.en.startsWith("supplier")) return { type: "droppedMeta", field: "supplier" };
  if (issue.en.startsWith("createdAt")) return { type: "droppedMeta", field: "createdAt" };
  return undefined;
}

/** `reject` fails the file. `drop` keeps the pack and reports bad parts as warnings. */
export function checkPack(value: unknown, mode: "reject" | "drop"): PackCheck {
  if (!isDataObject(value) || !Array.isArray(value.parts)) return { ok: false, error: fileError() };
  if (typeof value.name !== "string" || value.name.trim() === "") return { ok: false, error: missingName() };

  const warnings: PackNotice[] = [];
  const issues = envelopeIssues(value);
  if (mode === "drop") {
    for (const issue of issues) {
      const notice = metaWarning(issue);
      if (notice) warnings.push(notice);
    }
  }

  const partIssues: PackFileError[] = [];
  const kept: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const part of value.parts) {
    const ref = isDataObject(part) ? partRef(part) || "part" : "part";
    const all = [...validatePart(part), ...(isDataObject(part) ? identityIssues(part, seen) : [])];
    if (all.length) {
      if (mode === "drop") warnings.push({ type: "droppedPart", ref });
      else partIssues.push(...all);
      continue;
    }
    if (isDataObject(part)) kept.push(takePart(part, warnings));
  }

  if (mode === "reject" && (issues.length || partIssues.length)) {
    return { ok: false, error: reject([...issues, ...partIssues]) };
  }

  const envelope = safeRecord(value);
  if (mode === "drop") {
    if (!isVersion(envelope.version)) delete envelope.version;
    if (Object.hasOwn(envelope, "source") && !isSource(envelope.source)) delete envelope.source;
    if (Object.hasOwn(envelope, "supplier") && !isDataObject(envelope.supplier)) delete envelope.supplier;
    if (Object.hasOwn(envelope, "createdAt") && !(typeof envelope.createdAt === "number" && Number.isFinite(envelope.createdAt) && envelope.createdAt >= 0)) {
      delete envelope.createdAt;
    }
  }
  return { ok: true, value: assemble(envelope, kept), warnings };
}
