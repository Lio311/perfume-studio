import { sizedChannel, STANDARD_DIMS, type ClosureDims, type ClosureLayoutInput, type ClosureSpec } from "./types.ts";

const NECK_MM: readonly [number, number] = [6, 36];
const LID_MM: readonly [number, number] = [12, 160];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Top of the shoulder the bottle has to clear. A telescope has no neck, so the rim is the base. */
export function liftOpeningRim(dims: ClosureDims): number {
  if (dims.neckH <= 0) return dims.baseH;
  return dims.baseH + dims.neckH + Math.min(dims.lidH * 0.35, 8);
}

/** Closed lid origin. Shoulder-neck sits above the visible neck; a full telescope starts at the floor. */
export function liftClosedY(dims: ClosureDims): number {
  if (dims.neckH > 0) return dims.baseH + dims.neckH;
  if (dims.lidH >= dims.h - 0.5) return 0;
  return Math.max(0, dims.h - dims.lidH);
}

/** Full telescope sleeve. Partial and shoulder-neck keep a lid that stays over the base. */
function fullTelescope(dims: ClosureDims): boolean {
  return dims.neckH <= 0 && dims.lidH >= dims.h * 0.9;
}

function layout(
  box: { w: number; h: number; d: number },
  wall: number,
  lidT: number,
  input: ClosureLayoutInput | undefined,
): ClosureDims {
  const variant = input?.variant || "shoulder-neck";
  const base = {
    w: box.w,
    h: box.h,
    d: box.d,
    wall,
    lidT,
  };
  if (variant === "telescope-full") {
    return { ...base, baseH: box.h, lidH: box.h, neckH: 0 };
  }
  if (variant === "telescope-partial") {
    const lidH = clamp(input?.lidDepthMm ?? 28, LID_MM[0], Math.min(LID_MM[1], box.h * 0.55));
    return { ...base, baseH: box.h, lidH, neckH: 0 };
  }
  let lidH = clamp(input?.lidDepthMm ?? 28, LID_MM[0], Math.min(LID_MM[1], box.h * 0.45));
  let neckH = clamp(input?.neckMm ?? 14, NECK_MM[0], NECK_MM[1]);
  const minBase = Math.max(28, box.h * 0.4);
  if (minBase + neckH + lidH > box.h) {
    const room = Math.max(0, box.h - minBase);
    const scale = room / Math.max(1, neckH + lidH);
    neckH *= scale;
    lidH *= scale;
  }
  return { ...base, baseH: Math.max(minBase, box.h - neckH - lidH), lidH, neckH };
}

const spec: ClosureSpec = {
  id: "lift-off",
  order: 2,
  label: { he: "שני חלקים", en: "Two-piece" },
  preset: { id: "lift-off", label: { he: "לחיצה", en: "Press" }, latch: "none" },
  latches: ["magnet", "ribbon", "none"],
  forms: [],
  baseHFactor: 0.74,
  dims: STANDARD_DIMS,
  liftOff: {
    variants: [
      { id: "shoulder-neck", label: { he: "צוואר", en: "Shoulder-neck" } },
      { id: "telescope-full", label: { he: "טלסקופ מלא", en: "Full telescope" } },
      { id: "telescope-partial", label: { he: "טלסקופ חלקי", en: "Partial telescope" } },
    ],
    neckMm: NECK_MM,
    lidDepthMm: LID_MM,
    defaults: { variant: "shoulder-neck", neckMm: 14, lidDepthMm: 28 },
  },
  layout,
  parts: [
    {
      id: "lid",
      pivot: (dims) => [0, liftClosedY(dims), 0],
      // The ribbon fades first. The lid then lifts up and back until it leaves the hero frame.
      motion: { delay: 0.2, duration: 0.8, ease: "power2.inOut" },
      channels: [
        sizedChannel(
          "translate",
          "x",
          () => 0,
          (dims) => (fullTelescope(dims) ? -dims.w * 1.08 : 0),
          (dims) => (fullTelescope(dims) ? -dims.w * 1.25 : 0),
          () => 0,
        ),
        sizedChannel(
          "translate",
          "y",
          (dims) => liftClosedY(dims),
          (dims) => liftClosedY(dims) + dims.h * (fullTelescope(dims) ? 0.14 : 1.12),
          (dims) => liftClosedY(dims),
          (dims) => liftClosedY(dims) + dims.h * (fullTelescope(dims) ? 0.22 : 1.2),
        ),
        sizedChannel(
          "translate",
          "z",
          () => 0,
          (dims) => (fullTelescope(dims) ? dims.d * 0.55 : -dims.d * 0.55),
          (dims) => (fullTelescope(dims) ? 0 : -dims.d * 0.8),
          (dims) => (fullTelescope(dims) ? dims.d * 0.7 : 0),
        ),
        sizedChannel(
          "rotate",
          "x",
          () => 0,
          (dims) => (fullTelescope(dims) ? -0.28 : -0.42),
          (dims) => (fullTelescope(dims) ? -0.4 : -0.6),
          () => 0,
        ),
        sizedChannel(
          "rotate",
          "z",
          () => 0,
          () => 0.34,
          () => 0,
          () => 0.5,
        ),
      ],
    },
  ],
  stages: [{ id: "lift", groups: ["lid"] }],
};

export default spec;
