import { bandRank, type ConfidenceBand, type DimensionConfidence } from "./confidence.ts";
import type { Dimensions } from "./dimensions.ts";
import { SCALE_LIMITS } from "./scale.ts";
import type { MeasureAxis } from "./scale.ts";
import type { LatheProfile } from "./profile.ts";
import type { MeasureResult } from "./estimator.ts";

const LINEAR_KEYS = new Set(["widthMm", "heightMm", "depthMm", "diameterMm", "neckOuterDiameterMm"]);

export function rescaleDimensions(dimensions: Dimensions, axis: MeasureAxis, millimetres: number): Dimensions {
  const current = axis === "height" ? dimensions.heightMm : dimensions.widthMm;
  if (!Number.isFinite(current) || !(current > 0) || !Number.isFinite(millimetres) || !(millimetres > 0)) return dimensions;
  const factor = millimetres / current;
  return {
    widthMm: dimensions.widthMm * factor,
    heightMm: dimensions.heightMm * factor,
    depthMm: dimensions.depthMm * factor,
  };
}

export function rescaleResult(result: MeasureResult, axis: MeasureAxis, millimetres: number): MeasureResult {
  const current = axis === "height" ? result.dimensions.heightMm : result.dimensions.widthMm;
  if (!Number.isFinite(current) || !(current > 0) || !Number.isFinite(millimetres) || !(millimetres > 0)) return result;
  const factor = millimetres / current;
  const copy: MeasureResult = {
    ...result,
    dimensions: rescaleDimensions(result.dimensions, axis, millimetres),
    neckOuterDiameterMm: result.neckOuterDiameterMm == null ? null : result.neckOuterDiameterMm * factor,
    profile: scaleProfile(result.profile, factor),
    measurements: result.measurements.map((item) => ({
      ...item,
      value: LINEAR_KEYS.has(item.key) ? item.value * factor : item.value,
    })),
    confidence: result.confidence.map((item) => rescaleConfidence(item, factor)),
    dimsVerifiedBySupplier: false,
    toleranceMm: SCALE_LIMITS.toleranceMillimetres,
  };
  if (copy.scan) {
    const worst = copy.confidence.map((item) => item.model.band).reduce<ConfidenceBand>(
      (best, band) => (bandRank(band) < bandRank(best) ? band : best),
      "retake",
    );
    copy.scan = {
      ...copy.scan,
      dimsVerifiedBySupplier: false,
      toleranceMm: SCALE_LIMITS.toleranceMillimetres,
      confidence: worst === "ok" ? 0.9 : worst === "check" ? 0.55 : 0.2,
    };
  }
  return copy;
}

function scaleProfile(profile: LatheProfile | null, factor: number): LatheProfile | null {
  if (!profile) return null;
  return {
    ...profile,
    radiiMm: profile.radiiMm.map((value) => value * factor),
    heightMm: profile.heightMm * factor,
  };
}

function rescaleConfidence(item: DimensionConfidence, factor: number): DimensionConfidence {
  const model = {
    sigmaScaleMm: item.model.sigmaScaleMm * Math.abs(factor),
    sigmaQuantisationMm: item.model.sigmaQuantisationMm * Math.abs(factor),
    sigmaParallaxMm: item.model.sigmaParallaxMm * Math.abs(factor),
    totalMm: item.model.totalMm * Math.abs(factor),
    band: item.model.band,
  };
  if (model.totalMm > SCALE_LIMITS.checkErrorMillimetres) model.band = "retake";
  else if (model.totalMm > SCALE_LIMITS.okErrorMillimetres) model.band = "check";
  else model.band = "ok";
  return { key: item.key, model };
}
