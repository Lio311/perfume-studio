import { fixedChannel, STANDARD_DIMS, type ClosureSpec } from "./types.ts";

/**
 * Clamshell / Jewelry Box.
 * Hinged at the back, opens upwards. No front flap.
 */
const spec: ClosureSpec = {
  id: "clamshell",
  order: 1.5,
  label: { he: "צדפה (קופסת תכשיט)", en: "Clamshell" },
  preset: { id: "magnet", label: { he: "מגנט", en: "Magnet" }, latch: "magnet" },
  latches: ["magnet", "none"],
  forms: ["magnetic"],
  baseHFactor: 0.5,
  dims: STANDARD_DIMS,
  parts: [
    {
      id: "lid",
      pivot: (dims) => [0, dims.baseH, -dims.d / 2],
      channels: [fixedChannel("rotate", "x", 0, -1.8, -1.9, 0)],
      motion: { delay: 0, duration: 0.8, ease: "power2.inOut" },
    },
  ],
  stages: [
    { id: "raise", groups: ["lid"] },
  ],
};

export default spec;
