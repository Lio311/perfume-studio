export interface PartMeshInput {
  kind: string;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  lathe: number[] | null;
  color?: string;
  name?: string;
}

export function glbFilename(kind: string, widthMm: number, heightMm: number, depthMm: number): string {
  const n = (value: number) => (Math.round(value * 100) / 100).toFixed(2);
  return `${kind}-${n(widthMm)}x${n(heightMm)}x${n(depthMm)}.glb`;
}

const ROUND = new Set(["bottle", "cap", "pump", "collar"]);

export function isRoundPart(kind: string): boolean {
  return ROUND.has(kind);
}
