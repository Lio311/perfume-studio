import { afterEach, describe, expect, it } from "vitest";
import { capById } from "../model/catalog.ts";
import { parseCatalogPages } from "./parseCatalog.ts";
import { partFromDraft, syncRegistry } from "./registry.ts";

const PAGE = `
CAP-4412 Zamac cap FEA 15
Ø 30 mm H 34 mm
Ref 4412

ZM-3301 Zamac cap FEA15
Dia. 30mm H: 35mm
Item No. ZM-3301

CAP-2208 Surlyn closure
Diameter 28 mm Height 22 mm FEA15

BOX-100 Gift box carton
80 x 120 x 70 mm
Ref GB-100

BOX-200 Rigid coffret
W 90 mm H 140 mm D 80 mm

LBL-12 Label sticker
40 x 25 mm

BTL-50 Glass bottle 50 ml
51 x 67.6 x 43 mm FEA 15
Ref 43419

PMP-08 Spray pump FEA 15
Actuator H 18 mm

COL-15 Collar ferrule FEA 15
Height 6.5 mm
`;

describe("parseCatalogPages", () => {
  afterEach(() => syncRegistry([]));

  it("reads caps, boxes, labels, bottles, pumps and collars", () => {
    const items = parseCatalogPages([{ page: 1, text: PAGE }]);
    const byCode = new Map(items.map((item) => [item.code, item]));
    expect(byCode.get("CAP-4412")).toMatchObject({ kind: "cap", widthMm: 30, heightMm: 34, neck: "FEA15" });
    expect(byCode.get("ZM-3301")).toMatchObject({ kind: "cap", widthMm: 30, heightMm: 35, neck: "FEA15" });
    expect(byCode.get("CAP-2208")).toMatchObject({ kind: "cap", widthMm: 28, heightMm: 22, neck: "FEA15" });
    expect(byCode.get("BOX-100")).toMatchObject({ kind: "box", widthMm: 80, heightMm: 120, depthMm: 70 });
    expect(byCode.has("GB-100")).toBe(false);
    expect(byCode.get("BOX-200")).toMatchObject({ kind: "box", widthMm: 90, heightMm: 140, depthMm: 80 });
    expect(byCode.get("LBL-12")).toMatchObject({ kind: "label", widthMm: 40, heightMm: 25 });
    expect(byCode.get("BTL-50")).toMatchObject({ kind: "bottle", widthMm: 51, depthMm: 43, heightMm: 67.6, neck: "FEA15", capacityMl: 50 });
    expect(byCode.get("PMP-08")).toMatchObject({ kind: "pump", neck: "FEA15", heightMm: 18 });
    expect(byCode.get("COL-15")).toMatchObject({ kind: "collar", heightMm: 6.5, neck: "FEA15" });
  });

  it("reads Hebrew and Arabic supplier lines", () => {
    const items = parseCatalogPages([{
      page: 2,
      text: "פקק זהב FEA 15\nקוטר 32 מ״מ גובה 40 מ״מ\nקוד PK-77\n\nغطاء زاماك FEA 15\nقطر 29 mm ارتفاع 33 mm\nكود AR-15\n\nعلبة كرتون\n90 x 110 x 60 mm\nكود BX-AR",
    }]);
    expect(items.find((item) => item.code === "PK-77")).toMatchObject({ kind: "cap", widthMm: 32, heightMm: 40, neck: "FEA15" });
    expect(items.find((item) => item.code === "AR-15")).toMatchObject({ kind: "cap", widthMm: 29, heightMm: 33, neck: "FEA15" });
    expect(items.find((item) => item.code === "BX-AR")).toMatchObject({ kind: "box", widthMm: 90, heightMm: 110, depthMm: 60 });
  });

  it("skips a supplier title that only names a kind", () => {
    const items = parseCatalogPages([{
      page: 1,
      text: "Aurora Closures Shanghai\nCAP-4412 Zamac cap FEA 15\nDia 30 mm H 34 mm\nRef 4412",
    }]);
    expect(items.map((item) => item.code)).toEqual(["CAP-4412"]);
  });

  it("converts centimetres and skips a page that has no text", () => {
    const items = parseCatalogPages([
      { page: 1, text: "Wooden cap\nDiameter 2.8 cm Height 3.2 cm FEA 13" },
      { page: 2, text: "   " },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "cap", widthMm: 28, heightMm: 32, neck: "FEA13" });
  });

  it("registers a parsed cap so the lab can build it at those millimetres", () => {
    const draft = parseCatalogPages([{ page: 1, text: PAGE }]).find((item) => item.code === "ZM-3301");
    expect(draft).toBeTruthy();
    const part = partFromDraft(draft!, { id: "aurora", name: "Aurora Closures" }, 0);
    syncRegistry([{ id: "aurora", name: "Aurora Closures", createdAt: 1, parts: [part] }]);
    expect(capById(part.id)).toMatchObject({ heightMm: 35, widthMm: 30 });
  });

  it("handles relaxed regexes and tolerance for measurements", () => {
    const items = parseCatalogPages([{
      page: 1,
      text: "CAP-001 cap\n ⌀: 30.5mm H = 40 mm\n\nBTL-002 glass bottle\n20x30x40\n50ml\n\nLBL-003 Sticker\nW=35 H=45"
    }]);
    expect(items.find(i => i.code === "CAP-001")).toMatchObject({ widthMm: 30.5, heightMm: 40 });
    expect(items.find(i => i.code === "BTL-002")).toMatchObject({ widthMm: 20, heightMm: 30, depthMm: 40, capacityMl: 50 });
    expect(items.find(i => i.code === "LBL-003")).toMatchObject({ widthMm: 35, heightMm: 45 });
  });
});
