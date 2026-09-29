import type { OuterWrap } from "../../model/types.ts";
import type { RenderTier } from "../../store/labStore.ts";

export type VisibleWrap = Exclude<OuterWrap, "none">;

export interface OuterWrapMaterialProps {
  color: string;
  transparent: boolean;
  opacity: number;
  roughness: number;
  metalness: number;
  transmission?: number;
  thickness?: number;
  ior?: number;
  depthWrite?: boolean;
}

/**
 * Cellophane stays glassy. Tissue stays a thin sheet.
 * Sleeve and paper are an opaque shell so a bright foil mark cannot show through.
 */
export function outerWrapMaterialProps(kind: VisibleWrap, color: string, quality: RenderTier): OuterWrapMaterialProps {
  if (kind === "cellophane") {
    return {
      color: "#f7f8f4",
      transparent: true,
      opacity: quality === "high" ? 0.18 : 0.22,
      roughness: 0.06,
      metalness: 0,
      transmission: quality === "high" ? 0.9 : 0,
      thickness: 0.35,
      ior: 1.46,
      depthWrite: false,
    };
  }
  if (kind === "tissue") {
    return {
      color: "#f3ecdf",
      transparent: true,
      opacity: 0.55,
      roughness: 0.95,
      metalness: 0,
    };
  }
  return {
    color,
    transparent: false,
    opacity: 1,
    roughness: 0.78,
    metalness: 0,
    transmission: 0,
    thickness: 0,
    depthWrite: true,
  };
}
