import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("dompurify", () => ({
  default: { sanitize: (value: string) => value },
}));

import { importedPrice, syncRegistry } from "./registry.ts";
import { parsePackFile } from "./supplierDb.ts";

const basePart = {
  id: "aurora-cap",
  kind: "cap",
  code: "CAP-1",
  name: "CAP-1 · Aurora",
  neck: "FEA15",
  widthMm: 30,
  heightMm: 32,
  depthMm: 30,
  capacityMl: null,
  profile: "cylinder",
  color: "#c4a15a",
  thumb: "",
  page: 1,
};

describe("parsePackFile prices", () => {
  afterEach(() => syncRegistry([]));

  it("imports an old pack that has no price field", () => {
    const pack = parsePackFile(JSON.stringify({
      name: "Legacy",
      parts: [{ id: "legacy-cap", kind: "cap", name: "Old cap", code: "OLD" }],
    }));
    expect(pack).toBeTruthy();
    expect(pack!.version).toBeUndefined();
    expect(pack!.parts).toHaveLength(1);
    expect(pack!.parts[0].price).toBeUndefined();
    expect(pack!.parts[0].name).toBe("Old cap");
    syncRegistry([pack!]);
    expect(importedPrice("legacy-cap")).toBeUndefined();
  });

  it("keeps an optional price, MOQ, and tiers, and registers the price", () => {
    const pack = parsePackFile(JSON.stringify({
      id: "aurora",
      name: "Aurora",
      createdAt: 10,
      parts: [{
        ...basePart,
        price: {
          value: 4.5,
          currency: "usd",
          moq: 5000,
          tiers: [
            { qty: 5000, value: 4.5 },
            { qty: 20000, value: 3.9 },
          ],
        },
      }],
    }));
    expect(pack!.parts[0].price).toEqual({
      value: 4.5,
      currency: "USD",
      moq: 5000,
      tiers: [
        { qty: 5000, value: 4.5 },
        { qty: 20000, value: 3.9 },
      ],
    });
    syncRegistry([pack!]);
    expect(importedPrice("aurora-cap")).toMatchObject({ value: 4.5, currency: "USD", moq: 5000 });
  });

  it("drops a broken price and still imports the part", () => {
    const pack = parsePackFile(JSON.stringify({
      name: "Mixed",
      parts: [
        { ...basePart, id: "bad", price: { value: "4", currency: "USD" } },
        { ...basePart, id: "good", price: { value: 12, currency: "ILS" } },
      ],
    }));
    expect(pack!.parts.map((part) => part.id)).toEqual(["bad", "good"]);
    expect(pack!.parts[0].price).toBeUndefined();
    expect(pack!.parts[1].price).toEqual({ value: 12, currency: "ILS" });
  });

  it("keeps unknown pack fields so a later version can ride along", () => {
    const pack = parsePackFile(JSON.stringify({
      name: "Scan",
      version: 2,
      source: "scan",
      parts: [{ ...basePart, measurements: [{ name: "height", mm: 32 }] }],
    }));
    expect(pack!.version).toBe(2);
    expect((pack as { source?: string }).source).toBe("scan");
    expect((pack!.parts[0] as { measurements?: unknown[] }).measurements).toEqual([{ name: "height", mm: 32 }]);
    expect(pack!.parts[0].price).toBeUndefined();
  });
});
