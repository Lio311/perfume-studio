/**
 * The scan route loads three.js only for the model step (`view/PartStage.tsx`)
 * and GLTFExporter only when the operator exports (`mesh/glb.ts`).
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
