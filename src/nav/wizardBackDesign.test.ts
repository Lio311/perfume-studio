import { afterEach, describe, expect, it } from "vitest";
import { bottleById } from "../model/catalog.ts";
import { createDefaultDesign } from "../model/design.ts";
import type { Design } from "../model/types.ts";
import { useLab } from "../store/labStore.ts";
import {
  backSurface,
  handleHistoryPop,
  historyWizardStep,
  syncHistoryTrap,
  wizardStepAfterPop,
  type BackAction,
  type HistoryLike,
  type Trap,
} from "./backHistory.ts";

const WIZARD_ORDER = ["bottle", "liquid", "pump", "collar", "cap", "label", "box"] as const;

function designWith(bottleId: string, step: number): Design {
  const spec = bottleById(bottleId);
  const design = createDefaultDesign();
  design.bottle = {
    ...design.bottle,
    variantId: spec.id,
    neck: spec.neck,
    heightMm: spec.heightMm,
    widthMm: spec.widthMm,
    depthMm: spec.depthMm,
    visible: true,
  };
  design.pump = { ...design.pump, visible: true };
  design.collar = { ...design.collar, visible: true };
  design.step = step;
  return design;
}

function createHistory(initial: unknown[] = [null], start = 0) {
  const entries = initial.slice();
  let index = start;
  let left = false;
  const history: HistoryLike & { left: boolean; length: number } = {
    get state() {
      return entries[index];
    },
    get left() {
      return left;
    },
    get length() {
      return entries.length;
    },
    pushState(data: unknown) {
      entries.splice(index + 1);
      entries.push(data);
      index += 1;
    },
    back() {
      if (index === 0) {
        left = true;
        return;
      }
      index -= 1;
      onPop();
    },
    forward() {
      if (index >= entries.length - 1) return;
      index += 1;
      onPop();
    },
  };
  let onPop: () => void = () => undefined;
  return {
    history,
    popWith(handler: () => void) {
      onPop = handler;
    },
  };
}

/** Same wizard/selection updates App applies on popstate. Browser Back has no design payload. */
function applyBackAction(history: HistoryLike, action: Exclude<BackAction, "leave">, trap: Trap) {
  const lab = useLab.getState();
  if (action === "modal") lab.setModal(null);
  else if (action === "present") lab.setPresent(false);
  else if (action === "overlays") {
    lab.setPalette(false);
    lab.setHelp(false);
  } else if (action === "selection") lab.showFull();
  else if (action === "share") lab.setShareUrl("");
  else if (action === "stage") lab.setStage("bottle");
  else if (action === "wizard") {
    const step = wizardStepAfterPop(history, trap);
    if (step === null) return;
    const design = useLab.getState().design;
    if ((design.step ?? 0) === step) return;
    useLab.setState({
      design: { ...design, step },
      stage: step === 5 ? "box" : "bottle",
    });
  } else if (action === "mode") {
    useLab.setState({ explode: 0 });
    lab.setMode("assemble");
  }
}

function backButtonShowing(): boolean {
  const state = useLab.getState();
  return Boolean(state.solo || (state.aimed && state.selected));
}

function install(history: HistoryLike, trap: Trap, popWith: (handler: () => void) => void) {
  popWith(() => {
    const surface = () => backSurface(useLab.getState());
    handleHistoryPop(history, surface(), (action) => applyBackAction(history, action, trap), surface, trap);
    syncHistoryTrap(history, surface(), trap);
  });
}

function clickNext(history: HistoryLike, trap: Trap) {
  const design = useLab.getState().design;
  const step = design.step ?? 6;
  const tab = WIZARD_ORDER[step];
  const part = tab ? design[tab] : undefined;
  if (!part || !("visible" in part) || !part.visible) throw new Error(`Next disabled on step ${step}`);
  const next = step + 1;
  useLab.setState({ design: { ...design, step: next } });
  if (next < 7) useLab.getState().setStage(next === 6 ? "box" : "bottle");
  syncHistoryTrap(history, backSurface(useLab.getState()), trap);
}

function clickPrevious(history: HistoryLike) {
  const step = useLab.getState().design.step ?? 6;
  if (historyWizardStep(history.state) === step) {
    history.back();
    return;
  }
  const design = useLab.getState().design;
  useLab.setState({ design: { ...design, step: step - 1 } });
}

describe("wizard browser Back keeps the design", () => {
  afterEach(() => {
    useLab.setState({
      design: createDefaultDesign(),
      saved: [],
      aimed: false,
      solo: null,
      selected: null,
      mode: "assemble",
      explode: 0,
      stage: "bottle",
      modal: null,
      present: false,
      palette: false,
      help: false,
      shareUrl: "",
    });
  });

  function loadSavedSession() {
    const saved = designWith("cara-100", 2);
    useLab.setState({
      design: designWith("diamond-50", 2),
      saved: [{ id: "cfg-cara", name: "קארה שמורה", design: saved, thumb: "", createdAt: 9 }],
      aimed: false,
      solo: null,
      selected: null,
      mode: "assemble",
      explode: 0,
      stage: "bottle",
      modal: null,
      present: false,
      palette: false,
      help: false,
      shareUrl: "",
    });
  }

  function runSequence(history: HistoryLike, trap: Trap) {
    syncHistoryTrap(history, backSurface(useLab.getState()), trap);
    clickNext(history, trap);
    clickNext(history, trap);
    expect(useLab.getState().design.step).toBe(4);
    clickPrevious(history);
    expect(useLab.getState().design.step).toBe(3);
    expect(useLab.getState().design.bottle.variantId).toBe("diamond-50");

    history.back();
    expect(useLab.getState().design.step).toBe(2);
    expect(useLab.getState().design.bottle.variantId).toBe("diamond-50");
    expect(backButtonShowing()).toBe(false);

    history.back();
    const state = useLab.getState();
    expect(state.design.bottle.variantId).toBe("diamond-50");
    expect(state.design.bottle.neck).toBe("FEA15");
    expect(state.saved[0]?.design.bottle.variantId).toBe("cara-100");
    expect(state.design).not.toBe(state.saved[0]?.design);
    expect(state.aimed).toBe(false);
    expect(state.solo).toBeNull();
    expect(state.selected).toBeNull();
    expect(state.mode).toBe("assemble");
    expect(backButtonShowing()).toBe(false);
  }

  it("after a reload on step 2, Next twice, in-app Previous, and two browser Backs keep the working bottle", () => {
    loadSavedSession();
    const { history, popWith } = createHistory();
    const trap: Trap = { armed: false };
    install(history, trap, popWith);
    runSequence(history, trap);
    expect(history.left).toBe(true);
    expect(useLab.getState().design.step).toBe(2);
  });

  it("a second browser Back into entries from before the reload still does not load the saved bottle", () => {
    loadSavedSession();
    const { history, popWith } = createHistory(
      [null, { lab: 1, step: 1, seq: 4 }, { lab: 1, step: 2, seq: 5 }],
      2,
    );
    const trap: Trap = { armed: false };
    install(history, trap, popWith);
    runSequence(history, trap);
    expect(history.left).toBe(false);
    expect(useLab.getState().design.step).toBe(1);
    expect(useLab.getState().design.bottle.variantId).toBe("diamond-50");
  });
});
