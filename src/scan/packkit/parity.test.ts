import { describe, expect, it } from "vitest";
import vectorsText from "../../../fixtures/packkit/m3a-vectors.json?raw";
import measuredText from "../../../fixtures/packkit/m3a-measured.json?raw";
import { confidenceModel } from "./confidence.ts";
import { correctedRadius, correctBoxFront, correctRound, flatEndDepthMm, radiusAboutAxis, radiusFromTangents, roundFactor } from "./parallax.ts";
import { classifyShape } from "./shape.ts";
import { evaluateScaleRule } from "./scaleRule.ts";
import { cardReference, coinById, solveScale, SCALE_LIMITS } from "./scale.ts";
import { rescaleDimensions, rescaleResult } from "./rescale.ts";
import { estimateMeasure } from "./estimator.ts";
import { SYNTHETIC_FRAME, SYNTHETIC_INTRINSICS, cardCorners, cylinderMask, domeMask, filledMask, measureSynthetic, quadMask, sphereMask, taperMask } from "./synthetic.ts";
import { v2 } from "./vec.ts";
import { ID1 } from "./poseMath.ts";

const measured = JSON.parse(measuredText) as {
  toleranceMm: number;
  bottle: { measuredMm: { heightMm: number; widthMm: number; depthMm: number }; tilts: number[]; axes: string[] };
  cap: { measuredMm: { heightMm: number; widthMm: number; depthMm: number }; tilts: number[] };
  box: { measuredMm: { heightMm: number; widthMm: number; depthMm: number }; tilt: number };
  label: { measuredMm: { heightMm: number; widthMm: number; depthMm: number } };
  worstNoise1pxMm: number;
};

const vectors = JSON.parse(vectorsText) as {
  cardFrontal: { tilt: number; axis: string; centerX: number; depthMm: number; tiltDegrees: number; tolerance: number };
  customCard: { widthMm: number; heightMm: number; label: string };
  coin: { id: string; p1: number[]; p2: number[]; mmPerPx: number };
  ruler: { p1: number[]; p2: number[]; mm: number; mmPerPx: number };
  customTap: { p1: number[]; p2: number[]; mm: number; mmPerPx: number };
  typed: { axis: "height"; mm: number; widthPx: number; heightPx: number; mmPerPx: number };
  bottle: { radius: number; heightMm: number; widthMm: number; depthMm: number; toleranceMm: number };
  cap: { radius: number; heightMm: number; widthMm: number; depthMm: number; toleranceMm: number };
  parallax: { apparent: number; distance: number; iterations: number };
};

