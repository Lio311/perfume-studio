import type { BoxForm } from "../types.ts";

/** Millimetres the geometry builder and the pose share. */
export interface ClosureDims {
  w: number;
  h: number;
  d: number;
  wall: number;
  baseH: number;
  lidT: number;
}

export interface ClosureDimsRange {
  widthMm: readonly [number, number];
  depthMm: readonly [number, number];
  heightMm: readonly [number, number];
}

/** Outer-size clamps shared by the closures that ship today. A new entry can pass its own. */
export const STANDARD_DIMS: ClosureDimsRange = {
  widthMm: [36, 260],
  depthMm: [28, 220],
  heightMm: [48, 320],
};

export interface MotionChannel {
  kind: "rotate" | "translate";
  axis: "x" | "y" | "z";
  closed: (dims: ClosureDims) => number;
  open: (dims: ClosureDims) => number;
  min: (dims: ClosureDims) => number;
  max: (dims: ClosureDims) => number;
}

export interface ClosurePart {
  /** Group name. The geometry builder binds a pivot group with this id. */
  id: string;
  /** Pivot in the parent group's local millimetres. */
  pivot: (dims: ClosureDims) => [number, number, number];
  channels: MotionChannel[];
}

export interface ClosureStage {
  id: string;
  /** Part ids that move during this stage. */
  groups: string[];
}

export interface ClosureSpec {
  id: string;
  /** Picker order. Not a central list. */
  order: number;
  label: { he: string; en: string };
  /** Catalog forms that select this closure. Unlisted forms stay on lift-off. */
  forms: readonly BoxForm[];
  /** Fraction of the outer height used as the tub before the lid. */
  baseHFactor: number;
  dims: ClosureDimsRange;
  parts: ClosurePart[];
  /** Named beats. PR-2 drives these in order. */
  stages: ClosureStage[];
}

export function closureDims(
  box: { w: number; h: number; d: number; boardMm: number },
  spec: Pick<ClosureSpec, "baseHFactor">,
): ClosureDims {
  const wall = Math.max(box.boardMm, 1.2);
  return {
    w: box.w,
    h: box.h,
    d: box.d,
    wall,
    baseH: box.h * spec.baseHFactor,
    lidT: Math.max(wall * 2.8, 7),
  };
}

export function fixedChannel(
  kind: MotionChannel["kind"],
  axis: MotionChannel["axis"],
  closed: number,
  open: number,
  min: number,
  max: number,
): MotionChannel {
  return {
    kind,
    axis,
    closed: () => closed,
    open: () => open,
    min: () => min,
    max: () => max,
  };
}

export function sizedChannel(
  kind: MotionChannel["kind"],
  axis: MotionChannel["axis"],
  closed: (dims: ClosureDims) => number,
  open: (dims: ClosureDims) => number,
  min: (dims: ClosureDims) => number,
  max: (dims: ClosureDims) => number,
): MotionChannel {
  return { kind, axis, closed, open, min, max };
}

export function channelValue(channel: MotionChannel, dims: ClosureDims, amount: number): number {
  const closed = channel.closed(dims);
  const open = channel.open(dims);
  const raw = closed + (open - closed) * amount;
  const lo = Math.min(channel.min(dims), channel.max(dims));
  const hi = Math.max(channel.min(dims), channel.max(dims));
  return Math.min(hi, Math.max(lo, raw));
}
