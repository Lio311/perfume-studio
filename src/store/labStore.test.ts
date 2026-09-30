import { describe, it, expect, beforeEach } from "vitest";
import { useLab } from "./labStore.ts";
import { createDefaultDesign } from "../model/design.ts";
import { clampLabelText } from "../geometry/logos.ts";
import { partializeLabState } from "./hydrate.ts";

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

  it("shows the label when brand text is typed and keeps the previous visibility when the text is cleared", () => {
    const hidden = createDefaultDesign();
    hidden.label.visible = false;
    useLab.setState({ design: hidden, past: [], future: [] });
    expect(useLab.getState().design.label.visible).toBe(false);

    useLab.getState().applyCommands([{ type: "text", text: "" }]);
    expect(useLab.getState().design.label.text).toBe("");
    expect(useLab.getState().design.label.visible).toBe(false);

    useLab.getState().applyCommands([{ type: "text", text: "בושם שלי" }]);
    expect(useLab.getState().design.label.text).toBe("בושם שלי");
    expect(useLab.getState().design.label.visible).toBe(true);

    useLab.getState().applyCommands([{ type: "text", text: "" }]);
    expect(useLab.getState().design.label.text).toBe("");
    expect(useLab.getState().design.label.visible).toBe(true);

    useLab.getState().applyCommands([
      { type: "visible", part: "label", visible: false },
      { type: "text", text: "" },
    ]);
    expect(useLab.getState().design.label.visible).toBe(false);
    expect(useLab.getState().design.label.text).toBe("");
  });

  it("keeps a trailing emoji whole when the text command is capped", () => {
    const wave = "👋";
    const text = "a".repeat(31) + wave;
    useLab.getState().applyCommands([{ type: "text", text }]);
    expect(useLab.getState().design.label.text).toBe(text);
    expect(useLab.getState().design.label.text).toBe(clampLabelText(text));
    expect(text.slice(0, 32)).not.toBe(text);
  });
  it("saves a design and reports success", () => {
    const before = useLab.getState().saved.length;
    const result = useLab.getState().saveDesign("בדיקה", "");
    expect(result.ok).toBe(true);
    expect(useLab.getState().saved[0]?.name).toBe("בדיקה");
    expect(useLab.getState().saved).toHaveLength(before + 1);
  });

  it("uses a count when a single warning is longer than 120 characters", () => {
    useLab.getState().showPackNotices([{
      type: "droppedPart",
      ref: "B",
      he: "א".repeat(121),
      en: "x".repeat(121),
    }]);
    expect(useLab.getState().toast).toBe("אזהרה אחת. הפרטים ברשימה.");
    useLab.setState({ lang: "en" });
    useLab.getState().showPackNotices([{
      type: "droppedPart",
      ref: "B",
      he: "א".repeat(121),
      en: "x".repeat(121),
    }]);
    expect(useLab.getState().toast).toBe("1 warning. Details are in the list.");
    useLab.setState({ lang: "he" });
    useLab.getState().showPackNotices([{ type: "droppedPart", ref: "B", he: "קצר", en: "short" }]);
    expect(useLab.getState().toast).toBe("קצר");
  });

  it("updates the label application and restores it with undo", () => {
    expect(useLab.getState().design.label.application).toBeUndefined();
    useLab.getState().patch("label", { application: "engrave" });
    expect(useLab.getState().design.label.application).toBe("engrave");
    expect(partializeLabState(useLab.getState()).design).toMatchObject({ label: { application: "engrave" } });
    useLab.getState().undo();
    expect(useLab.getState().design.label.application).toBeUndefined();
    useLab.getState().redo();
    expect(useLab.getState().design.label.application).toBe("engrave");
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

  it("recovers from an unclosed gesture when a new one begins", () => {
    const store = useLab.getState();
    const initialDesign = store.design;
    
    // start gesture -> edit
    store.beginGesture();
    useLab.getState().patch("box", { widthMm: 50 });
    
    // cancel (no pointerup / endGesture) -> edit again
    // This second beginGesture simulates the fix: it should close the hanging gesture.
    useLab.getState().beginGesture();
    useLab.getState().patch("box", { widthMm: 60 });
    useLab.getState().endGesture();
    
    expect(useLab.getState().design.box.widthMm).toBe(60);
    
    // Undo reverts only the last edit (widthMm 60 -> 50)
    useLab.getState().undo();
    expect(useLab.getState().design.box.widthMm).toBe(50);
    
    // Second Undo reverts the first edit (widthMm 50 -> initial)
    useLab.getState().undo();
    expect(useLab.getState().design.box.widthMm).toBe(initialDesign.box.widthMm);
  });
});
