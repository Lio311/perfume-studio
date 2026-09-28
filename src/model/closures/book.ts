import { fixedChannel, STANDARD_DIMS, type ClosureSpec } from "./types.ts";

const spec: ClosureSpec = {
  id: "book",
  order: 5,
  label: { he: "ספר", en: "Book" },
  forms: ["coffret"],
  baseHFactor: 0.68,
  dims: STANDARD_DIMS,
  parts: [
    {
      id: "spine",
      pivot: (dims) => [-dims.w / 2, dims.h, 0],
      channels: [fixedChannel("rotate", "z", 0, 1.35, 0, 1.5)],
    },
  ],
  stages: [{ id: "open-cover", groups: ["spine"] }],
};

export default spec;
