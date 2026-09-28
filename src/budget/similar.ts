import type { FinishId, NeckId, VariantPart } from "../model/types.ts";
import type { PartFacts } from "./types.ts";
import { capacityFitsVolume } from "./volume.ts";

/**
 * Similarity weights. A candidate must already share a kind and a compatible neck.
 * Dimensions 0.40, shape 0.30, material 0.20, finish affinity 0.10.
 */
export const SIMILARITY_WEIGHTS = { dimension: 0.4, shape: 0.3, material: 0.2, finish: 0.1 } as const;

/** Dimension gap that counts as a full design change for that kind, in millimetres. */
export const DIMENSION_TOLERANCE_MM: Record<VariantPart, number> = {
  bottle: 30,
  cap: 14,
  pump: 8,
  collar: 6,
  label: 12,
  box: 16,
};

export const MIN_ALTERNATIVE_SCORE = 0.5;
export const MIN_SAVING_ILS = 5;
export const MIN_SAVING_SCORE = 0.55;
export const MAX_DESIGN_CHANGE = 0.45;

export interface AxisDelta {
  width: number;
  height: number;
  depth: number;
  /** Root-sum-square of the three axis gaps. */
  rss: number;
}

export interface Similarity {
  score: number;
  dimension: number;
  shape: number;
  material: number;
  finish: number;
  delta: AxisDelta;
}

export interface Alternative {
  part: PartFacts;
  score: number;
  delta: AxisDelta;
  priceIls: number;
}

