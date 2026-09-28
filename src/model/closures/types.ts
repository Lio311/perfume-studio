import type { BoxForm, BoxLatch } from "../types.ts";

/** Millimetres the geometry builder and the pose share. */
export interface ClosureDims {
  w: number;
  h: number;
  d: number;
  wall: number;
  baseH: number;
  lidT: number;
  /** Lid shell height. Lift-off variants set this; other structures can ignore it. */
  lidH: number;
  /** Visible neck between lid and base. Zero unless the lift-off variant is shoulder-neck. */
  neckH: number;
}

/** Extra layout inputs a structure may read. Lift-off uses the variant and the two lengths. */
export interface ClosureLayoutInput {
  variant?: string;
  neckMm?: number;
  lidDepthMm?: number;
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
  /**
   * "rotate" and "translate" are applied by the pose loop.
   * Any other kind (unfold, flaps, …) stays on the entry and is skipped here.
   */
  kind: string;
  axis: "x" | "y" | "z";
  closed: (dims: ClosureDims) => number;
  open: (dims: ClosureDims) => number;
  min: (dims: ClosureDims) => number;
  max: (dims: ClosureDims) => number;
}

/**
 * How one movable group reads the single openAmount.
 * PR-2 tweens openAmount from 0 to 1 and does not invent per-group timing.
 * delay and duration are fractions of that 0..1 span, matching the Codrops
 * folding-box pattern of one driver with a different ease on each flap.
 */
export interface GroupMotion {
  delay: number;
  duration: number;
  /** GSAP ease name. The pose mapper understands power1 and power2. */
  ease: string;
}

export interface ClosurePart {
  /** Group name. The geometry builder binds a pivot group with this id. */
  id: string;
  /** Pivot in the parent group's local millimetres. */
  pivot: (dims: ClosureDims) => [number, number, number];
  channels: MotionChannel[];
  motion: GroupMotion;
}

/** The picker chip this structure contributes. The chip sets the structure and a default latch. */
export interface StructurePreset {
  id: string;
  label: { he: string; en: string };
  latch: BoxLatch;
}

export interface LiftOffVariantOption {
  id: string;
  label: { he: string; en: string };
}

export interface LiftOffSpec {
  variants: readonly LiftOffVariantOption[];
  neckMm: readonly [number, number];
  lidDepthMm: readonly [number, number];
  defaults: { variant: string; neckMm: number; lidDepthMm: number };
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
  /** Professional name. The picker shows `preset.label`, not this. */
  label: { he: string; en: string };
  preset: StructurePreset;
  /** Saved ids from before structure and latch were split. */
  aliases?: readonly string[];
  /** Latches this structure accepts. Magnet is listed only where it is valid. */
  latches: readonly BoxLatch[];
  /** Catalog forms that select this structure. Unlisted forms stay on lift-off. */
  forms: readonly BoxForm[];
  /** Fraction of the outer height used as the tub before the lid. */
  baseHFactor: number;
  dims: ClosureDimsRange;
  /** Present on the two-piece / telescope entry. */
  liftOff?: LiftOffSpec;
  /** Present on the matchbox drawer. */
  pulls?: readonly string[];
  parts: ClosurePart[];
  /** Named beats. Their times follow each group's motion delay. */
  stages: ClosureStage[];
  /**
   * Optional motions this entry owns. unfold, rotate, and flaps are accepted as data.
   * Nothing in the registry switches on the type name.
   */
  motions?: readonly { type: string; params?: Record<string, unknown> }[];
  layout?: (
    box: { w: number; h: number; d: number },
    wall: number,
    lidT: number,
    input: ClosureLayoutInput | undefined,
  ) => ClosureDims;
}

export function closureDims(
  box: { w: number; h: number; d: number; boardMm: number },
  spec: Pick<ClosureSpec, "baseHFactor" | "layout">,
  input?: ClosureLayoutInput,
): ClosureDims {
  const wall = Math.max(box.boardMm, 1.2);
  const lidT = Math.max(wall * 2.8, 7);
  if (spec.layout) return spec.layout({ w: box.w, h: box.h, d: box.d }, wall, lidT, input);
  return {
    w: box.w,
    h: box.h,
    d: box.d,
    wall,
    baseH: box.h * spec.baseHFactor,
    lidT,
    lidH: lidT,
    neckH: 0,
  };
}

/** One openAmount, mapped through this group's delay and ease onto 0..1. */
export function groupAmount(motion: GroupMotion, openAmount: number): number {
  const delay = Math.min(1, Math.max(0, motion.delay));
  const span = Math.max(1e-4, motion.duration);
  const t = Math.min(1, Math.max(0, (openAmount - delay) / span));
  return ease01(t, motion.ease);
}

/** A group that occupies the whole openAmount. */
export function linearMotion(ease = "power2.inOut"): GroupMotion {
  return { delay: 0, duration: 1, ease };
}

/**
 * The GSAP power eases the pose uses so a test can read a group without playing a timeline.
 * power1 is quadratic, power2 is cubic. Anything else stays linear.
 */
export interface OpenMotion {
  type: string;
  params: Record<string, number | string | boolean | ReadonlyArray<number | string>>;
}

function motionParam(value: unknown): number | string | boolean | ReadonlyArray<number | string> | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "number" || typeof item === "string")) {
    return value as ReadonlyArray<number | string>;
  }
  return undefined;
}

/** Keeps whatever motion an entry declared. There is no list of legal type names here. */
export function readMotions(spec: { motions?: readonly { type?: unknown; params?: unknown }[] | undefined }): OpenMotion[] {
  const out: OpenMotion[] = [];
  for (const motion of spec.motions ?? []) {
    if (!motion || typeof motion.type !== "string" || !motion.type) continue;
    const params: OpenMotion["params"] = {};
    if (motion.params && typeof motion.params === "object") {
      for (const [key, value] of Object.entries(motion.params)) {
        const kept = motionParam(value);
        if (kept !== undefined) params[key] = kept;
      }
    }
    out.push({ type: motion.type, params });
  }
  return out;
}

export function ease01(t: number, name: string): number {
  if (name === "power1.in") return t * t;
  if (name === "power1.out") return 1 - (1 - t) * (1 - t);
  if (name === "power1.inOut") return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  if (name === "power2.in") return t * t * t;
  if (name === "power2.out") return 1 - (1 - t) ** 3;
  if (name === "power2.inOut") return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  return t;
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
