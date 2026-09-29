import { bandRank, confidenceModel, type DimensionConfidence, scanConfidence } from "./confidence.ts";
import { planarDimensions, planarFaceFromPlane, planarFaceFromScale, roundDimensions, type Dimensions } from "./dimensions.ts";
import { extractProfile, type LatheProfile } from "./profile.ts";
import {
  type ScaleReference,
  type ScaleSolution,
  SCALE_LIMITS,
  scaleUsable,
  solveScale,
} from "./scale.ts";
import { evaluateScaleRule } from "./scaleRule.ts";
import { classifyShape, type PartKind, type ShapeHint } from "./shape.ts";
import { rowsOf, type Silhouette } from "./silhouette.ts";
import type { CameraIntrinsics, PixelSize } from "./poseMath.ts";

export const PACKKIT_VERSION = "0.1.0";

export interface Measurement {
  key: string;
  value: number;
  source: string;
  toleranceMm: number;
}

export interface ScanInfo {
  method: string;
  capturedAt: string;
  device: string | null;
  appVersion: string | null;
  material: string | null;
  scale: string | null;
  referenceObject: string | null;
  confidence: number | null;
  dimsVerifiedBySupplier: boolean;
  toleranceMm: number;
}

export interface MeasureResult {
  kind: PartKind;
  dimensions: Dimensions;
  profile: LatheProfile | null;
  lathe: number[] | null;
  neckOuterDiameterMm: number | null;
  shape: ShapeHint;
  measurements: Measurement[];
  scan: ScanInfo | null;
  confidence: DimensionConfidence[];
  issues: import("./scale.ts").MeasureIssue[];
  suspect: boolean;
  saveBlocked: boolean;
  dimsVerifiedBySupplier: boolean;
  toleranceMm: number;
  scale: ScaleSolution | null;
}

export interface MeasureRequest {
  kind: PartKind;
  intrinsics: CameraIntrinsics;
  frame: PixelSize;
  reference?: ScaleReference | null;
  autoScale?: ScaleReference | null;
  front?: Silhouette | null;
  side?: Silhouette | null;
  lidarDepthMm?: number | null;
  outlineEdited?: boolean;
  capturedAt?: string;
  device?: string | null;
}

export function estimateMeasure(request: MeasureRequest): MeasureResult {
  const extent = request.front ? pixelExtent(request.front) : null;
  const manual = request.reference
    ? solveScale(request.reference, request.intrinsics, request.frame, extent, request.lidarDepthMm ?? null)
    : null;
  const auto = request.autoScale
    ? solveScale(request.autoScale, request.intrinsics, request.frame, extent, request.lidarDepthMm ?? null)
    : null;
  const manualUsable = manual != null && scaleUsable(manual);
  const chosen = manualUsable ? manual : auto != null && scaleUsable(auto) ? auto : manual;
  const measured = chosen ? measurePart(request, chosen) : null;
  const size = measured ? Math.max(measured.dimensions.widthMm, measured.dimensions.heightMm, measured.dimensions.depthMm) : 0;
  const manualHeight = manualUsable ? measured?.dimensions.heightMm ?? null : null;
  const autoHeight = autoPixelHeight(request, auto);
  const rule = evaluateScaleRule(
    request.kind,
    size,
    manualUsable && isReferenceObject(manual?.source ?? null),
    manualUsable && manual?.source === "typed",
    auto != null && scaleUsable(auto),
    manualHeight,
    autoHeight,
  );
  const issues = rule.issues.slice();
  const failure = chosen?.issue ?? manual?.issue ?? null;
  if (failure) issues.unshift(failure);
  const usableScale = manualUsable || (auto != null && scaleUsable(auto) && !rule.autoRejected);
  const blocked = rule.saveBlocked || chosen?.issue?.blocksSave === true || measured == null || !usableScale;
  const quant = quantisation(chosen, request.intrinsics);
  const parallax = measured?.parallaxResidualMm ?? 0;
  const scaleIsUsable = usableScale && measured != null;
  const error = confidenceModel(
    chosen?.sigmaScaleMm ?? 10,
    quant,
    parallax,
    scaleIsUsable,
    request.outlineEdited === true,
  );
  const dimensions = measured?.dimensions ?? { widthMm: 0, heightMm: 0, depthMm: 0 };
  const keys = confidenceKeys(request.kind, measured?.neckOuterDiameterMm ?? null);
  const confidence = keys.map((key) => ({ key, model: error }));
  const worst = confidence.map((item) => item.model.band).reduce((best, band) => (bandRank(band) < bandRank(best) ? band : best), "retake" as const);
  const scan = makeScan(request, chosen, worst);
  const measurements = makeMeasurements(measured, chosen?.measurementSource ?? "estimate");
  const saveBlocked = blocked || issues.some((issue) => issue.blocksSave);
  return {
    kind: request.kind,
    dimensions,
    profile: measured?.profile ?? null,
    lathe: measured?.lathe ?? null,
    neckOuterDiameterMm: measured?.neckOuterDiameterMm ?? null,
    shape: measured?.shape ?? "other",
    measurements,
    scan,
    confidence,
    issues,
    suspect: rule.suspect,
    saveBlocked,
    dimsVerifiedBySupplier: false,
    toleranceMm: SCALE_LIMITS.toleranceMillimetres,
    scale: chosen,
  };
}

