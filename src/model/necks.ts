import type { NeckId } from "./types.ts";

export interface FerruleSpec {
  /** Inside diameter the collar must clear. */
  innerMm: number;
  /** Outside diameter of the standard crimp ferrule. */
  outerMm: number;
  heightMinMm: number;
  heightMaxMm: number;
}

export interface NeckStandard {
  id: NeckId;
  diameterMm: number;
  /** Seating overlap of the standard ferrule on the glass neck. */
  crimpMm: number;
  ferrule: FerruleSpec;
}

/**
 * Ferrule diameters and heights from EN 14849 (inner Ø / outer Ø / height).
 * crimpMm is the seating overlap, kept inside that published height band.
 */
export const NECKS: Record<NeckId, NeckStandard> = {
  FEA13: { id: "FEA13", diameterMm: 13, crimpMm: 5.6, ferrule: { innerMm: 13.35, outerMm: 14.3, heightMinMm: 4.7, heightMaxMm: 7.1 } },
  FEA15: { id: "FEA15", diameterMm: 15, crimpMm: 6.7, ferrule: { innerMm: 15.35, outerMm: 16.3, heightMinMm: 5.5, heightMaxMm: 7.9 } },
  FEA17: { id: "FEA17", diameterMm: 17, crimpMm: 7.1, ferrule: { innerMm: 16.9, outerMm: 17.9, heightMinMm: 5.9, heightMaxMm: 8.3 } },
  FEA18: { id: "FEA18", diameterMm: 18, crimpMm: 7.6, ferrule: { innerMm: 18.6, outerMm: 19.6, heightMinMm: 5.5, heightMaxMm: 8.3 } },
  FEA20: { id: "FEA20", diameterMm: 20, crimpMm: 8.2, ferrule: { innerMm: 20.1, outerMm: 21.1, heightMinMm: 5.6, heightMaxMm: 9.0 } },
};

export const NECK_IDS = Object.keys(NECKS) as NeckId[];

export function neckRadius(id: NeckId): number {
  return NECKS[id].diameterMm / 2;
}
