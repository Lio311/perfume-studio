import { describe, expect, it } from "vitest";
import { BOTTLES } from "./bottles.ts";
import { createDefaultDesign, applyVariant } from "./design.ts";
import { computeFit } from "./fit.ts";
import { NECKS, neckRadius } from "./necks.ts";
import { bottleRadii, classicFinishMm, neckFinishMm, neckLipY } from "./sample.ts";

function withPump(bottleId: string, pumpId: string) {
  const design = createDefaultDesign();
  applyVariant(design, "bottle", bottleId);
  design.pump.variantId = pumpId;
  design.cap.visible = false;
  return design;
}

describe("crimp pump seats on the neck lip", () => {
  it("keeps the ferrule on a straight neck at least as tall as the crimp seat", () => {
    const seen = new Set<string>();
    expect(BOTTLES.length).toBeGreaterThan(40);
    for (const bottle of BOTTLES) {
      seen.add(bottle.profile);
      const neckR = neckRadius(bottle.neck);
      const crimp = NECKS[bottle.neck].crimpMm;
      const finish = neckFinishMm(bottle.heightMm, neckR, bottle.finishMm);
      const straightStart = bottle.heightMm - finish;
      // Main's finish is min(5.5, neckR * 0.85), which is shorter than every crimp seat.
      expect(classicFinishMm(neckR), `${bottle.id} main finish`).toBeLessThan(crimp);
      expect(finish, bottle.id).toBeGreaterThanOrEqual(crimp);
      const fit = computeFit(withPump(bottle.id, "pump-crimp"), true);
      expect(fit.collarBottom, `${bottle.id} ferrule bottom`).toBeGreaterThanOrEqual(straightStart - 1e-6);
      const under = bottleRadii(
        fit.collarBottom + 0.15,
        bottle.heightMm,
        bottle.widthMm,
        bottle.depthMm,
        bottle.profile,
        bottle.shoulder,
        neckR,
        bottle.finishMm,
      );
      expect(under.rx, bottle.id).toBeCloseTo(neckR, 1);
      expect(under.rz, bottle.id).toBeCloseTo(neckR, 1);
      const onSeat = bottleRadii(
        bottle.heightMm - crimp,
        bottle.heightMm,
        bottle.widthMm,
        bottle.depthMm,
        bottle.profile,
        bottle.shoulder,
        neckR,
        bottle.finishMm,
      );
      expect(onSeat.rx, `${bottle.id} crimp seat`).toBeCloseTo(neckR, 1);
    }
    expect(seen.has("sphere")).toBe(true);
    expect(seen.size).toBeGreaterThan(8);
  });

  it("keeps a crimp pump on the lip and a screw pump on the collar", () => {
    const bottle = BOTTLES.find((item) => item.id === "orb-50");
    if (!bottle) throw new Error("missing orb");
    const neckR = neckRadius(bottle.neck);
    const lip = neckLipY(bottle.heightMm, bottle.widthMm, bottle.depthMm, bottle.profile, bottle.shoulder, neckR, bottle.finishMm);
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
      bottle.finishMm,
    );
    expect(underCollar.rx).toBeCloseTo(neckR, 1);
    expect(screw.pumpBase).toBeGreaterThan(lip + 0.4);
  });

  it("lengthens steep bulbs and leaves a square shoulder at the crimp seat", () => {
    const sphere = BOTTLES.find((item) => item.profile === "sphere");
    if (!sphere) throw new Error("missing sphere");
    const neckR = neckRadius(sphere.neck);
    const crimp = NECKS[sphere.neck].crimpMm;
    const finish = neckFinishMm(sphere.heightMm, neckR, sphere.finishMm);
    expect(finish).toBeGreaterThan(crimp);
    expect(finish).toBeCloseTo(neckR * 0.98, 1);
    const onSeat = bottleRadii(
      sphere.heightMm - crimp * 0.9,
      sphere.heightMm,
      sphere.widthMm,
      sphere.depthMm,
      sphere.profile,
      sphere.shoulder,
      neckR,
      sphere.finishMm,
    );
    expect(onSeat.rx).toBeCloseTo(neckR, 1);
    expect(onSeat.rz).toBeCloseTo(neckR, 1);

    const cara = BOTTLES.find((item) => item.id === "cara-50");
    if (!cara) throw new Error("missing cara");
    const caraFinish = neckFinishMm(cara.heightMm, neckRadius(cara.neck), cara.finishMm);
    expect(caraFinish).toBeCloseTo(NECKS[cara.neck].crimpMm, 1);
    expect(caraFinish).toBeLessThan(neckRadius(cara.neck) * 0.98);

    for (const id of ["barrel-100", "cube-50", "disc-30"]) {
      const bottle = BOTTLES.find((item) => item.id === id);
      if (!bottle) throw new Error(`missing ${id}`);
      const radius = neckRadius(bottle.neck);
      const seat = NECKS[bottle.neck].crimpMm;
      const long = neckFinishMm(bottle.heightMm, radius, bottle.finishMm);
      expect(long, id).toBeGreaterThan(classicFinishMm(radius));
      expect(long, id).toBeGreaterThanOrEqual(seat);
      expect(long, id).toBeCloseTo(Math.max(seat, radius * 0.98), 1);
    }
  });
});
