import { tx } from "../i18n/copy.ts";
import { bdi } from "./fieldText.ts";
import type { PriceIssueCode, PriceIssueSeverity } from "../model/price.ts";
import type { Lang } from "../model/types.ts";

/** How many warning lines to show before one "+N more" line. */
export const PACK_WARNING_LIMIT = 20;

export type PackNotice =
  | { type: "unknownKind"; ref: string; kind: string }
  | { type: "badNeck"; ref: string; neck: string }
  | { type: "priceIssue"; ref: string; path: string; code: PriceIssueCode; severity: PriceIssueSeverity; he: string; en: string }
  | { type: "droppedField"; ref: string; field: "mesh" | "scan" | "measurements" }
  | { type: "droppedPart"; ref: string; he?: string; en?: string }
  | { type: "droppedPack" }
  | { type: "droppedMeta"; field: "version" | "source" | "supplier" | "createdAt" };

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

/** Format warnings for display. The full list stays on the returned pack result. */
export function capPackNotices(notices: PackNotice[], lang: Lang, limit = PACK_WARNING_LIMIT): string[] {
  const lines = notices.map((notice) => formatPackNotice(lang, notice));
  if (lines.length <= limit) return lines;
  const more = tx(lang).warningsMore.replace("{n}", String(lines.length - limit));
  return [...lines.slice(0, limit), more];
}

export function formatPackNotice(lang: Lang, notice: PackNotice): string {
  const t = tx(lang);
  switch (notice.type) {
    case "unknownKind":
      return fill(t.noticeUnknownKind, { ref: bdi(notice.ref), kind: bdi(notice.kind) });
    case "badNeck":
      return fill(t.noticeBadNeck, { ref: bdi(notice.ref), neck: bdi(notice.neck) });
    case "priceIssue":
      return `${bdi(notice.ref)} · ${lang === "he" ? notice.he : notice.en}`;
    case "droppedField":
      return fill(t.noticeDroppedField, { ref: bdi(notice.ref), field: bdi(notice.field) });
    case "droppedPart":
      if (notice.he && notice.en) return lang === "he" ? notice.he : notice.en;
      return fill(t.noticeDroppedPart, { ref: notice.ref });
    case "droppedPack":
      return t.noticeDroppedPack;
    case "droppedMeta":
      return fill(t.noticeDroppedMeta, { field: notice.field });
  }
}
