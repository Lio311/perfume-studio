import { describe, expect, it } from "vitest";
import { partClickAction, partIsGhost } from "./focusClick.ts";

describe("partClickAction", () => {
  it("selects a part that is not the current focus", () => {
    expect(partClickAction({ selected: null, aimed: false, solo: null }, "cap")).toBe("select");
    expect(partClickAction({ selected: "cap", aimed: true, solo: null }, "bottle")).toBe("select");
    expect(partClickAction({ selected: "box", aimed: false, solo: null }, "box")).toBe("select");
  });

  it("does not ghost the box when the label stays selected on the box stage", () => {
    const focused = { aimed: true, selected: "label" as const, solo: null, stage: "box" as const };
    expect(partIsGhost(focused, "box")).toBe(false);
    expect(partIsGhost(focused, "bottle")).toBe(true);
    expect(partIsGhost({ ...focused, stage: "bottle" }, "box")).toBe(true);
    expect(partIsGhost({ ...focused, selected: "cap" }, "box")).toBe(true);
    expect(partIsGhost({ ...focused, aimed: false }, "box")).toBe(false);
  });

  it("releases when the aimed part or the solo part is clicked again", () => {
    expect(partClickAction({ selected: "cap", aimed: true, solo: null }, "cap")).toBe("release");
    expect(partClickAction({ selected: "box", aimed: true, solo: null }, "box")).toBe("release");
    expect(partClickAction({ selected: "pump", aimed: true, solo: "pump" }, "pump")).toBe("release");
  });
});
