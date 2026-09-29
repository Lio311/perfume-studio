import { describe, expect, it } from "vitest";
import { restoredOpacityTarget } from "./materialFade.ts";

describe("restoredOpacityTarget", () => {
  it("remembers the authored opacity so a ghost fade can come back", () => {
    const state: { intendedOpacity?: number } = {};
    const ghosted = restoredOpacityTarget(state, 1, true);
    state.intendedOpacity = ghosted.intendedOpacity;
    expect(ghosted).toEqual({ intendedOpacity: 1, target: 0.1 });

    const stillGhosted = restoredOpacityTarget(state, 0.4, true);
    expect(stillGhosted.intendedOpacity).toBe(1);
    expect(stillGhosted.target).toBe(0.1);

    const restored = restoredOpacityTarget(state, 0.12, false);
    expect(restored).toEqual({ intendedOpacity: 1, target: 1 });
  });

  it("adopts an authored opacity that arrives after the first frame", () => {
    const state: { intendedOpacity?: number; fadeWrote?: number } = {};
    const cellophane = restoredOpacityTarget(state, 0.18, false);
    state.intendedOpacity = cellophane.intendedOpacity;
    state.fadeWrote = 0.18;
    expect(cellophane).toEqual({ intendedOpacity: 0.18, target: 0.18 });

    const midFade = restoredOpacityTarget(state, 0.18, false);
    expect(midFade.intendedOpacity).toBe(0.18);

    state.fadeWrote = 0.4;
    const stillFading = restoredOpacityTarget(state, 0.4, false);
    expect(stillFading).toEqual({ intendedOpacity: 0.18, target: 0.18 });

    const paper = restoredOpacityTarget(state, 0.96, false);
    expect(paper).toEqual({ intendedOpacity: 0.96, target: 0.96 });
  });
});
