import { tx } from "../i18n/copy.ts";
import { isBuiltinCatalogId } from "../model/catalog.ts";
import { isNeckId } from "../model/necks.ts";
import { sanitizeSupplierPrice } from "../model/price.ts";
import type { VariantPart } from "../model/types.ts";
import { bdi, FIELD_LABEL, ltr, type FieldLabelKey } from "./fieldText.ts";
import type { PackNotice } from "./notices.ts";
import type { ImportProfile } from "./parseCatalog.ts";
import { generatedPartId, isVariantPart } from "./registry.ts";
import { isDataObject, plainData, safeRecord } from "./safeJson.ts";

export interface PackFileError {
  he: string;
  en: string;
}

export interface FieldIssue extends PackFileError {
  field: string;
}

/** Sizes that pass `MM` for a fresh manual row of that kind. */
export const KIND_DEFAULT_MM: Record<VariantPart, { widthMm: number; heightMm: number; depthMm: number }> = {
  bottle: { widthMm: 40, heightMm: 120, depthMm: 40 },
  cap: { widthMm: 30, heightMm: 32, depthMm: 30 },
  box: { widthMm: 80, heightMm: 120, depthMm: 60 },
  pump: { widthMm: 20, heightMm: 12, depthMm: 20 },
  collar: { widthMm: 18, heightMm: 8, depthMm: 18 },
  label: { widthMm: 40, heightMm: 20, depthMm: 0 },
};

export interface HiddenPart {
  id: string;
  code: string;
  name: string;
  he: string;
  en: string;
}

