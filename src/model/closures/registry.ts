import type { BoxLatch } from "../types.ts";
import { channelValue, closureDims, groupAmount, type ClosureDims, type ClosureSpec, type MotionChannel } from "./types.ts";

/**
 * Closures register themselves. Adding one is a new file in this folder
 * (default export of a ClosureSpec) plus a geometry builder at
 * `src/scene/closures/build/<id>.tsx` and a test. Nothing else lists them.
 */
const modules = import.meta.glob(["./*.ts", "!./registry.ts", "!./types.ts", "!./*.test.ts"], { eager: true }) as Record<
  string,
  { default?: ClosureSpec }
>;

const byId = new Map<string, ClosureSpec>();
for (const mod of Object.values(modules)) {
  const spec = mod.default;
  if (!spec || typeof spec.id !== "string" || !spec.parts) continue;
  byId.set(spec.id, spec);
}

const warned = new Set<string>();

export function listClosures(): ClosureSpec[] {
  return [...byId.values()].sort((a, b) => a.order - b.order);
}

export function closureById(id: string): ClosureSpec | undefined {
  return byId.get(id);
}

export interface PackChoice {
  structure: ClosureSpec;
  latch: BoxLatch;
}

/** A structure id, a preset id, or a legacy closure id such as "magnetic". */
export function packById(id: string): PackChoice | undefined {
  const direct = byId.get(id);
  if (direct) return { structure: direct, latch: direct.preset.latch };
  for (const spec of byId.values()) {
    if (spec.preset.id === id || spec.aliases?.includes(id)) {
      return { structure: spec, latch: spec.preset.latch };
    }
  }
  return undefined;
}

/** Known structure, preset, or legacy id, or lift-off. A non-empty unknown id warns once. */
export function resolveClosure(id: unknown): ClosureSpec {
  if (typeof id === "string" && id) {
    const found = packById(id);
    if (found) return found.structure;
    if (!warned.has(id)) {
      warned.add(id);
      console.warn(`Unknown box structure "${id}". Using lift-off.`);
    }
  }
  const fallback = byId.get("lift-off");
  if (!fallback) throw new Error("lift-off closure is missing from the registry");
  return fallback;
}

export interface PoseSample {
  group: string;
  kind: MotionChannel["kind"];
  axis: MotionChannel["axis"];
  value: number;
}

/** Fully open channels. This is the pose the studio shows when the box is open. */
export function openPose(spec: ClosureSpec, dims: ClosureDims): PoseSample[] {
  return poseAt(spec, dims, 1);
}

/** One named stage at its open end. Other groups stay closed. */
export function stagePose(spec: ClosureSpec, dims: ClosureDims, stageId: string): PoseSample[] {
  const stage = spec.stages.find((item) => item.id === stageId);
  const moving = new Set(stage?.groups ?? []);
  return spec.parts.flatMap((part) =>
    part.channels.map((channel) => ({
      group: part.id,
      kind: channel.kind,
      axis: channel.axis,
      value: channelValue(channel, dims, moving.has(part.id) ? 1 : 0),
    })),
  );
}

export interface OpenDriverGroup {
  id: string;
  delay: number;
  duration: number;
  ease: string;
}

/** The single parameter PR-2 tweens, plus the per-group delay and ease already declared on the entry. */
export interface OpenDriver {
  param: "openAmount";
  from: 0;
  to: 1;
  groups: OpenDriverGroup[];
}

export function openDriver(spec: ClosureSpec): OpenDriver {
  return {
    param: "openAmount",
    from: 0,
    to: 1,
    groups: spec.parts.map((part) => ({
      id: part.id,
      delay: part.motion.delay,
      duration: part.motion.duration,
      ease: part.motion.ease,
    })),
  };
}

export function poseAt(spec: ClosureSpec, dims: ClosureDims, openAmount: number): PoseSample[] {
  return spec.parts.flatMap((part) =>
    part.channels.map((channel) => ({
      group: part.id,
      kind: channel.kind,
      axis: channel.axis,
      value: channelValue(channel, dims, groupAmount(part.motion, openAmount)),
    })),
  );
}

export function partPivot(spec: ClosureSpec, id: string, dims: ClosureDims): [number, number, number] {
  const part = spec.parts.find((item) => item.id === id);
  return part ? part.pivot(dims) : [0, 0, 0];
}

export { closureDims };