interface MeasuredPart {
  dimensions: Dimensions;
  profile: LatheProfile | null;
  lathe: number[] | null;
  neckOuterDiameterMm: number | null;
  shape: ShapeHint;
  parallaxResidualMm: number;
}

function measurePart(request: MeasureRequest, scale: ScaleSolution): MeasuredPart | null {
  if (!scaleUsable(scale) || !request.front) return null;
  if (isRound(request.kind)) {
    const distance = scale.source === "card" ? scale.depthMm : null;
    const extraction = extractProfile(request.front, request.intrinsics, distance, scale.mmPerPx);
    if (!extraction) return null;
    return {
      dimensions: roundDimensions(request.kind, extraction),
      profile: extraction.profile,
      lathe: extraction.profile.normalized,
      neckOuterDiameterMm: extraction.neckOuterDiameterMm,
      shape: classifyShape(extraction.observedRadiiMm, extraction.rectangleFit, request.kind),
      parallaxResidualMm: extraction.parallaxResidualMm,
    };
  }
  const face = scale.plane && scale.source === "card"
    ? planarFaceFromPlane(request.front, scale.plane)
    : planarFaceFromScale(request.front, scale.mmPerPx);
  if (!face) return null;
  let side = null;
  if (request.side) {
    side = scale.plane && scale.source === "card"
      ? planarFaceFromPlane(request.side, scale.plane)
      : planarFaceFromScale(request.side, scale.mmPerPx);
  }
  return {
    dimensions: planarDimensions(request.kind, face, side),
    profile: null,
    lathe: null,
    neckOuterDiameterMm: null,
    shape: classifyShape([face.widthMm / 2, face.widthMm / 2, face.widthMm / 2, face.widthMm / 2], face.rectangleFit, request.kind),
    parallaxResidualMm: 0,
  };
}

function autoPixelHeight(request: MeasureRequest, auto: ScaleSolution | null): number | null {
  if (!auto || !scaleUsable(auto) || !request.front) return null;
  const rows = rowsOf(request.front);
  if (!rows.length) return null;
  return (rows[rows.length - 1].y - rows[0].y + 1) * auto.mmPerPx;
}

function pixelExtent(mask: Silhouette): { widthPx: number; heightPx: number } | null {
  const rows = rowsOf(mask);
  if (!rows.length) return null;
  const width = rows.reduce((best, row) => Math.max(best, row.right - row.left + 1), 0);
  return { widthPx: width, heightPx: rows[rows.length - 1].y - rows[0].y + 1 };
}

function isRound(kind: PartKind): boolean {
  return kind === "bottle" || kind === "cap" || kind === "pump" || kind === "collar";
}

function isReferenceObject(source: ScaleSolution["source"] | null): boolean {
  return source === "card" || source === "coin" || source === "ruler" || source === "custom";
}

function quantisation(scale: ScaleSolution | null, intrinsics: CameraIntrinsics): number {
  if (scale?.depthMm != null && intrinsics.fx > 0) return (0.5 * scale.depthMm) / intrinsics.fx;
  if (scale?.mmPerPx && scale.mmPerPx > 0) return 0.5 * scale.mmPerPx;
  return 0;
}

function confidenceKeys(kind: PartKind, neck: number | null): string[] {
  const keys = ["widthMm", "heightMm", "depthMm"];
  if (isRound(kind) && neck != null) keys.push("neckOuterDiameterMm");
  return keys;
}

function makeScan(request: MeasureRequest, scale: ScaleSolution | null, band: DimensionConfidence["model"]["band"]): ScanInfo {
  const capturedAt = request.capturedAt ?? "2026-09-29T00:00:00Z";
  const device = request.device ?? null;
  if (!scale) {
    return {
      method: "manual",
      capturedAt,
      device,
      appVersion: null,
      material: null,
      scale: null,
      referenceObject: null,
      confidence: scanConfidence("retake"),
      dimsVerifiedBySupplier: false,
      toleranceMm: SCALE_LIMITS.toleranceMillimetres,
    };
  }
  let method: string;
  if (scale.source === "autoObjectCapture") method = "object-capture";
  else if (scale.issue == null && isRound(request.kind)) method = "photo-lathe";
  else if (scale.source === "card") method = "single-photo";
  else method = scale.scanMethod;
  return {
    method,
    capturedAt,
    device,
    appVersion: PACKKIT_VERSION,
    material: null,
    scale: scale.scanScale,
    referenceObject: scale.referenceObject,
    confidence: scanConfidence(band),
    dimsVerifiedBySupplier: false,
    toleranceMm: SCALE_LIMITS.toleranceMillimetres,
  };
}

function makeMeasurements(measured: MeasuredPart | null, source: string): Measurement[] {
  if (!measured) return [];
  const dims = measured.dimensions;
  const items = [
    measurement("widthMm", dims.widthMm, source),
    measurement("heightMm", dims.heightMm, source),
    measurement("depthMm", dims.depthMm, source),
  ];
  if (Math.abs(dims.widthMm - dims.depthMm) < 1e-6 && dims.widthMm > 0) items.push(measurement("diameterMm", dims.widthMm, source));
  if (measured.neckOuterDiameterMm != null) items.push(measurement("neckOuterDiameterMm", measured.neckOuterDiameterMm, source));
  return items;
}

function measurement(key: string, value: number, source: string): Measurement {
  return { key, value, source, toleranceMm: SCALE_LIMITS.toleranceMillimetres };
}
