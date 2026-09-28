import { describe, expect, it } from "vitest";
import { clipToast, TOAST_MAX } from "./toast.ts";
import { invalidShareMessage } from "../model/share.ts";

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
    const text = `${prefix}\u2068abcdef\u2069`;
    const clipped = clipToast(text);
    expect(clipped.includes("\u2068")).toBe(false);
    expect(clipped.includes("\u2069")).toBe(false);
    expect(clipped.endsWith("…")).toBe(true);
    expect(clipped.startsWith(prefix)).toBe(true);
  });
});