export interface ValidatedPack {
  id: unknown;
  name: string;
  createdAt: number | undefined;
  parts: Array<Record<string, unknown>>;
  rest: Record<string, unknown>;
  hidden: HiddenPart[];
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

function citePart(part: Record<string, unknown> | null, he: string, en: string): { he: string; en: string } {
  if (!part) return { he, en };
  const name = typeof part.name === "string" ? part.name.trim() : "";
  const code = typeof part.code === "string" ? part.code.trim() : "";
  const id = typeof part.id === "string" ? part.id.trim() : "";
  const token = name ? bdi(name) : code ? ltr(code) : id ? ltr(id) : "";
  if (!token) return { he, en };
  return { he: `${token} · ${he}`, en: `${token} · ${en}` };
}

function labels(field: string): { he: string; en: string } {
  if (Object.hasOwn(FIELD_LABEL.he, field)) {
    const key = field as FieldLabelKey;
    return { he: FIELD_LABEL.he[key], en: FIELD_LABEL.en[key] };
  }
  return { he: field, en: field };
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

function validatePart(raw: unknown): FieldIssue[] {
  if (!isDataObject(raw)) {
    return [{ field: "", he: "אחד החלקים אינו אובייקט.", en: "One of the parts is not an object." }];
  }
  const issues: FieldIssue[] = [];
  const add = (field: string, heText: string, enText: string) => {
    issues.push({ field, he: heText, en: enText });
  };

  if (typeof raw.id !== "string" || raw.id.trim() === "") {
    add("id", "חסר מזהה.", "Missing id.");
  }
  if (!isVariantPart(raw.kind)) {
    const shown = typeof raw.kind === "string" && raw.kind ? raw.kind : "—";
    add(
      "kind",
      `הסוג ${ltr(shown)} אינו מוכר, ולכן החלק נדחה ולא יהפוך לקופסה. הסוגים הנתמכים הם בקבוק, פקק, תווית, משאבה, צווארון וקופסה.`,
      `Kind ${ltr(shown)} is not supported, so the part was rejected and will not become a box. Supported kinds are bottle, cap, label, pump, collar, and box.`,
    );
  }
  if (typeof raw.code !== "string") {
    add("code", "חסר קוד.", "Missing code.");
  }
  if (typeof raw.name !== "string") {
    add("name", "חסר שם.", "Missing name.");
  }
  if (raw.neck !== null && !isNeckId(raw.neck)) {
    const shown = typeof raw.neck === "string" && raw.neck ? raw.neck : "";
    const necks = `${ltr("FEA13")}, ${ltr("FEA15")}, ${ltr("FEA17")}, ${ltr("FEA18")}, ${ltr("FEA20")}`;
    if (shown) {
      add("neck", `הצוואר ${ltr(shown)} אינו נתמך, ולכן החלק נדחה. הצווארים הנתמכים הם ${necks}.`, `Neck ${ltr(shown)} is not supported, so the part was rejected. Supported necks are ${necks}.`);
    } else {
      add("neck", `חסר צוואר. הערך חייב להיות ריק או אחד מ־${necks}.`, `Missing neck. It must be empty or one of ${necks}.`);
    }
  }
  const ranges = isVariantPart(raw.kind) ? MM[raw.kind] : undefined;
  for (const field of ["widthMm", "heightMm", "depthMm"] as const) {
    const value = raw[field];
    const name = labels(field);
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      add(field, `${name.he} חייב להיות מספר אי-שלילי.`, `${name.en} must be a non-negative number.`);
    } else if (ranges && (value < ranges[field][0] || value > ranges[field][1])) {
      const [min, max] = ranges[field];
      add(field, `${name.he} חייב להיות בין ${bdi(min)} ל־${bdi(max)} מ״מ`, `${name.en} must be between ${bdi(min)} and ${bdi(max)} mm`);
    }
  }
  const capacity = raw.capacityMl;
  if (!(capacity === null || (typeof capacity === "number" && Number.isFinite(capacity) && capacity >= 0))) {
    const name = labels("capacityMl");
    add("capacityMl", `${name.he} חייב להיות מספר אי-שלילי או ריק.`, `${name.en} must be a non-negative number or empty.`);
  }
  if (typeof raw.profile !== "string" || !(PROFILES as readonly string[]).includes(raw.profile)) {
    add("profile", "פרופיל לא מוכר.", "Unknown profile.");
  }
  if (typeof raw.color !== "string" || !HEX.test(raw.color)) {
    add("color", `הצבע חייב להיות בפורמט ${bdi("#rrggbb")}.`, `Color must be a ${bdi("#rrggbb")} hex.`);
  }
  if (typeof raw.thumb !== "string" || (raw.thumb !== "" && !THUMB.test(raw.thumb))) {
    add("thumb", "התמונה הממוזערת חייבת להיות ריקה או data URL של jpeg, png או webp.", "Thumb must be empty or a jpeg, png, or webp data URL.");
  }
  if (typeof raw.page !== "number" || !Number.isInteger(raw.page) || raw.page < 1) {
    const name = labels("page");
    add("page", `${name.he} חייב להיות מספר שלם מ־${bdi(1)} ומעלה.`, `${name.en} must be an integer of ${bdi(1)} or more.`);
  }
  if (Object.hasOwn(raw, "lathe") && raw.lathe !== undefined) {
    const lathe = raw.lathe;
    const name = labels("lathe");
    if (!Array.isArray(lathe) || lathe.some((sample) => typeof sample !== "number" || !Number.isFinite(sample))) {
      add("lathe", `${name.he} חייבת להיות מערך של מספרים.`, `${name.en} must be an array of numbers.`);
    } else if (lathe.some((sample) => sample < 0 || sample > LATHE_MAX)) {
      add("lathe", `ערכי ${name.he} חייבים להיות בין ${bdi(0)} ל־${bdi(LATHE_MAX)}.`, `${name.en} values must be between ${bdi(0)} and ${bdi(LATHE_MAX)}.`);
    }
  }
  return issues;
}

/** Field errors for a lab-builder row. An empty code is incomplete even though a file may omit it. */
export function issuesForDraft(row: {
  id: string;
  kind: string;
  code: string;
  neck: string | null;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  capacityMl: number | null;
  profile: string;
  page?: number;
}): FieldIssue[] {
  const issues = validatePart({
    id: row.id,
    kind: row.kind,
    code: row.code,
    name: row.code.trim() || "draft",
    neck: row.neck,
    widthMm: row.widthMm,
    heightMm: row.heightMm,
    depthMm: row.depthMm,
    capacityMl: row.capacityMl,
    profile: row.profile,
    color: "#c4a15a",
    thumb: "",
    page: row.page ?? 1,
  });
  if (!row.code.trim()) issues.unshift({ field: "code", he: "חסר קוד.", en: "Enter a code." });
  return issues;
}

const DRAFT_SUPPLIER = "draft";

export interface SlugClash {
  code: string;
  /** 1-based position of the other row in the save order. */
  row: number;
}

/**
 * One sanitise pass. Maps a row id to the other row that would share its part id.
 * The caller looks this up per row instead of scanning every row again.
 */
export function duplicateClashes(rows: readonly { id: string; code: string; kind: string }[]): Map<string, SlugClash> {
  const generated = rows.map((row, index) => ({
    row,
    index,
    partId: generatedPartId(DRAFT_SUPPLIER, row.code, row.kind, index),
  }));
  const byPart = new Map<string, typeof generated>();
  for (const item of generated) {
    const list = byPart.get(item.partId);
    if (list) list.push(item);
    else byPart.set(item.partId, [item]);
  }
  const clashes = new Map<string, SlugClash>();
  for (const item of generated) {
    const other = byPart.get(item.partId)?.find((entry) => entry.row.id !== item.row.id);
    if (!other) continue;
    clashes.set(item.row.id, { code: other.row.code.trim(), row: other.index + 1 });
  }
  return clashes;
}

export function duplicateClashIssue(code: string, clash: SlugClash): FieldIssue {
  return {
    field: "code",
    he: `הקוד ${ltr(code)} מתנגש עם ${ltr(clash.code)} (שורה ${ltr(clash.row)}).`,
    en: `Code ${ltr(code)} clashes with ${ltr(clash.code)} (row ${ltr(clash.row)}).`,
  };
}

/** A second row whose final part id matches (`A-1` and `a 1`, or a sanitised code and item-N) cannot be saved. */
export function duplicateSlugIssues(
  row: { id: string; code: string; kind: string },
  rows: readonly { id: string; code: string; kind: string }[],
): FieldIssue[] {
  const clash = duplicateClashes(rows).get(row.id);
  return clash ? [duplicateClashIssue(row.code.trim(), clash)] : [];
}

function identityIssues(part: Record<string, unknown>, seen: Set<string>): PackFileError[] {
  if (typeof part.id !== "string" || part.id.trim() === "") return [];
  const id = part.id.trim();
  const issues: PackFileError[] = [];
  if (seen.has(id)) {
    issues.push({
      he: `המזהה ${ltr(id)} מופיע יותר מפעם אחת בחבילה.`,
      en: `Id ${ltr(id)} is duplicated in this pack.`,
    });
  }
  seen.add(id);
  if (isBuiltinCatalogId(id)) {
    issues.push({
      he: `המזהה ${ltr(id)} שמור לקטלוג המובנה.`,
      en: `Id ${ltr(id)} belongs to the built-in catalog.`,
    });
  }
  return issues;
}

type EnvelopeField = "version" | "source" | "supplier" | "createdAt";
type EnvelopeIssue = PackFileError & { field: EnvelopeField };

function envelopeIssues(value: Record<string, unknown>): EnvelopeIssue[] {
  const issues: EnvelopeIssue[] = [];
  if (Object.hasOwn(value, "createdAt") && value.createdAt !== undefined) {
    const createdAt = value.createdAt;
    if (typeof createdAt !== "number" || !Number.isFinite(createdAt) || createdAt < 0) {
      issues.push({
        field: "createdAt",
        he: `${FIELD_LABEL.he.createdAt} חייב להיות מספר אי-שלילי.`,
        en: `${FIELD_LABEL.en.createdAt} must be a non-negative number.`,
      });
    }
  }
  if (Object.hasOwn(value, "version") && value.version !== undefined && !isVersion(value.version)) {
    issues.push({
      field: "version",
      he: `${FIELD_LABEL.he.version} חייב להיות המספר השלם 2.`,
      en: `${FIELD_LABEL.en.version} must be the integer 2.`,
    });
  }
  if (Object.hasOwn(value, "source") && value.source !== undefined && !isSource(value.source)) {
    issues.push({
      field: "source",
      he: `${FIELD_LABEL.he.source} חייב להיות ${ltr("pdf")}, ${ltr("photo")}, ${ltr("scan")} או ${ltr("manual")}.`,
      en: `${FIELD_LABEL.en.source} must be ${ltr("pdf")}, ${ltr("photo")}, ${ltr("scan")}, or ${ltr("manual")}.`,
    });
  }
  if (Object.hasOwn(value, "supplier") && value.supplier !== undefined && !isDataObject(value.supplier)) {
    issues.push({
      field: "supplier",
      he: `${FIELD_LABEL.he.supplier} חייב להיות אובייקט.`,
      en: `${FIELD_LABEL.en.supplier} must be an object.`,
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
      warnings.push({
        type: "priceIssue",
        ref,
        path: item.path,
        code: item.code,
        severity: item.severity,
        he: item.he,
        en: item.en,
      });
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

function assemble(value: Record<string, unknown>, parts: Array<Record<string, unknown>>, hidden: HiddenPart[]): ValidatedPack {
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
    hidden,
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

function metaWarning(issue: EnvelopeIssue): PackNotice | undefined {
  switch (issue.field) {
    case "version":
    case "source":
    case "supplier":
    case "createdAt":
      return { type: "droppedMeta", field: issue.field };
    default:
      return undefined;
  }
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
  const hidden: HiddenPart[] = [];
  const seen = new Set<string>();
  for (const part of value.parts) {
    const ref = isDataObject(part) ? partRef(part) || "part" : "part";
    const all = [...validatePart(part), ...(isDataObject(part) ? identityIssues(part, seen) : [])];
    if (all.length) {
      const he = all.map((item) => item.he).join(" ");
      const en = all.map((item) => item.en).join(" ");
      const cited = citePart(isDataObject(part) ? part : null, he, en);
      if (mode === "drop") {
        warnings.push({ type: "droppedPart", ref, he: cited.he, en: cited.en });
        hidden.push({
          id: isDataObject(part) && typeof part.id === "string" && part.id.trim() ? part.id : ref,
          code: isDataObject(part) && typeof part.code === "string" ? part.code : "",
          name: isDataObject(part) && typeof part.name === "string" ? part.name : "",
          he,
          en,
        });
      } else partIssues.push(cited);
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
  return { ok: true, value: assemble(envelope, kept, hidden), warnings };
}
