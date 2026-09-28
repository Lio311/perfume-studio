import { channelValue, closureDims, type ClosureDims, type ClosureSpec, type MotionChannel } from "./types.ts";

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

/** Known id, or lift-off. A non-empty unknown id warns once. */
export function resolveClosure(id: unknown): ClosureSpec {
  if (typeof id === "string" && id) {
    const found = byId.get(id);
    if (found) return found;
    if (!warned.has(id)) {
      warned.add(id);
      console.warn(`Unknown box closure "${id}". Using lift-off.`);
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

export function poseAt(spec: ClosureSpec, dims: ClosureDims, amount: number): PoseSample[] {
  return spec.parts.flatMap((part) =>
    part.channels.map((channel) => ({
      group: part.id,
      kind: channel.kind,
      axis: channel.axis,
      value: channelValue(channel, dims, amount),
    })),
  );
}

export function partPivot(spec: ClosureSpec, id: string, dims: ClosureDims): [number, number, number] {
  const part = spec.parts.find((item) => item.id === id);
  return part ? part.pivot(dims) : [0, 0, 0];
}

export { closureDims };
