import type { NeckId, VariantPart } from "../model/types.ts";

/** Per-unit brief collected before assembly. The ceiling is always ILS. */
export interface BudgetBrief {
  ceilingIls: number;
  volumeMl: number;
  confirmed: boolean;
}

/** A price the user typed for one catalog id. Stored with the rest of the lab. */
export interface PriceOverride {
  value: number;
  currency: string;
}

/**
 * Comparable view of a built-in or imported part.
 * Millimetres are the catalog figures used for similarity, not the live scaled design.
 */
export interface PartFacts {
  id: string;
  kind: VariantPart;
  nameHe: string;
  nameEn: string;
  /** Null means the part follows the bottle neck (built-in caps, pumps, collars). */
  neck: NeckId | null;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  section: string;
  profile: string;
  material: string;
  /** Nominal perfume fill for bottles. Null for other kinds. */
  fillMl: number | null;
  supplierName: string | null;
  /** True when a glass house or supplier name is attached. Drives the example-price band only. */
  namedSupplier: boolean;
}

export const BUDGET_KINDS = ["bottle", "cap", "pump", "collar", "label", "box"] as const satisfies readonly VariantPart[];
