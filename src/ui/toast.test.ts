import { describe, expect, it } from "vitest";
import { ltr } from "../import/fieldText.ts";
import { formatPackNotice } from "../import/notices.ts";
import { invalidShareMessage } from "../model/share.ts";
import { clipToast, TOAST_MAX } from "./toast.ts";

function isolatesBalanced(text: string): boolean {
  let depth = 0;
  for (const char of text) {
    if (char === "\u2066" || char === "\u2067" || char === "\u2068") depth += 1;
    else if (char === "\u2069") {
      if (depth === 0) return false;
      depth -= 1;
    }
  }
  return depth === 0;
}

describe("toast length", () => {
  it("leaves a short message intact and caps a long one", () => {
    expect(clipToast(invalidShareMessage("he"))).toBe(invalidShareMessage("he"));
    expect(clipToast(invalidShareMessage("en"))).toBe(invalidShareMessage("en"));
    const long = "x".repeat(TOAST_MAX + 40);
    const clipped = clipToast(long);
    expect(clipped.length).toBe(TOAST_MAX);
    expect(clipped.endsWith("…")).toBe(true);
  });

  it("clips on code points so a surrogate pair stays intact", () => {
    const emoji = "😀";
    expect(emoji.length).toBe(2);
    const text = `${"a".repeat(TOAST_MAX - 2)}${emoji}${"b".repeat(10)}`;
    const clipped = clipToast(text);
    expect(Array.from(clipped)).toHaveLength(TOAST_MAX);
    expect(clipped.endsWith("…")).toBe(true);
    expect(clipped.includes(emoji)).toBe(true);
    expect(clipped.includes("\uD83D")).toBe(true);
    expect(clipped.includes("\uDE00")).toBe(true);
  });

  it("does not cut between an isolate opener and its closer", () => {
    const prefix = "א".repeat(TOAST_MAX - 3);
    for (const open of ["\u2066", "\u2067", "\u2068"]) {
      const text = `${prefix}${open}abcdef\u2069`;
      const clipped = clipToast(text);
      expect(clipped.includes(open)).toBe(false);
      expect(clipped.includes("\u2069")).toBe(false);
      expect(clipped.endsWith("…")).toBe(true);
      expect(clipped.startsWith(prefix)).toBe(true);
    }
  });

  it("clips a supplier notice without leaving an LRI open", () => {
    const notices = [
      formatPackNotice("he", { type: "badNeck", ref: "PUMP-HEAD-01", neck: "GLAS" }),
      formatPackNotice("en", { type: "badNeck", ref: "PUMP-HEAD-01", neck: "GLAS" }),
      formatPackNotice("he", { type: "unknownKind", ref: "CAP-9", kind: "spray" }),
    ];
    for (const notice of notices) {
      const clipped = clipToast(notice);
      expect(isolatesBalanced(clipped)).toBe(true);
      if ([...notice].length <= TOAST_MAX) expect(clipped).toBe(notice);
    }
    const necks = ["FEA13", "FEA15", "FEA17", "FEA18", "FEA20"].map((neck) => ltr(neck)).join(", ");
    const long = `${"הצוואר אינו נתמך. ".repeat(12)}הצווארים הנתמכים הם ${necks}. ${ltr("PUMP-HEAD-01")}`;
    expect([...long].length).toBeGreaterThan(TOAST_MAX);
    const clipped = clipToast(long);
    expect(clipped.endsWith("…")).toBe(true);
    expect(isolatesBalanced(clipped.slice(0, -1))).toBe(true);
    expect(clipped.includes("\u2066FEA13\u2069") || !clipped.includes("\u2066")).toBe(true);
  });

  it("keeps a closed LRI or RLI isolate, including its PDI, when the pair fits", () => {
    for (const open of ["\u2066", "\u2067"]) {
      const isolate = `${open}abc\u2069`;
      const clipped = clipToast(`${isolate}${"x".repeat(TOAST_MAX)}`);
      expect(clipped.startsWith(isolate)).toBe(true);
      expect(clipped.includes("\u2069")).toBe(true);
    }
  });
});
