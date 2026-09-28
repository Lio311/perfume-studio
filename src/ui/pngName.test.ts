import { describe, expect, it } from "vitest";
import { pngDownloadName, sanitizeFilenamePart } from "./pngName.ts";

describe("png filename sanitising", () => {
  it("strips slashes and other path characters", () => {
    expect(sanitizeFilenamePart("AC/DC")).toBe("ACDC");
    expect(pngDownloadName("AC/DC", "", "2026-09-28")).toBe("ACDC_2026-09-28.png");
    expect(pngDownloadName("../etc/passwd", "Cara/50", "2026/09/28")).toBe("etcpasswd_Cara50_20260928.png");
    expect(pngDownloadName("a\\b:c*?\"<>|", "", "2026-09-28")).toBe("abc_2026-09-28.png");
  });

  it("keeps Hebrew letters", () => {
    expect(sanitizeFilenamePart("לילה/בושם")).toBe("לילהבושם");
    expect(pngDownloadName("לילה/בושם", "קארה 50", "2026-09-28")).toBe("לילהבושם_קארה50_2026-09-28.png");
  });

  it("falls back when the label is only unsafe characters", () => {
    expect(pngDownloadName("///", "", "2026-09-28")).toBe("BRAND_2026-09-28.png");
    expect(pngDownloadName("   ", "Cara 50", "2026-09-28")).toBe("BRAND_Cara50_2026-09-28.png");
  });
});
