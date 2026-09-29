import { describe, expect, it } from "vitest";
import { boxCameraSnap } from "./boxOrbit.ts";

describe("box camera", () => {
  it("snaps on a demo link and the first entry, then keeps the orbit", () => {
    expect(boxCameraSnap({ boxScene: true, demo: true, entered: true, pullBack: 1 })).toBe(true);
    expect(boxCameraSnap({ boxScene: true, demo: false, entered: false, pullBack: 1 })).toBe(true);
    expect(boxCameraSnap({ boxScene: true, demo: false, entered: true, pullBack: 1 })).toBe(false);
    expect(boxCameraSnap({ boxScene: false, demo: true, entered: false, pullBack: 1 })).toBe(false);
  });
});
