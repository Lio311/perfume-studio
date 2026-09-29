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
});