export interface SavingSwap {
  from: PartFacts;
  to: PartFacts;
  score: number;
  change: number;
  ratio: number;
  savingIls: number;
  delta: AxisDelta;
  priceIls: number;
  currentPriceIls: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function axisDelta(from: PartFacts, to: PartFacts): AxisDelta {
  const width = to.widthMm - from.widthMm;
  const height = to.heightMm - from.heightMm;
  const depth = to.depthMm - from.depthMm;
  return {
    width: round1(width),
    height: round1(height),
    depth: round1(depth),
    rss: round1(Math.hypot(width, height, depth)),
  };
}

export function necksCompatible(kind: VariantPart, reference: NeckId | null, candidate: NeckId | null): boolean {
  if (kind === "label" || kind === "box") return true;
  if (reference === null || candidate === null) return true;
  return reference === candidate;
}

function shapeFamily(section: string): string {
  if (section === "circle" || section === "oval") return "round";
  if (section === "rect" || section === "squircle") return "square";
  if (section === "hex" || section === "oct") return "facet";
  return section || "other";
}

function shapeScore(current: PartFacts, candidate: PartFacts): number {
  const sameSection = Boolean(current.section) && current.section === candidate.section;
  const sameProfile = Boolean(current.profile) && current.profile === candidate.profile;
  if (sameSection && sameProfile) return 1;
  if (sameSection) return 0.75;
  if (sameProfile) return 0.7;
  const family = shapeFamily(current.section);
  if (family !== "other" && family === shapeFamily(candidate.section)) return 0.45;
  return 0.1;
}

function materialScore(current: string, candidate: string): number {
  if (current && current === candidate) return 1;
  const groups = [
    ["zamac", "metal", "magnetic"],
    ["glass", "acrylic", "crystal", "surlyn"],
    ["surlyn", "acrylic"],
    ["wood"],
  ];
  let best = 0.15;
  for (const group of groups) {
    if (group.includes(current) && group.includes(candidate)) best = Math.max(best, 0.65);
  }
  return best;
}

function finishAffinity(material: string, finish: FinishId): number {
  if (finish === "wood" || finish === "leather") return material === "wood" ? 1 : 0.35;
  if (finish === "gold" || finish === "silver" || finish === "rose") {
    return material === "zamac" || material === "metal" || material === "magnetic" ? 1 : 0.55;
  }
  if (finish === "clear" || finish === "frosted" || finish === "tinted") {
    return material === "glass" || material === "acrylic" || material === "crystal" || material === "surlyn" ? 1 : 0.45;
  }
  return 0.7;
}

function dimensionScore(current: PartFacts, candidate: PartFacts): number {
  const rel =
    (Math.abs(current.widthMm - candidate.widthMm) / Math.max(current.widthMm, candidate.widthMm, 1) +
      Math.abs(current.heightMm - candidate.heightMm) / Math.max(current.heightMm, candidate.heightMm, 1) +
      Math.abs(current.depthMm - candidate.depthMm) / Math.max(current.depthMm, candidate.depthMm, 1)) /
    3;
  return clamp(1 - rel / 0.3, 0, 1);
}

/**
 * Null when the candidate is a different kind or the neck cannot take the current bottle.
 * `referenceNeck` is the bottle neck. Bottle candidates must share the current bottle neck.
 */
export function compareParts(current: PartFacts, candidate: PartFacts, finish: FinishId, referenceNeck: NeckId | null): Similarity | null {
  if (current.kind !== candidate.kind || current.id === candidate.id) return null;
  const neck = current.kind === "bottle" ? current.neck : referenceNeck;
  if (!necksCompatible(current.kind, neck, candidate.neck)) return null;
  const dimension = dimensionScore(current, candidate);
  const shape = shapeScore(current, candidate);
  const material = materialScore(current.material, candidate.material);
  const finishScore = finishAffinity(candidate.material, finish);
  const score =
    SIMILARITY_WEIGHTS.dimension * dimension +
    SIMILARITY_WEIGHTS.shape * shape +
    SIMILARITY_WEIGHTS.material * material +
    SIMILARITY_WEIGHTS.finish * finishScore;
  return { score, dimension, shape, material, finish: finishScore, delta: axisDelta(current, candidate) };
}

/** 0 is an identical part. 1 is a full change. Dimension tolerance scales the millimetre gap. */
export function designChange(score: number, deltaMm: number, kind: VariantPart): number {
  const dimChange = clamp(deltaMm / DIMENSION_TOLERANCE_MM[kind], 0, 1);
  return clamp(0.7 * (1 - score) + 0.3 * dimChange, 0, 1);
}

function volumeOk(part: PartFacts, volumeMl: number | null | undefined): boolean {
  if (part.kind !== "bottle" || volumeMl == null) return true;
  return capacityFitsVolume(part.fillMl, volumeMl);
}

export function suggestAlternatives(args: {
  current: PartFacts;
  catalog: PartFacts[];
  finish: FinishId;
  referenceNeck: NeckId | null;
  priceIls: (id: string) => number | null;
  maxPriceIls: number;
  volumeMl?: number | null;
  limit?: number;
}): Alternative[] {
  const found: Alternative[] = [];
  for (const part of args.catalog) {
    const compared = compareParts(args.current, part, args.finish, args.referenceNeck);
    if (!compared || compared.score < MIN_ALTERNATIVE_SCORE) continue;
    if (!volumeOk(part, args.volumeMl)) continue;
    const priceIls = args.priceIls(part.id);
    if (priceIls === null || priceIls > args.maxPriceIls + 1e-6) continue;
    found.push({ part, score: compared.score, delta: compared.delta, priceIls });
  }
  found.sort((a, b) => b.score - a.score || a.priceIls - b.priceIls);
  return found.slice(0, args.limit ?? 4);
}

export function rankCostReductions(args: {
  current: PartFacts;
  catalog: PartFacts[];
  finish: FinishId;
  referenceNeck: NeckId | null;
  priceIls: (id: string) => number | null;
  volumeMl?: number | null;
  limit?: number;
}): SavingSwap[] {
  const currentPrice = args.priceIls(args.current.id);
  if (currentPrice === null) return [];
  const found: SavingSwap[] = [];
  for (const part of args.catalog) {
    const compared = compareParts(args.current, part, args.finish, args.referenceNeck);
    if (!compared || compared.score < MIN_SAVING_SCORE) continue;
    if (!volumeOk(part, args.volumeMl)) continue;
    const priceIls = args.priceIls(part.id);
    if (priceIls === null) continue;
    const savingIls = currentPrice - priceIls;
    if (savingIls < MIN_SAVING_ILS) continue;
    const change = designChange(compared.score, compared.delta.rss, args.current.kind);
    if (change > MAX_DESIGN_CHANGE) continue;
    found.push({
      from: args.current,
      to: part,
      score: compared.score,
      change,
      ratio: savingIls / Math.max(change, 0.08),
      savingIls,
      delta: compared.delta,
      priceIls,
      currentPriceIls: currentPrice,
    });
  }
  found.sort((a, b) => b.ratio - a.ratio || b.savingIls - a.savingIls);
  return found.slice(0, args.limit ?? 8);
}

export function rankAssemblySavings(args: {
  currents: PartFacts[];
  catalog: (kind: VariantPart) => PartFacts[];
  finishOf: (part: PartFacts) => FinishId;
  referenceNeck: NeckId | null;
  priceIls: (id: string) => number | null;
  volumeMl?: number | null;
  limit?: number;
}): SavingSwap[] {
  const merged: SavingSwap[] = [];
  for (const current of args.currents) {
    merged.push(
      ...rankCostReductions({
        current,
        catalog: args.catalog(current.kind),
        finish: args.finishOf(current),
        referenceNeck: args.referenceNeck,
        priceIls: args.priceIls,
        volumeMl: args.volumeMl,
        limit: 4,
      }),
    );
  }
  merged.sort((a, b) => b.ratio - a.ratio || b.savingIls - a.savingIls);
  return merged.slice(0, args.limit ?? 8);
}
