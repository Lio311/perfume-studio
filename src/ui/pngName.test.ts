import { describe, expect, it } from "vitest";
import { pngDownloadName, sanitizeFilenamePart } from "./pngName.ts";

describe("png filename sanitising", () => {
  it("strips slashes and other path characters", () => {
    expect(sanitizeFilenamePart("AC/DC")).toBe("ACDC");
    expect(pngDownloadName("AC/DC", "", "2026-09-28")).toBe("ACDC_2026-09-28.png");
    expect(pngDownloadName("../etc/passwd", "Cara/50", "2026/09/28")).toBe("etcpasswd_Cara50_20260928.png");
    expect(pngDownloadName("a\\b:c*?\"<>|", "", "2026-09-28")).toBe("abc_2026-09-28.png");
  });

  it("keeps Hebrew letters and turns spaces into underscores", () => {
    expect(sanitizeFilenamePart("לילה/בושם")).toBe("לילהבושם");
    expect(pngDownloadName("לילה/בושם", "קארה 50", "2026-09-28")).toBe("לילהבושם_קארה_50_2026-09-28.png");
  });

  it("keeps Arabic letters", () => {
    expect(sanitizeFilenamePart("عطر/ليل")).toBe("عطرليل");
    expect(pngDownloadName("عطر فاخر", "", "2026-09-28")).toBe("عطر_فاخر_2026-09-28.png");
  });

  it("keeps accented Latin", () => {
    expect(pngDownloadName("Nº5 Rosé", "", "2026-09-28")).toBe("Nº5_Rosé_2026-09-28.png");
    expect(sanitizeFilenamePart("Crème brûlée")).toBe("Crème_brûlée");
  });

  it("truncates a long name to 60 characters", () => {
    const long = `בושם ${"א".repeat(80)}`;
    expect(sanitizeFilenamePart(long)).toHaveLength(60);
    expect(pngDownloadName(long, "", "2026-09-28")).toBe(`${sanitizeFilenamePart(long)}_2026-09-28.png`);
  });

  it("falls back when the label is only unsafe characters", () => {
    expect(pngDownloadName("///", "", "2026-09-28")).toBe("BRAND_2026-09-28.png");
    expect(pngDownloadName("   ", "Cara 50", "2026-09-28")).toBe("BRAND_Cara_50_2026-09-28.png");
  });
});
