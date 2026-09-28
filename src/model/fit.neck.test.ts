import { describe, expect, it } from "vitest";
import { BOTTLES } from "./bottles.ts";
import { createDefaultDesign, applyVariant } from "./design.ts";
import { computeFit } from "./fit.ts";
import { NECKS, neckRadius } from "./necks.ts";
import { bottleRadii, neckFinishMm, neckLipY } from "./sample.ts";

function withPump(bottleId: string, pumpId: string) {
  const design = createDefaultDesign();
  applyVariant(design, "bottle", bottleId);
  design.pump.variantId = pumpId;
  design.cap.visible = false;
  return design;
}

describe("crimp pump seats on the neck lip", () => {
  it("matches the pump base to the neck top on every bottle shape", () => {
    const seen = new Set<string>();
    expect(BOTTLES.length).toBeGreaterThan(40);
    for (const bottle of BOTTLES) {
      seen.add(bottle.profile);
      const neckR = neckRadius(bottle.neck);
      const lip = neckLipY(bottle.heightMm, bottle.widthMm, bottle.depthMm, bottle.profile, bottle.shoulder, neckR);
      const fit = computeFit(withPump(bottle.id, "pump-crimp"), true);
      expect(lip, bottle.id).toBeGreaterThan(bottle.heightMm * 0.7);
      expect(fit.pumpBase, bottle.id).toBeCloseTo(lip, 1);
    }
    expect(seen.has("sphere")).toBe(true);
    expect(seen.size).toBeGreaterThan(8);
  });

  it("keeps a crimp pump on the lip and a screw pump on the collar", () => {
    const bottle = BOTTLES.find((item) => item.id === "orb-50");
    if (!bottle) throw new Error("missing orb");
    const neckR = neckRadius(bottle.neck);
    const lip = neckLipY(bottle.heightMm, bottle.widthMm, bottle.depthMm, bottle.profile, bottle.shoulder, neckR);
    const crimp = computeFit(withPump(bottle.id, "pump-crimp"), true);
    const screw = computeFit(withPump(bottle.id, "pump-screw"), true);
    expect(crimp.pumpBase).toBeCloseTo(lip, 1);
    expect(crimp.collarTop).toBeCloseTo(lip, 1);
    expect(crimp.collarBottom).toBeLessThan(lip - 4);
    const underCollar = bottleRadii(
      crimp.collarBottom + 0.3,
      bottle.heightMm,
      bottle.widthMm,
      bottle.depthMm,
      bottle.profile,
      bottle.shoulder,
      neckR,
    );
    expect(underCollar.rx).toBeCloseTo(neckR, 1);
    expect(screw.pumpBase).toBeGreaterThan(lip + 0.4);
  });

  it("gives the sphere a finish tall enough for the crimp seat", () => {
    const bottle = BOTTLES.find((item) => item.profile === "sphere");
    if (!bottle) throw new Error("missing sphere");
    const neckR = neckRadius(bottle.neck);
    const crimp = NECKS[bottle.neck].crimpMm;
    const finish = neckFinishMm(bottle.heightMm, neckR, bottle.profile);
    expect(finish).toBeGreaterThan(crimp);
    const onSeat = bottleRadii(
      bottle.heightMm - crimp * 0.9,
      bottle.heightMm,
      bottle.widthMm,
      bottle.depthMm,
      bottle.profile,
      bottle.shoulder,
      neckR,
    );
    expect(onSeat.rx).toBeCloseTo(neckR, 1);
    expect(onSeat.rz).toBeCloseTo(neckR, 1);
    const cara = BOTTLES.find((item) => item.id === "cara-50");
    if (!cara) throw new Error("missing cara");
    expect(neckFinishMm(cara.heightMm, neckRadius(cara.neck), cara.profile)).toBeCloseTo(5.5, 1);
  });
});
