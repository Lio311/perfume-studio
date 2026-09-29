import { hypot3 } from "./measureMath.ts";
import { SCALE_LIMITS } from "./scale.ts";

export type ConfidenceBand = "ok" | "check" | "retake";

export interface DimensionErrorModel {
  sigmaScaleMm: number;
  sigmaQuantisationMm: number;
  sigmaParallaxMm: number;
  totalMm: number;
  band: ConfidenceBand;
}

export interface DimensionConfidence {
  key: string;
  model: DimensionErrorModel;
}

export function confidenceModel(
  sigmaScaleMm: number,
  sigmaQuantisationMm: number,
  sigmaParallaxMm: number,
  hasScale: boolean,
  outlineEdited: boolean,
): DimensionErrorModel {
  const scale = hasScale ? Math.max(0, sigmaScaleMm) : 0;
  const quant = hasScale ? Math.max(0, sigmaQuantisationMm) : 0;
  const parallax = hasScale ? Math.max(0, sigmaParallaxMm) : 0;
  let total = hasScale ? hypot3(scale, quant, parallax) : 10;
  if (hasScale && outlineEdited) total = Math.max(total, 4);
  let band: ConfidenceBand;
  if (!hasScale || total > SCALE_LIMITS.checkErrorMillimetres) band = "retake";
  else if (total > SCALE_LIMITS.okErrorMillimetres) band = "check";
  else band = "ok";
  return { sigmaScaleMm: scale, sigmaQuantisationMm: quant, sigmaParallaxMm: parallax, totalMm: total, band };
}

export function scanConfidence(band: ConfidenceBand): number {
  if (band === "ok") return 0.9;
  if (band === "check") return 0.55;
  return 0.2;
}

export function bandRank(band: ConfidenceBand): number {
  if (band === "retake") return 0;
  if (band === "check") return 1;
  return 2;
}
