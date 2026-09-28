import { isNeckId } from "../model/necks.ts";
import type { ImportProfile } from "./parseCatalog.ts";
import { isVariantPart } from "./registry.ts";

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
  | { ok: true; value: ValidatedPack }
  | { ok: false; error: PackFileError };

const FILE_ERROR: PackFileError = {
  he: "הקובץ אינו חבילת ספק.",
  en: "That file is not a supplier pack.",
};

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

const HEX = /^#[0-9a-fA-F]{6}$/;
const THUMB = /^data:image\/(jpeg|png|webp);base64,/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  return {
    he: `הקובץ נדחה. ${issues.map((item) => item.he).join(" ")}`,
    en: `The pack was rejected. ${issues.map((item) => item.en).join(" ")}`,
  };
}

function validatePart(raw: unknown): PackFileError[] {
  if (!isRecord(raw)) {
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
  for (const field of ["widthMm", "heightMm", "depthMm"] as const) {
    const value = raw[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      issues.push({
        he: `${he}: ${field} חייב להיות מספר אי-שלילי.`,
        en: `${en}: ${field} must be a non-negative number.`,
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
  if ("lathe" in raw && raw.lathe !== undefined) {
    const lathe = raw.lathe;
    if (!Array.isArray(lathe) || lathe.some((sample) => typeof sample !== "number" || !Number.isFinite(sample))) {
      issues.push({
        he: `${he}: lathe חייב להיות מערך של מספרים.`,
        en: `${en}: lathe must be an array of numbers.`,
      });
    }
  }
  return issues;
}

/**
 * Structural check for a supplier pack. Unknown part and pack fields are kept.
 * A `price` object, when present, is not interpreted and is not a reason to reject.
 */
export function validatePackText(text: string): PackCheck {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: FILE_ERROR };
  }
  if (!isRecord(value) || !Array.isArray(value.parts)) return { ok: false, error: FILE_ERROR };
  if (typeof value.name !== "string" || value.name.trim() === "") {
    return {
      ok: false,
      error: { he: "הקובץ נדחה. חסר שם ספק.", en: "The pack was rejected. The supplier name is missing." },
    };
  }
  const issues: PackFileError[] = [];
  if ("createdAt" in value && value.createdAt !== undefined) {
    const createdAt = value.createdAt;
    if (typeof createdAt !== "number" || !Number.isFinite(createdAt) || createdAt < 0) {
      issues.push({
        he: "createdAt חייב להיות מספר אי-שלילי.",
        en: "createdAt must be a non-negative number.",
      });
    }
  }
  for (const part of value.parts) issues.push(...validatePart(part));
  if (issues.length) return { ok: false, error: reject(issues) };

  const rest = { ...value };
  delete rest.id;
  delete rest.name;
  delete rest.createdAt;
  delete rest.parts;
  return {
    ok: true,
    value: {
      id: value.id,
      name: value.name,
      createdAt: typeof value.createdAt === "number" ? value.createdAt : undefined,
      parts: value.parts as Array<Record<string, unknown>>,
      rest,
    },
  };
}
