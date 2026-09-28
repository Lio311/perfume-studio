import { sizedChannel, STANDARD_DIMS, type ClosureSpec } from "./types.ts";

const spec: ClosureSpec = {
  id: "drawer",
  order: 4,
  label: { he: "מגירה", en: "Drawer" },
  forms: ["drawer"],
  baseHFactor: 0.68,
  dims: STANDARD_DIMS,
  parts: [
    {
      id: "tray",
      pivot: () => [0, 0, 0],
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
