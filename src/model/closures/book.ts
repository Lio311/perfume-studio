import { fixedChannel, STANDARD_DIMS, linearMotion, type ClosureSpec } from "./types.ts";

/** Book style / flip box. The cover hinges on the side spine. A magnet is optional, not the starting latch. */
const spec: ClosureSpec = {
  id: "book",
  order: 5,
  label: { he: "סגנון ספר", en: "Book style" },
  preset: { id: "book", label: { he: "ספר", en: "Book" }, latch: "none" },
  latches: ["magnet", "ribbon", "none"],
  forms: ["coffret"],
  baseHFactor: 0.68,
  dims: STANDARD_DIMS,
  parts: [
    {
      id: "spine",
      pivot: (dims) => [-dims.w / 2, dims.h, 0],
      channels: [fixedChannel("rotate", "z", 0, 1.35, 0, 1.5)],
      motion: linearMotion("power2.inOut"),
    },
  ],
  stages: [{ id: "open-cover", groups: ["spine"] }],
};

export default spec;
