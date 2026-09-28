import { sizedChannel, STANDARD_DIMS, linearMotion, type ClosureSpec } from "./types.ts";

/** Matchbox drawer: a tray sliding out of a sleeve, with an optional pull ribbon or thumb notch. */
const spec: ClosureSpec = {
  id: "drawer",
  order: 4,
  label: { he: "מגירת גפרורים", en: "Matchbox drawer" },
  preset: { id: "drawer", label: { he: "מגירה", en: "Drawer" }, latch: "none" },
  latches: ["ribbon", "none"],
  forms: ["drawer"],
  baseHFactor: 0.68,
  dims: STANDARD_DIMS,
  pulls: ["none", "ribbon", "notch"],
  parts: [
    {
      id: "tray",
      pivot: () => [0, 0, 0],
      motion: linearMotion("power2.out"),
      channels: [
        sizedChannel(
          "translate",
          "z",
          () => 0,
          (dims) => dims.d * 0.92,
          () => 0,
          (dims) => dims.d,
        ),
      ],
    },
  ],
  stages: [{ id: "draw", groups: ["tray"] }],
};

export default spec;
