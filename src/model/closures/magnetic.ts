import { fixedChannel, STANDARD_DIMS, type ClosureSpec } from "./types.ts";

const spec: ClosureSpec = {
  id: "magnetic",
  order: 1,
  label: { he: "מגנטית", en: "Magnetic" },
  forms: ["magnetic"],
  baseHFactor: 0.68,
  dims: STANDARD_DIMS,
  parts: [
    {
      id: "lid",
      pivot: (dims) => [0, dims.baseH, -dims.d / 2],
      channels: [fixedChannel("rotate", "x", 0, -1.22, -1.35, 0)],
    },
    {
      id: "flap",
      pivot: (dims) => [0, 0, dims.d],
      channels: [fixedChannel("rotate", "x", Math.PI / 2, 0.18, 0, Math.PI / 2)],
    },
  ],
  stages: [
    { id: "unlatch", groups: ["flap"] },
    { id: "raise", groups: ["lid"] },
  ],
};

export default spec;
