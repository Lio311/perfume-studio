/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { encodeShareDesign } from "../../model/share.ts";
import { demoSessionHold, partializeLabState } from "../../store/hydrate.ts";
import { useLab } from "../../store/labStore.ts";
import { getUnboxPlayback } from "./playback.ts";
import { advanceUnboxForTests, playUnboxing, resetUnboxForTests, skipUnboxing } from "./play.ts";

afterEach(() => {
  resetUnboxForTests();
  useLab.setState({
    boxOpen: false,
    stage: "bottle",
    solo: null,
    aimed: false,
    autoRotate: false,
    demoHold: null,
  });
});

describe("cinematic unboxing playback", () => {
  it("skips to the open pose without touching the saved design", async () => {
    const design = useLab.getState().design;
    const hold = demoSessionHold(useLab.getState());
    useLab.setState({ stage: "box", boxOpen: false, demoHold: hold });
    const shared = encodeShareDesign(design);
    await playUnboxing({ reducedMotion: false });
    expect(getUnboxPlayback().phase).toBe("playing");
    skipUnboxing();
    expect(getUnboxPlayback().phase).toBe("idle");
    expect(getUnboxPlayback().openAmount).toBeCloseTo(1);
    expect(getUnboxPlayback().ribbon).toBeCloseTo(0);
    expect(getUnboxPlayback().sheen).toBeCloseTo(0);
    expect(getUnboxPlayback().camera).toBeCloseTo(1);
    expect(useLab.getState().boxOpen).toBe(true);
    expect(useLab.getState().design).toBe(design);
    expect(useLab.getState().demoHold).toBe(hold);
    expect(encodeShareDesign(useLab.getState().design)).toBe(shared);
    const stored = partializeLabState(useLab.getState());
    expect(stored.boxOpen).toBeUndefined();
    expect(stored.openAmount).toBeUndefined();
    expect(stored.design).toBe(hold.design);
  });

  it("jumps straight to the open pose when reduced motion is requested", async () => {
    const design = useLab.getState().design;
    await playUnboxing({ reducedMotion: true });
    expect(getUnboxPlayback().phase).toBe("idle");
    expect(getUnboxPlayback().openAmount).toBe(1);
    expect(getUnboxPlayback().ribbon).toBe(0);
    expect(getUnboxPlayback().sheen).toBe(0);
    expect(useLab.getState().boxOpen).toBe(true);
    expect(useLab.getState().design).toBe(design);
    expect(partializeLabState(useLab.getState()).boxOpen).toBeUndefined();
  });

  it("follows prefers-reduced-motion and does not play a timeline", async () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
      onchange: null,
    })) as typeof window.matchMedia;
    const design = useLab.getState().design;
    await playUnboxing();
    expect(getUnboxPlayback().phase).toBe("idle");
    expect(getUnboxPlayback().openAmount).toBe(1);
    expect(useLab.getState().boxOpen).toBe(true);
    expect(useLab.getState().design).toBe(design);
  });

  it("replays from an open carton and skip still lands on the open pose", async () => {
    const design = useLab.getState().design;
    await playUnboxing({ reducedMotion: true });
    expect(useLab.getState().boxOpen).toBe(true);
    await playUnboxing({ reducedMotion: false });
    expect(getUnboxPlayback().phase).toBe("playing");
    expect(getUnboxPlayback().openAmount).toBeGreaterThan(0.5);
    skipUnboxing();
    expect(getUnboxPlayback().phase).toBe("idle");
    expect(getUnboxPlayback().openAmount).toBeCloseTo(1);
    expect(useLab.getState().boxOpen).toBe(true);
    expect(useLab.getState().design).toBe(design);
    await playUnboxing({ reducedMotion: false });
    expect(getUnboxPlayback().phase).toBe("playing");
    skipUnboxing();
    expect(getUnboxPlayback().openAmount).toBeCloseTo(1);
    expect(getUnboxPlayback().phase).toBe("idle");
  });

  it("stays closed when the box is closed a second into the opening", async () => {
    useLab.setState({ stage: "box", boxOpen: true });
    await playUnboxing({ reducedMotion: false });
    expect(getUnboxPlayback().phase).toBe("playing");
    advanceUnboxForTests(1);
    expect(getUnboxPlayback().phase).toBe("playing");
    const mid = getUnboxPlayback().openAmount;
    useLab.getState().setBoxOpen(false);
    advanceUnboxForTests(8);
    expect(useLab.getState().boxOpen).toBe(false);
    expect(useLab.getState().stage).toBe("box");
    expect(getUnboxPlayback().phase).toBe("idle");
    expect(getUnboxPlayback().openAmount).toBe(0);
    expect(getUnboxPlayback().camera).toBe(0);
    expect(getUnboxPlayback().cameraToken).toBe(0);
    expect(mid).toBeGreaterThan(0);
  });

  it("stays on the bottle tab when the stage changes a second into the opening", async () => {
    useLab.setState({ stage: "box", boxOpen: false });
    await playUnboxing({ reducedMotion: false });
    expect(getUnboxPlayback().phase).toBe("playing");
    advanceUnboxForTests(1);
    expect(getUnboxPlayback().openAmount).toBeGreaterThan(0);
    useLab.getState().setStage("bottle");
    advanceUnboxForTests(8);
    expect(useLab.getState().stage).toBe("bottle");
    expect(useLab.getState().boxOpen).toBe(false);
    expect(getUnboxPlayback().phase).toBe("idle");
    expect(getUnboxPlayback().openAmount).toBe(0);
    expect(getUnboxPlayback().camera).toBe(0);
    expect(getUnboxPlayback().cameraToken).toBe(0);
  });
});
