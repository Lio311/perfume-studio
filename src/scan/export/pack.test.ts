import { describe, expect, it } from "vitest";
import { buildScanPack, todayDate } from "./pack.ts";

const base = {
  id: "sup-scan1",
  supplierName: "סריקה",
  createdAt: 1_758_000_000_000,
  kind: "bottle" as const,
  code: "SCAN-1",
  partName: "SCAN-1 · סריקה",
  widthMm: 40.2,
  heightMm: 102.4,
  depthMm: 39.6,
  profile: "cylinder",
  color: "#d8d2c8",
  capturedAt: "2026-09-29T08:00:00.000Z",
  confidence: 0.9,
  lathe: Array.from({ length: 42 }, () => 0.96),
  measurements: [
    { key: "widthMm", value: 40.2, source: "reference-card", toleranceMm: 5 },
    { key: "heightMm", value: 102.4, source: "reference-card", toleranceMm: 5 },
    { key: "depthMm", value: 39.6, source: "reference-card", toleranceMm: 5 },
  ],
};

describe("scan supplier pack", () => {
  it("validates and emits quotedAt as a calendar date", () => {
    const quotedAt = "2026-09-29";
    const result = buildScanPack({ ...base, priceValue: 12.5, currency: "ils", quotedAt });
    expect(result.ok, result.errors).toBe(true);
    const price = (result.pack.parts as Array<{ price: { quotedAt: string; currency: string } }>)[0].price;
    expect(price.quotedAt).toBe(quotedAt);
    expect(price.quotedAt).not.toContain("T");
    expect(price.currency).toBe("ILS");
  });

  it("omits a price when none was entered", () => {
    const result = buildScanPack(base);
    expect(result.ok, result.errors).toBe(true);
    expect(result.text).not.toContain("quotedAt");
  });

  it("refuses a pack the schema or the importer ranges reject", () => {
    const short = buildScanPack({ ...base, heightMm: 4 });
    expect(short.ok).toBe(false);
    expect(short.errors).toContain("heightMm");
    const color = buildScanPack({ ...base, color: "red" });
    expect(color.ok).toBe(false);
    expect(color.errors).toContain("color");
  });

  it("formats today as YYYY-MM-DD", () => {
    expect(todayDate(new Date("2026-09-29T22:30:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
