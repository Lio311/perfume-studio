import { describe, expect, it, vi } from "vitest";
import { commitSavedDesigns } from "./saveResult.ts";

describe("commitSavedDesigns", () => {
  it("keeps the new list when storage accepts it", () => {
    const writes: string[][] = [];
    const result = commitSavedDesigns(["atelier"], ["sketch", "atelier"], (saved) => {
      writes.push(saved);
    });
    expect(result).toEqual({ ok: true, saved: ["sketch", "atelier"] });
    expect(writes).toEqual([["sketch", "atelier"]]);
  });

  it("rolls back and reports failure when storage exceeds quota", () => {
    const writes: string[][] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = commitSavedDesigns(["atelier"], ["sketch", "atelier"], (saved) => {
      writes.push([...saved]);
      if (saved[0] === "sketch") {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      }
    });
    errorSpy.mockRestore();
    expect(result).toEqual({ ok: false, saved: ["atelier"] });
    expect(writes).toEqual([["sketch", "atelier"], ["atelier"]]);
  });
});
