import { fixedChannel, STANDARD_DIMS, linearMotion, type ClosureSpec } from "./types.ts";

/** Gatefold / Double door box. Two doors hinge on the sides and open from the center. */
const spec: ClosureSpec = {
  id: "gatefold",
  order: 6,
  label: { he: "דלתות כפולות", en: "Gatefold" },
  preset: { id: "gatefold", label: { he: "כפול", en: "Gatefold" }, latch: "magnet" },
  latches: ["magnet", "none"],
  forms: ["gatefold"],
  baseHFactor: 0.8,
  dims: STANDARD_DIMS,
  parts: [
    {
      id: "door-left",
      pivot: (dims) => [-dims.w / 2, 0, dims.d / 2],
      channels: [fixedChannel("rotate", "y", 0, -1.8, -1.9, 0)],
      motion: linearMotion("power2.inOut"),
    },
    {
      id: "door-right",
      pivot: (dims) => [dims.w / 2, 0, dims.d / 2],
      channels: [fixedChannel("rotate", "y", 0, 1.8, 1.9, 0)],
      motion: linearMotion("power2.inOut"),
    },
  ],
  stages: [
    { id: "open-doors", groups: ["door-left", "door-right"] },
  ],
};

export default spec;
