import { sizedChannel, STANDARD_DIMS, type ClosureSpec } from "./types.ts";

const spec: ClosureSpec = {
  id: "lift-off",
  order: 2,
  label: { he: "מכסה נשלף", en: "Lift-off" },
  forms: [],
  baseHFactor: 0.74,
  dims: STANDARD_DIMS,
  parts: [
    {
      id: "lid",
      pivot: (dims) => [0, dims.baseH - 8, 0],
      channels: [
        sizedChannel(
          "translate",
          "y",
          (dims) => dims.baseH - 8,
          (dims) => dims.baseH - 8 + dims.h * 0.62,
          (dims) => dims.baseH - 8,
          (dims) => dims.baseH - 8 + dims.h * 0.7,
        ),
        sizedChannel(
          "translate",
          "z",
          () => 0,
          (dims) => dims.d * 0.32,
          () => 0,
          (dims) => dims.d * 0.4,
        ),
      ],
    },
  ],
  stages: [{ id: "lift", groups: ["lid"] }],
};

export default spec;
