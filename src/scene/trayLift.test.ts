import { describe, expect, it } from "vitest";
import { revealRiseMm } from "./trayLift.ts";

describe("reveal rise", () => {
  it("lifts at least 60% of the bottle above the rim when open", () => {
    const bottle = 100;
    const rim = 78;
    expect(revealRiseMm(rim, bottle, 0, 0.4)).toBe(0);
    const full = revealRiseMm(rim, bottle, 1, 0.4);
    const glassTop = bottle + full;
    expect(glassTop - rim).toBeGreaterThanOrEqual(bottle * 0.6 - 0.01);
  });

  it("stays down until the drawer has slid", () => {
    const early = revealRiseMm(110, 90, 0.5, 0.7);
    const late = revealRiseMm(110, 90, 1, 0.7);
    expect(early).toBe(0);
    expect(late).toBeGreaterThan(20);
  });
});
