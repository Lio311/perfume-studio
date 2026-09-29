/**
 * Seam for a later 3D / GLB export. The scanner records the frames and the
 * measured millimetres; it does not build a mesh.
 */
export interface MeshFrame {
  angle: string;
  width: number;
  height: number;
}

export interface MeshExportRequest {
  kind: string;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  lathe: number[] | null;
  frames: readonly MeshFrame[];
}

export function exportGlb(_request: MeshExportRequest): null {
  return null;
}
