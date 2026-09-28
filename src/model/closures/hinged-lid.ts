import { fixedChannel, STANDARD_DIMS, type ClosureSpec } from "./types.ts";

/**
 * Hinged lid with a flap over the front.
 * The magnet is an optional latch on this structure, not the starting carton.
 * The flap unlatches first; the lid follows, overlapping the way a folding-box timeline staggers flaps.
 */
const spec: ClosureSpec = {
  id: "hinged-lid",
  order: 1,
  label: { he: "מכסה ציר", en: "Hinged lid" },
  preset: { id: "magnet", label: { he: "מגנט", en: "Magnet" }, latch: "magnet" },
  aliases: ["magnetic"],
  latches: ["magnet", "ribbon", "none"],
  forms: ["magnetic"],
  baseHFactor: 0.68,
  dims: STANDARD_DIMS,
  parts: [
    {
      id: "lid",
      pivot: (dims) => [0, dims.baseH, -dims.d / 2],
      channels: [fixedChannel("rotate", "x", 0, -1.22, -1.35, 0)],
      motion: { delay: 0.32, duration: 0.68, ease: "power2.inOut" },
    },
    {
      id: "flap",
      pivot: (dims) => [0, 0, dims.d],
      channels: [fixedChannel("rotate", "x", Math.PI / 2, 0.18, 0, Math.PI / 2)],
      motion: { delay: 0, duration: 0.38, ease: "power2.out" },
    },
  ],
  stages: [
    { id: "unlatch", groups: ["flap"] },
    { id: "raise", groups: ["lid"] },
  ],
};

export default spec;
