import { tx } from "../i18n/copy.ts";
import type { PriceIssueCode } from "../model/price.ts";
import type { Lang } from "../model/types.ts";

export type PackNotice =
  | { type: "unknownKind"; ref: string; kind: string }
  | { type: "badNeck"; ref: string; neck: string }
  | { type: "priceIssue"; ref: string; path: string; code: PriceIssueCode; he: string; en: string }
  | { type: "droppedField"; ref: string; field: "mesh" | "scan" | "measurements" }
  | { type: "droppedPart"; ref: string }
  | { type: "droppedPack" }
  | { type: "droppedMeta"; field: "version" | "source" | "supplier" | "createdAt" };

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

export function formatPackNotice(lang: Lang, notice: PackNotice): string {
  const t = tx(lang);
  switch (notice.type) {
    case "unknownKind":
      return fill(t.noticeUnknownKind, { ref: notice.ref, kind: notice.kind });
    case "badNeck":
      return fill(t.noticeBadNeck, { ref: notice.ref, neck: notice.neck });
    case "priceIssue":
      return lang === "he" ? `החלק ${notice.ref}: ${notice.he}` : `Part ${notice.ref}: ${notice.en}`;
    case "droppedField":
      return fill(t.noticeDroppedField, { ref: notice.ref, field: notice.field });
    case "droppedPart":
      return fill(t.noticeDroppedPart, { ref: notice.ref });
    case "droppedPack":
      return t.noticeDroppedPack;
    case "droppedMeta":
      return fill(t.noticeDroppedMeta, { field: notice.field });
  }
}