describe("PackKit M3a parity", () => {
  it("matches the iterated parallax factor", () => {
    const { apparent, distance, iterations } = vectors.parallax;
    const once = (apparent * (distance - apparent)) / distance;
    const twice = (apparent * (distance - once)) / distance;
    expect(correctedRadius(apparent, distance, iterations)).toBeCloseTo(twice, 9);
    const radius = correctedRadius(apparent, distance, iterations);
    expect(roundFactor(radius, distance)).toBeCloseTo((distance - twice) / distance, 9);
    expect(correctRound(100, 200, 20)).toBeCloseTo(90, 9);
    expect(correctBoxFront(42)).toBe(42);
    expect(flatEndDepthMm(200, 20)).toBeCloseTo(160, 12);
  });

  it("matches the tangent radius", () => {
    const intrinsics = SYNTHETIC_INTRINSICS;
    const distance = 200;
    const radius = 20;
    const axisZ = distance - radius;
    const axisX = 30;
    const centre = Math.atan(axisX / axisZ);
    const distanceToAxis = Math.hypot(axisX, axisZ);
    const half = Math.asin(radius / distanceToAxis);
    const left = intrinsics.cx + intrinsics.fx * Math.tan(centre - half);
    const right = intrinsics.cx + intrinsics.fx * Math.tan(centre + half);
    expect(radiusFromTangents(left, right, intrinsics, distance)).toBeCloseTo(radius, 6);
    expect(radiusAboutAxis(left, right, intrinsics, axisX, axisZ)).toBeCloseTo(radius, 6);
  });

  it("matches the frontal card depth and the steep-card rejection", () => {
    const frontal = vectors.cardFrontal;
    const corners = cardCorners(frontal.tilt, frontal.axis, 0, 1, frontal.centerX);
    const solved = solveScale(cardReference(corners), SYNTHETIC_INTRINSICS, SYNTHETIC_FRAME);
    expect(solved.issue).toBeNull();
    expect(solved.depthMm).toBeCloseTo(frontal.depthMm, 2);
    expect(solved.tiltDegrees).toBeCloseTo(frontal.tiltDegrees, 2);
    expect(solved.cardAreaFraction ?? 0).toBeGreaterThanOrEqual(SCALE_LIMITS.minimumCardAreaFraction);
    const halfW = ID1.widthMm / 2;
    const halfH = ID1.heightMm / 2;
    const back = solved.plane ? solved.plane : null;
    expect(back).not.toBeNull();
    const mapped = back && importPlane(back, corners[0]);
    expect(mapped?.x).toBeCloseTo(-halfW, 1);
    expect(mapped?.y).toBeCloseTo(-halfH, 1);
    expect(solved.referenceObject).toBe("ISO/IEC 7810 ID-1 card 85.60x53.98mm");
    expect(solved.scanScale).toBe("reference-card");

    const custom = { widthMm: vectors.customCard.widthMm, heightMm: vectors.customCard.heightMm };
    const customCorners = cardCorners(0, "y", 0, 1, 0, custom);
    const customSolve = solveScale(cardReference(customCorners, custom), SYNTHETIC_INTRINSICS, SYNTHETIC_FRAME);
    expect(customSolve.depthMm).toBeCloseTo(200, 1);
    expect(customSolve.referenceObject).toBe(vectors.customCard.label);

    const tiny = solveScale(cardReference(corners), SYNTHETIC_INTRINSICS, { width: 5000, height: 4000 });
    expect(tiny.issue?.code).toBe("card_too_small");
    expect(tiny.issue?.blocksSave).toBe(true);

    const steep = cardCorners(30, "x", 0, 1, 0);
    const tilted = solveScale(cardReference(steep), SYNTHETIC_INTRINSICS, SYNTHETIC_FRAME);
    expect(tilted.issue?.code).toBe("card_tilt");
    expect(tilted.tiltDegrees ?? 0).toBeGreaterThan(25);
  });

  it("maps a 10° card back onto the plane within 0.2 mm", () => {
    const corners = cardCorners(10, "y", 0, 1, 0);
    const solved = solveScale(cardReference(corners), SYNTHETIC_INTRINSICS, SYNTHETIC_FRAME);
    const halfW = ID1.widthMm / 2;
    const halfH = ID1.heightMm / 2;
    const expected = [v2(-halfW, -halfH), v2(halfW, -halfH), v2(halfW, halfH), v2(-halfW, halfH)];
    expect(solved.plane).not.toBeNull();
    for (let index = 0; index < 4; index += 1) {
      const got = solved.plane && importPlane(solved.plane, corners[index]);
      expect(Math.abs((got?.x ?? Number.NaN) - expected[index].x)).toBeLessThanOrEqual(0.2);
      expect(Math.abs((got?.y ?? Number.NaN) - expected[index].y)).toBeLessThanOrEqual(0.2);
    }
  });

  it("matches coin, ruler, custom, and typed scales", () => {
    const coin = coinById(vectors.coin.id);
    expect(coin?.diameterMm).toBe(22);
    const solved = solveScale(
      { kind: "coin", p1: v2(vectors.coin.p1[0], vectors.coin.p1[1]), p2: v2(vectors.coin.p2[0], vectors.coin.p2[1]), diameterMm: coin!.diameterMm },
      SYNTHETIC_INTRINSICS,
      SYNTHETIC_FRAME,
    );
    expect(solved.mmPerPx).toBeCloseTo(vectors.coin.mmPerPx, 9);
    expect(solved.source).toBe("coin");
    expect(solved.sigmaScaleMm).toBeGreaterThanOrEqual(3);

    const ruler = solveScale(
      { kind: "ruler", p1: v2(vectors.ruler.p1[0], vectors.ruler.p1[1]), p2: v2(vectors.ruler.p2[0], vectors.ruler.p2[1]), mm: vectors.ruler.mm },
      SYNTHETIC_INTRINSICS,
      SYNTHETIC_FRAME,
    );
    expect(ruler.mmPerPx).toBeCloseTo(vectors.ruler.mmPerPx, 9);
    expect(ruler.scanScale).toBe("ruler");
    expect(ruler.measurementSource).toBe("ruler");

    const custom = solveScale(
      { kind: "custom", p1: v2(0, 0), p2: v2(vectors.customTap.p2[0], 0), mm: vectors.customTap.mm },
      SYNTHETIC_INTRINSICS,
      SYNTHETIC_FRAME,
    );
    expect(custom.mmPerPx).toBeCloseTo(vectors.customTap.mmPerPx, 9);

    const typed = solveScale(
      { kind: "typed", axis: "height", mm: vectors.typed.mm },
      SYNTHETIC_INTRINSICS,
      SYNTHETIC_FRAME,
      { widthPx: vectors.typed.widthPx, heightPx: vectors.typed.heightPx },
    );
    expect(typed.mmPerPx).toBeCloseTo(vectors.typed.mmPerPx, 9);
    expect(typed.scanScale).toBe("manual");
  });

  it("classifies the named profiles", () => {
    const flat = Array(42).fill(20);
    expect(classifyShape(flat, 0.99, "bottle")).toBe("cylinder");
    expect(classifyShape(flat, 0.99, "box")).toBe("cube");
    expect(classifyShape(flat, 0.99, "label")).toBe("other");
    const taper = Array.from({ length: 42 }, (_, index) => 20 - (10 * index) / 41);
    expect(classifyShape(taper, 0.2, "bottle")).toBe("taper");
    const dome = Array(42).fill(18);
    for (let index = 30; index < 42; index += 1) {
      const t = (index - 30) / 11;
      dome[index] = 18 * Math.sqrt(Math.max(0, 1 - t * t));
    }
    expect(classifyShape(dome, 0.7, "cap")).toBe("dome");
    const sphere = Array.from({ length: 42 }, (_, index) => {
      const t = index / 41;
      return 26 * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
    });
    expect(classifyShape(sphere, 0.1, "bottle")).toBe("sphere");
  });

  it("rescales one axis uniformly", () => {
    const scaled = rescaleDimensions({ widthMm: 40, heightMm: 100, depthMm: 40 }, "height", 80);
    expect(scaled.heightMm).toBeCloseTo(80, 9);
    expect(scaled.widthMm).toBeCloseTo(32, 9);
    expect(scaled.depthMm).toBeCloseTo(32, 9);
  });

  it("blocks a cap without a reference and allows a large bottle on auto scale", () => {
    for (const kind of ["cap", "pump", "collar"] as const) {
      const blocked = evaluateScaleRule(kind, 30, false, false, false, null, null);
      expect(blocked.saveBlocked).toBe(true);
      expect(blocked.issues.map((issue) => issue.code)).toEqual(["scale_reference_required"]);
    }
    const bottle = evaluateScaleRule("bottle", 100, false, false, true, null, 100);
    expect(bottle.autoRejected).toBe(false);
    expect(bottle.saveBlocked).toBe(false);
    const flag = evaluateScaleRule("bottle", 100, true, false, true, 100, 105.1);
    expect(flag.suspect).toBe(true);
    expect(flag.saveBlocked).toBe(false);
    const exact = evaluateScaleRule("bottle", 100, true, false, true, 100, 105);
    expect(exact.suspect).toBe(false);
  });

  it("measures the synthetic bottle and cap within PackKit's tolerance", () => {
    const bottle = cylinderMask(vectors.bottle.radius, vectors.bottle.heightMm);
    const cap = cylinderMask(vectors.cap.radius, vectors.cap.heightMm);
    for (const tilt of [0, 10, -10]) {
      for (const axis of ["y", "x"]) {
        const measured = measureSynthetic("bottle", bottle, tilt, axis);
        expect(measured.dimensions.heightMm).toBeCloseTo(vectors.bottle.heightMm, 0);
        expect(Math.abs(measured.dimensions.heightMm - vectors.bottle.heightMm)).toBeLessThanOrEqual(vectors.bottle.toleranceMm);
        expect(Math.abs(measured.dimensions.widthMm - vectors.bottle.widthMm)).toBeLessThanOrEqual(vectors.bottle.toleranceMm);
        expect(Math.abs(measured.dimensions.depthMm - vectors.bottle.depthMm)).toBeLessThanOrEqual(vectors.bottle.toleranceMm);
        if (tilt === 0 && axis === "y") {
          expect(measured.saveBlocked).toBe(false);
          expect(measured.suspect).toBe(false);
          expect(measured.dimsVerifiedBySupplier).toBe(false);
          expect(measured.toleranceMm).toBe(5);
          expect(measured.scan?.scale).toBe("reference-card");
          expect(measured.confidence[0]?.model.band).toBe("ok");
          expect(measured.confidence[0]?.model.totalMm).toBeLessThanOrEqual(3);
          expect(measured.lathe).toHaveLength(42);
          expect(measured.lathe?.every((sample) => sample >= 0.04 && sample <= 1.2)).toBe(true);
          expect(measured.shape).toBe("cylinder");
        }
      }
    }
    for (const tilt of [0, 10, -10]) {
      const measured = measureSynthetic("cap", cap, tilt, "y");
      expect(Math.abs(measured.dimensions.heightMm - vectors.cap.heightMm)).toBeLessThanOrEqual(vectors.cap.toleranceMm);
      expect(Math.abs(measured.dimensions.widthMm - vectors.cap.widthMm)).toBeLessThanOrEqual(vectors.cap.toleranceMm);
    }
  });

  it("names a taper, a dome, a sphere, a box, and a label", () => {
    expect(measureSynthetic("bottle", taperMask(20, 10, 90, 80), 0, "y").shape).toBe("taper");
    expect(measureSynthetic("cap", domeMask(18, 60), 0, "y").shape).toBe("dome");
    expect(measureSynthetic("bottle", sphereMask(26), 0, "y").shape).toBe("sphere");
    const front = quadMask(v2(75, 0), 60, 100, 0, "y", 0);
    const side = quadMask(v2(-95, 0), 40, 100, 0, "y", 0);
    const box = estimateMeasure({
      kind: "box",
      intrinsics: SYNTHETIC_INTRINSICS,
      frame: SYNTHETIC_FRAME,
      reference: cardReference(cardCorners(0, "y", 0, 1, 0)),
      front,
      side,
    });
    expect(Math.abs(box.dimensions.widthMm - 60)).toBeLessThanOrEqual(2);
    expect(Math.abs(box.dimensions.heightMm - 100)).toBeLessThanOrEqual(2);
    expect(Math.abs(box.dimensions.depthMm - 40)).toBeLessThanOrEqual(2);
    expect(box.shape).toBe("cube");
    const label = estimateMeasure({
      kind: "label",
      intrinsics: SYNTHETIC_INTRINSICS,
      frame: SYNTHETIC_FRAME,
      reference: cardReference(cardCorners(0, "y", 0, 1, 0)),
      front: quadMask(v2(70, 0), 80, 36, 0, "y", 0),
    });
    expect(Math.abs(label.dimensions.widthMm - 80)).toBeLessThanOrEqual(2);
    expect(Math.abs(label.dimensions.heightMm - 36)).toBeLessThanOrEqual(2);
    expect(label.dimensions.depthMm).toBeCloseTo(0, 6);
  });

  it("matches the coin, ruler, and typed measurement paths", () => {
    const mask = filledMask(100, 300, 200, 600);
    const coin = estimateMeasure({
      kind: "bottle",
      intrinsics: SYNTHETIC_INTRINSICS,
      frame: SYNTHETIC_FRAME,
      reference: { kind: "coin", p1: v2(0, 0), p2: v2(100, 0), diameterMm: 22 },
      front: mask,
    });
    expect(coin.dimensions.heightMm).toBeCloseTo(88, 1);
    expect(coin.dimensions.widthMm).toBeCloseTo(44, 1);
    expect(coin.confidence[0]?.model.band).toBe("check");
    expect(coin.saveBlocked).toBe(false);

    const ruler = estimateMeasure({
      kind: "label",
      intrinsics: SYNTHETIC_INTRINSICS,
      frame: SYNTHETIC_FRAME,
      reference: { kind: "ruler", p1: v2(0, 0), p2: v2(250, 0), mm: 50 },
      front: mask,
    });
    expect(ruler.dimensions.widthMm).toBeCloseTo(40, 1);
    expect(ruler.dimensions.heightMm).toBeCloseTo(80, 1);
    expect(ruler.dimensions.depthMm).toBeCloseTo(0, 9);
    expect(ruler.measurements.find((item) => item.key === "widthMm")?.source).toBe("ruler");

    const typed = estimateMeasure({
      kind: "bottle",
      intrinsics: SYNTHETIC_INTRINSICS,
      frame: SYNTHETIC_FRAME,
      reference: { kind: "typed", axis: "height", mm: 100 },
      front: mask,
    });
    expect(typed.dimensions.heightMm).toBeCloseTo(100, 1);
    expect(typed.dimensions.widthMm).toBeCloseTo(50, 1);
    expect(typed.confidence[0]?.model.band).toBe("check");
  });

  it("matches the iOS printed millimetres within 0.05 mm", () => {
    const bottleMask = cylinderMask(vectors.bottle.radius, vectors.bottle.heightMm);
    const capMask = cylinderMask(vectors.cap.radius, vectors.cap.heightMm);
    for (const tilt of measured.bottle.tilts) {
      for (const axis of measured.bottle.axes) {
        const got = measureSynthetic("bottle", bottleMask, tilt, axis).dimensions;
        expect(Math.abs(got.heightMm - measured.bottle.measuredMm.heightMm)).toBeLessThanOrEqual(measured.toleranceMm);
        expect(Math.abs(got.widthMm - measured.bottle.measuredMm.widthMm)).toBeLessThanOrEqual(measured.toleranceMm);
        expect(Math.abs(got.depthMm - measured.bottle.measuredMm.depthMm)).toBeLessThanOrEqual(measured.toleranceMm);
      }
    }
    for (const tilt of measured.cap.tilts) {
      const got = measureSynthetic("cap", capMask, tilt, "y").dimensions;
      expect(Math.abs(got.heightMm - measured.cap.measuredMm.heightMm)).toBeLessThanOrEqual(measured.toleranceMm);
      expect(Math.abs(got.widthMm - measured.cap.measuredMm.widthMm)).toBeLessThanOrEqual(measured.toleranceMm);
      expect(Math.abs(got.depthMm - measured.cap.measuredMm.depthMm)).toBeLessThanOrEqual(measured.toleranceMm);
    }
    const box = estimateMeasure({
      kind: "box",
      intrinsics: SYNTHETIC_INTRINSICS,
      frame: SYNTHETIC_FRAME,
      reference: cardReference(cardCorners(measured.box.tilt, "y", 0, 1, 0)),
      front: quadMask(v2(75, 0), 60, 100, measured.box.tilt, "y", 0),
      side: quadMask(v2(-95, 0), 40, 100, measured.box.tilt, "y", 0),
    });
    expect(Math.abs(box.dimensions.heightMm - measured.box.measuredMm.heightMm)).toBeLessThanOrEqual(measured.toleranceMm);
    expect(Math.abs(box.dimensions.widthMm - measured.box.measuredMm.widthMm)).toBeLessThanOrEqual(measured.toleranceMm);
    expect(Math.abs(box.dimensions.depthMm - measured.box.measuredMm.depthMm)).toBeLessThanOrEqual(measured.toleranceMm);
    const label = estimateMeasure({
      kind: "label",
      intrinsics: SYNTHETIC_INTRINSICS,
      frame: SYNTHETIC_FRAME,
      reference: cardReference(cardCorners(0, "y", 0, 1, 0)),
      front: quadMask(v2(70, 0), 80, 36, 0, "y", 0),
    });
    expect(Math.abs(label.dimensions.heightMm - measured.label.measuredMm.heightMm)).toBeLessThanOrEqual(measured.toleranceMm);
    expect(Math.abs(label.dimensions.widthMm - measured.label.measuredMm.widthMm)).toBeLessThanOrEqual(measured.toleranceMm);
    expect(Math.abs(label.dimensions.depthMm - measured.label.measuredMm.depthMm)).toBeLessThanOrEqual(measured.toleranceMm);

    let worst = 0;
    for (let seed = 1; seed <= 4; seed += 1) {
      for (const tilt of [10, -10]) {
        const noisy = measureSynthetic("bottle", bottleMask, tilt, "y", 1, seed).dimensions;
        worst = Math.max(worst, Math.abs(noisy.heightMm - 100), Math.abs(noisy.widthMm - 40), Math.abs(noisy.depthMm - 40));
      }
    }
    expect(Math.abs(worst - measured.worstNoise1pxMm)).toBeLessThanOrEqual(measured.toleranceMm);
  });

  it("keeps the scale bands: auto from 80 mm, ok to 3 mm, check to 5 mm, suspect past 5 mm", () => {
    expect(SCALE_LIMITS.minimumCardAreaFraction).toBe(0.08);
    expect(SCALE_LIMITS.maximumCardTiltDegrees).toBe(25);
    expect(SCALE_LIMITS.strongTiltDegrees).toBe(15);
    expect(SCALE_LIMITS.minimumAutoMillimetres).toBe(80);
    expect(SCALE_LIMITS.okErrorMillimetres).toBe(3);
    expect(SCALE_LIMITS.checkErrorMillimetres).toBe(5);
    expect(SCALE_LIMITS.suspectDisagreementMillimetres).toBe(5);
    expect(evaluateScaleRule("box", 80, false, false, true, null, 80).saveBlocked).toBe(false);
    expect(evaluateScaleRule("bottle", 79.9, false, false, true, null, 79.9).autoRejected).toBe(true);
    expect(confidenceModel(3, 0, 0, true, false).band).toBe("ok");
    expect(confidenceModel(3.01, 0, 0, true, false).band).toBe("check");
    expect(confidenceModel(5, 0, 0, true, false).band).toBe("check");
    expect(confidenceModel(5.01, 0, 0, true, false).band).toBe("retake");
  });

  it("keeps the normalised lathe when the height is edited", () => {
    const measured = measureSynthetic("bottle", cylinderMask(20, 100), 0, "y");
    const edited = rescaleResult(measured, "height", 80);
    const factor = 80 / measured.dimensions.heightMm;
    expect(edited.dimensions.heightMm).toBeCloseTo(80, 6);
    expect(edited.dimensions.widthMm).toBeCloseTo(measured.dimensions.widthMm * factor, 6);
    expect(edited.lathe).toEqual(measured.lathe);
    expect(edited.profile?.radiiMm[0]).toBeCloseTo((measured.profile?.radiiMm[0] ?? Number.NaN) * factor, 6);
    expect(edited.dimsVerifiedBySupplier).toBe(false);
    expect(edited.measurements.find((item) => item.key === "heightMm")?.value).toBeCloseTo(80, 6);
  });
});

function importPlane(plane: { planeFromImage: number[] }, pixel: { x: number; y: number }) {
  const h = plane.planeFromImage;
  const x = h[0] * pixel.x + h[1] * pixel.y + h[2];
  const y = h[3] * pixel.x + h[4] * pixel.y + h[5];
  const w = h[6] * pixel.x + h[7] * pixel.y + h[8];
  return { x: x / w, y: y / w };
}
