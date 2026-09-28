import { sizedChannel, STANDARD_DIMS, linearMotion, type ClosureDims, type ClosureSpec } from "./types.ts";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Closed cap origin. The cap overlaps the top of the canister. */
export function tubeClosedY(dims: ClosureDims): number {
  return Math.max(0, dims.h - dims.lidH);
}

function layout(
  box: { w: number; h: number; d: number },
  wall: number,
  lidT: number,
): ClosureDims {
  const lidH = clamp(Math.max(lidT * 2.4, box.h * 0.28), 16, box.h * 0.42);
  return {
    w: box.w,
    h: box.h,
    d: box.d,
    wall,
    lidT,
    baseH: box.h,
    lidH,
    neckH: 0,
  };
}

/**
 * Round canister, the tube Louis Vuitton and Dior use.
 * The cap lifts off. A magnet is not offered; a ribbon is optional.
 */
const spec: ClosureSpec = {
  id: "tube",
  order: 6,
  label: { he: "גליל", en: "Tube" },
  preset: { id: "tube", label: { he: "גליל", en: "Tube" }, latch: "none" },
  latches: ["ribbon", "none"],
  forms: ["tube"],
  baseHFactor: 1,
  dims: STANDARD_DIMS,
  layout,
  parts: [
    {
      id: "lid",
      pivot: (dims) => [0, tubeClosedY(dims), 0],
      motion: linearMotion("power2.inOut"),
      channels: [
        sizedChannel(
          "translate",
          "y",
          (dims) => tubeClosedY(dims),
          (dims) => tubeClosedY(dims) + dims.h * 0.62,
          (dims) => tubeClosedY(dims),
          (dims) => tubeClosedY(dims) + dims.h * 0.72,
        ),
      ],
    },
  ],
  stages: [{ id: "lift", groups: ["lid"] }],
};

export default spec;
