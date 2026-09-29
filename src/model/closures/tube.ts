import { sizedChannel, STANDARD_DIMS, linearMotion, type ClosureDims, type ClosureSpec } from "./types.ts";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Closed cap origin. The cap overlaps the top of the canister. */
export function tubeClosedY(dims: ClosureDims): number {
  return Math.max(0, dims.h - dims.lidH);
}

/** Cap origin when the lift channel is fully open. */
export function tubeOpenLidY(dims: ClosureDims): number {
  return tubeClosedY(dims) + dims.h * 0.62;
}

function tubeWall(dims: ClosureDims): number {
  return Math.max(dims.wall, 1.6);
}

/**
 * Height of the canister that stays on the table.
 * The sleeve above it is parented to the cap, so an open tube shows the bottle.
 */
export function tubeBaseHeight(dims: ClosureDims): number {
  const wall = tubeWall(dims);
  const wanted = Math.max(wall * 3.2, Math.min(dims.h * 0.22, 28));
  return Math.min(wanted, Math.max(wall * 2, dims.h * 0.34));
}

/** How far the sleeve mesh overlaps the base so the closed seam does not flash. */
const TUBE_SLEEVE_SEAM = 0.4;

/** Sleeve length, including the seam tucked into the base. */
export function tubeSleeveHeight(dims: ClosureDims): number {
  return Math.max(tubeWall(dims), dims.h - tubeBaseHeight(dims) + TUBE_SLEEVE_SEAM);
}

/** Sleeve bottom in the cap group's local space. Closed, that lands on the base. */
export function tubeSleeveLocalY(dims: ClosureDims): number {
  return tubeBaseHeight(dims) - tubeClosedY(dims) - TUBE_SLEEVE_SEAM;
}

/** World Y of the sleeve bottom at the open pose. */
export function tubeOpenSleeveBottom(dims: ClosureDims): number {
  return tubeOpenLidY(dims) + tubeSleeveLocalY(dims);
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
          (dims) => tubeOpenLidY(dims),
          (dims) => tubeClosedY(dims),
          (dims) => tubeClosedY(dims) + dims.h * 0.72,
        ),
      ],
    },
  ],
  stages: [{ id: "lift", groups: ["lid"] }],
};

export default spec;
