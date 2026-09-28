import { afterEach, describe, expect, it } from "vitest";
import { configureUnboxingTrack, getUnboxingTrackSnapshot, resetUnboxingTrackForTests, setUnboxingMuted, unboxingTrackUrl } from "./unboxingTrack.ts";

class FakeAudio {
  static made: FakeAudio[] = [];
  src: string;
  loop = false;
  muted = true;
  preload = "";
  paused = true;
  constructor(src: string) {
    this.src = src;
    FakeAudio.made.push(this);
  }
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  removeAttribute(): void {
    this.src = "";
  }
}

describe("unboxing soundtrack", () => {
  afterEach(() => {
    resetUnboxingTrackForTests();
    FakeAudio.made = [];
    Reflect.deleteProperty(globalThis, "Audio");
  });

  it("stays muted and does not construct audio until a URL and a gesture arrive", () => {
    globalThis.Audio = FakeAudio as unknown as typeof Audio;
    expect(getUnboxingTrackSnapshot()).toEqual({ muted: true, configured: false });
    configureUnboxingTrack("https://example.com/unbox.mp3");
    expect(unboxingTrackUrl()).toBe("https://example.com/unbox.mp3");
    expect(FakeAudio.made).toHaveLength(0);
    expect(getUnboxingTrackSnapshot().configured).toBe(true);
    expect(getUnboxingTrackSnapshot().muted).toBe(true);
  });

  it("no-ops the unmute gesture when no track URL is configured", () => {
    globalThis.Audio = FakeAudio as unknown as typeof Audio;
    setUnboxingMuted(false);
    expect(getUnboxingTrackSnapshot().muted).toBe(false);
    expect(FakeAudio.made).toHaveLength(0);
  });

  it("starts playback only from the unmute gesture", () => {
    globalThis.Audio = FakeAudio as unknown as typeof Audio;
    configureUnboxingTrack(" https://cdn.example/track.mp3 ");
    expect(FakeAudio.made).toHaveLength(0);
    setUnboxingMuted(false);
    expect(FakeAudio.made).toHaveLength(1);
    expect(FakeAudio.made[0]?.src).toBe("https://cdn.example/track.mp3");
    expect(FakeAudio.made[0]?.paused).toBe(false);
    setUnboxingMuted(true);
    expect(FakeAudio.made[0]?.paused).toBe(true);
  });
});