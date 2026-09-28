import { describe, it, expect, beforeEach } from "vitest";
import { useLab } from "./labStore.ts";
import { createDefaultDesign } from "../model/design.ts";

describe("labStore", () => {
  beforeEach(() => {
    useLab.setState({
      design: createDefaultDesign(),
      past: [],
      future: [],
    });
  });

  it("should undo and redo design changes", () => {
    const store = useLab.getState();
    const initialDesign = store.design;

    // Apply a patch
    store.patch("bottle", { variantId: "diamond-50" });

    const stateAfterPatch = useLab.getState();
    expect(stateAfterPatch.design.bottle.variantId).toBe("diamond-50");
    expect(stateAfterPatch.past.length).toBe(1);
    expect(stateAfterPatch.past[0]).toBe(initialDesign);

    // Undo
    useLab.getState().undo();
    const stateAfterUndo = useLab.getState();
    expect(stateAfterUndo.design).toBe(initialDesign);
    expect(stateAfterUndo.past.length).toBe(0);
    expect(stateAfterUndo.future.length).toBe(1);
    expect(stateAfterUndo.future[0].bottle.variantId).toBe("diamond-50");

    // Redo
    useLab.getState().redo();
    const stateAfterRedo = useLab.getState();
    expect(stateAfterRedo.design.bottle.variantId).toBe("diamond-50");
    expect(stateAfterRedo.future.length).toBe(0);
    expect(stateAfterRedo.past.length).toBe(1);
    expect(stateAfterRedo.past[0]).toBe(initialDesign);
  });

  it("uses a count when a single warning is longer than 120 characters", () => {
    useLab.getState().showPackNotices([{
      type: "droppedPart",
      ref: "B",
      he: "א".repeat(121),
      en: "x".repeat(121),
    }]);
    expect(useLab.getState().toast).toBe("1 אזהרות. הפרטים ברשימה.");
    useLab.getState().showPackNotices([{ type: "droppedPart", ref: "B", he: "קצר", en: "short" }]);
    expect(useLab.getState().toast).toBe("קצר");
  });

  it("should record history on applyCommands", () => {
    const store = useLab.getState();
    const initialDesign = store.design;
    
    store.applyCommands([{ type: "variant", part: "cap", id: "cap-crystal" }]);
    
    const stateAfterCommand = useLab.getState();
    expect(stateAfterCommand.design.cap.variantId).toBe("cap-crystal");
    expect(stateAfterCommand.past.length).toBe(1);
    expect(stateAfterCommand.past[0]).toBe(initialDesign);
  });
});
