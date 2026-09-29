/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("gsap", () => {
  throw new Error("failed to fetch dynamically imported module");
});

import { useLab } from "../../store/labStore.ts";
import { getUnboxPlayback } from "./playback.ts";
import { playUnboxing, resetUnboxForTests } from "./play.ts";

afterEach(() => {
  resetUnboxForTests();
  useLab.setState({ boxOpen: false, stage: "bottle" });
});

describe("gsap chunk", () => {
  it("opens the box when the gsap import fails", async () => {
    useLab.setState({ stage: "box", boxOpen: false });
    await playUnboxing({ reducedMotion: false });
    expect(useLab.getState().boxOpen).toBe(true);
    expect(useLab.getState().stage).toBe("box");
    expect(getUnboxPlayback().phase).toBe("idle");
    expect(getUnboxPlayback().openAmount).toBe(0);
    expect(getUnboxPlayback().cameraToken).toBe(0);
  });
});
