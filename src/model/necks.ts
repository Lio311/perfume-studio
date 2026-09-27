import type { NeckId } from "./types.ts";

export interface NeckStandard {
  id: NeckId;
  diameterMm: number;
  /** Typical metal crimp / ferrule height for this finish. */
  crimpMm: number;
}

export const NECKS: Record<NeckId, NeckStandard> = {
  FEA13: { id: "FEA13", diameterMm: 13, crimpMm: 6.2 },
  FEA15: { id: "FEA15", diameterMm: 15, crimpMm: 7.4 },
  FEA18: { id: "FEA18", diameterMm: 18, crimpMm: 8.6 },
  FEA20: { id: "FEA20", diameterMm: 20, crimpMm: 9.4 },
};

export const NECK_IDS = Object.keys(NECKS) as NeckId[];

export function neckRadius(id: NeckId): number {
  return NECKS[id].diameterMm / 2;
}
