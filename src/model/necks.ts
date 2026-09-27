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
 * FEA 15 ferrule is the measured standard: ID 15.35, OD 16.3, height 5.5–7.9.
 * FEA 13/18/20 keep that same 0.35 mm diametral clearance and 0.95 mm wall.
 */
export const NECKS: Record<NeckId, NeckStandard> = {
  FEA13: { id: "FEA13", diameterMm: 13, crimpMm: 5.6, ferrule: { innerMm: 13.35, outerMm: 14.3, heightMinMm: 5.0, heightMaxMm: 6.9 } },
  FEA15: { id: "FEA15", diameterMm: 15, crimpMm: 6.7, ferrule: { innerMm: 15.35, outerMm: 16.3, heightMinMm: 5.5, heightMaxMm: 7.9 } },
  FEA18: { id: "FEA18", diameterMm: 18, crimpMm: 7.6, ferrule: { innerMm: 18.35, outerMm: 19.3, heightMinMm: 6.2, heightMaxMm: 9.0 } },
  FEA20: { id: "FEA20", diameterMm: 20, crimpMm: 8.2, ferrule: { innerMm: 20.35, outerMm: 21.3, heightMinMm: 6.6, heightMaxMm: 9.6 } },
};

export const NECK_IDS = Object.keys(NECKS) as NeckId[];

export function neckRadius(id: NeckId): number {
  return NECKS[id].diameterMm / 2;
}
