import { sizedChannel, STANDARD_DIMS, linearMotion, type ClosureSpec } from "./types.ts";

/** Tray-and-sleeve. The sleeve slides off; the tray stays put. */
const spec: ClosureSpec = {
  id: "sleeve",
  order: 3,
  label: { he: "מגש ושרוול", en: "Tray and sleeve" },
  preset: { id: "sleeve", label: { he: "הזזה", en: "Slide" }, latch: "none" },
  latches: ["ribbon", "none"],
  forms: ["sleeve"],
  baseHFactor: 0.68,
  dims: STANDARD_DIMS,
  parts: [
    {
      id: "sleeve",
      pivot: (dims) => [0, dims.h / 2, 0],
      motion: linearMotion("power2.inOut"),
      channels: [
        sizedChannel(
          "translate",
          "y",
          (dims) => dims.h / 2,
          (dims) => dims.h / 2 + dims.h * 0.86,
          (dims) => dims.h / 2,
          (dims) => dims.h / 2 + dims.h * 0.95,
        ),
        sizedChannel(
          "translate",
          "z",
          () => 0,
          (dims) => -dims.d * 0.06,
          (dims) => -dims.d * 0.1,
          () => 0,
        ),
      ],
    },
  ],
  stages: [{ id: "slide", groups: ["sleeve"] }],
};

export default spec;
