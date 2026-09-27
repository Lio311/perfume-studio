import { describe, expect, it } from "vitest";
import { extractAfterWake, parseVoiceParam } from "./wake.ts";

describe("voice variants", () => {
  it("reads the voice query", () => {
    expect(parseVoiceParam(null)).toBe(1);
    expect(parseVoiceParam("1")).toBe(1);
    expect(parseVoiceParam("2")).toBe(2);
    expect(parseVoiceParam("3")).toBe(3);
    expect(parseVoiceParam("9")).toBe(1);
  });

  it("takes the command after the wake word", () => {
    expect(extractAfterWake("מעבדה פקק הבא")).toEqual({ woke: true, command: "פקק הבא" });
    expect(extractAfterWake("המעבדה, תפרק")).toEqual({ woke: true, command: "תפרק" });
    expect(extractAfterWake("Lab next cap")).toEqual({ woke: true, command: "next cap" });
    expect(extractAfterWake("laboratory")).toEqual({ woke: false, command: "" });
    expect(extractAfterWake("פקק שחור מט")).toEqual({ woke: false, command: "" });
  });
});
