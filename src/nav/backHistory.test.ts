import { describe, expect, it } from "vitest";
import { mergeShareDesign } from "../model/share.ts";
import {
  backAction,
  backSurface,
  handleHistoryPop,
  syncHistoryTrap,
  wizardStepAfterPop,
  type BackSurface,
  type HistoryLike,
  type Trap,
} from "./backHistory.ts";

function idle(over: Partial<BackSurface> = {}): BackSurface {
  return {
    modal: false,
    present: false,
    palette: false,
    help: false,
    solo: false,
    aimed: false,
    stage: "bottle",
    mode: "assemble",
    explode: 0,
    wizard: false,
    step: 0,
    shareLink: false,
    boxOpen: false,
    ...over,
  };
}

function createHistory() {
  const entries: unknown[] = [null];
  let index = 0;
  let left = false;
  const history: HistoryLike & { index: number; length: number; left: boolean; pushCount: number } = {
    get state() {
      return entries[index];
    },
    get index() {
      return index;
    },
    get length() {
      return entries.length;
    },
    get left() {
      return left;
    },
    pushCount: 0,
    pushState(data: unknown) {
      entries.splice(index + 1);
      entries.push(data);
      index += 1;
      history.pushCount += 1;
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

describe("browser back", () => {
  it("orders in-app layers and leaves when the lab is idle", () => {
    expect(backAction(idle())).toBe("leave");
    expect(backAction(idle({ modal: true, aimed: true }))).toBe("modal");
    expect(backAction(idle({ present: true }))).toBe("present");
    expect(backAction(idle({ help: true, aimed: true }))).toBe("overlays");
    expect(backAction(idle({ aimed: true }))).toBe("selection");
    expect(backAction(idle({ solo: true }))).toBe("selection");
    expect(backAction(idle({ stage: "box" }))).toBe("stage");
    expect(backAction(idle({ stage: "together" }))).toBe("stage");
    expect(backAction(idle({ mode: "explode", explode: 0.6 }))).toBe("mode");
    expect(backAction(idle({ explode: 0.4 }))).toBe("mode");
    expect(backAction(idle({ wizard: true, step: 0 }))).toBe("leave");
    expect(backAction(idle({ wizard: true, step: 2 }))).toBe("wizard");
    expect(backAction(idle({ wizard: true, step: 2, modal: true }))).toBe("modal");
    expect(backAction(idle({ wizard: true, step: 2, aimed: true }))).toBe("selection");
    expect(backAction(idle({ wizard: true, step: 2, explode: 0.4 }))).toBe("mode");
    expect(backAction(idle({ boxOpen: true }))).toBe("box");
    expect(backAction(idle({ boxOpen: true, stage: "box" }))).toBe("box");
    expect(backAction(idle({ boxOpen: true, stage: "box", wizard: true, step: 6 }))).toBe("box");
    expect(backAction(idle({ boxOpen: true, aimed: true }))).toBe("selection");
  });

  it("does not push a guard when nothing is open, so the first back leaves", () => {
    const { history } = createHistory();
    const trap: Trap = { armed: false };
    syncHistoryTrap(history, idle(), trap);
    expect(history.pushCount).toBe(0);
    expect(trap.armed).toBe(false);
    history.back();
    expect(history.left).toBe(true);
    expect(history.pushCount).toBe(0);
  });

  it("does not treat the carton stage as a back layer while the wizard is on the box step", () => {
    expect(backAction(idle({ stage: "box", wizard: true, step: 6 }))).toBe("wizard");
    expect(backAction(idle({ stage: "together", wizard: true, step: 6 }))).toBe("wizard");
    expect(backAction(idle({ stage: "box", wizard: true, step: 0 }))).toBe("leave");
    expect(backAction(idle({ stage: "box" }))).toBe("stage");
    const surface = backSurface({
      modal: null,
      present: false,
      palette: false,
      help: false,
      solo: null,
      aimed: false,
      stage: "box",
      mode: "assemble",
      explode: 0,
      design: { step: 6 },
    });
    expect(surface.wizard).toBe(true);
    expect(surface.step).toBe(6);
    expect(backAction(surface)).toBe("wizard");
    const finished = backSurface({
      modal: null,
      present: false,
      palette: false,
      help: false,
      solo: null,
      aimed: false,
      stage: "together",
      mode: "assemble",
      explode: 0,
      design: { step: 7 },
    });
    expect(finished.wizard).toBe(false);
    expect(backAction(finished)).toBe("stage");
    const open = backSurface({
      modal: null,
      present: false,
      palette: false,
      help: false,
      solo: null,
      aimed: false,
      stage: "box",
      mode: "assemble",
      explode: 0,
      design: { step: 6 },
      boxOpen: true,
    });
    expect(open.wizard).toBe(true);
    expect(backAction(open)).toBe("box");
  });

  it("closes an open box in one back, then the carton stage is the next layer", () => {
    const { history, popWith } = createHistory();
    const trap: Trap = { armed: false };
    let surface = idle({ stage: "box", boxOpen: true });
    syncHistoryTrap(history, surface, trap);
    expect(history.pushCount).toBe(1);
    const applied: string[] = [];
    popWith(() => {
      handleHistoryPop(
        history,
        surface,
        (action) => {
          applied.push(action);
          if (action === "box") surface = { ...surface, boxOpen: false };
          if (action === "stage") surface = { ...surface, stage: "bottle" };
        },
        () => surface,
        trap,
      );
    });
    history.back();
    expect(applied).toEqual(["box"]);
    expect(history.left).toBe(false);
    expect(surface.boxOpen).toBe(false);
    history.back();
    expect(applied).toEqual(["box", "stage"]);
    expect(history.left).toBe(false);
    expect(surface.stage).toBe("bottle");
  });

  it("does not push a wizard layer for the step already on screen, so back leaves", () => {
    const { history, popWith } = createHistory();
    const trap: Trap = { armed: false };
    const surface = idle({ wizard: true, step: 3 });
    syncHistoryTrap(history, surface, trap);
    expect(history.pushCount).toBe(0);
    expect(trap.baselineStep).toBe(3);
    const applied: string[] = [];
    popWith(() => {
      handleHistoryPop(history, surface, (action) => applied.push(action), () => surface, trap);
    });
    history.back();
    expect(applied).toEqual([]);
    expect(history.left).toBe(true);
    expect(history.pushCount).toBe(0);
    expect(surface.step).toBe(3);
  });

  function bindWizard(history: ReturnType<typeof createHistory>["history"], popWith: (handler: () => void) => void, surface: { current: BackSurface }, trap: Trap) {
    const applied: string[] = [];
    popWith(() => {
      handleHistoryPop(
        history,
        surface.current,
        (action) => {
          applied.push(action);
          if (action === "wizard") {
            const step = wizardStepAfterPop(history, trap);
            if (step === null) return;
            surface.current = { ...surface.current, step, wizard: step < 7 };
          } else if (action === "modal") {
            surface.current = { ...surface.current, modal: false };
          } else if (action === "selection") {
            surface.current = { ...surface.current, aimed: false, solo: false };
          } else if (action === "share") {
            surface.current = { ...surface.current, shareLink: false };
          }
        },
        () => surface.current,
        trap,
      );
    });
    return applied;
  }

  it("pushes one history layer per wizard step and walks back to the previous step", () => {
    const { history, popWith } = createHistory();
    const trap: Trap = { armed: false };
    const surface = { current: idle({ wizard: true, step: 0 }) };
    syncHistoryTrap(history, surface.current, trap);
    expect(history.pushCount).toBe(0);
    const applied = bindWizard(history, popWith, surface, trap);

    surface.current = { ...surface.current, step: 1 };
    syncHistoryTrap(history, surface.current, trap);
    surface.current = { ...surface.current, step: 2 };
    syncHistoryTrap(history, surface.current, trap);
    surface.current = { ...surface.current, step: 3 };
    syncHistoryTrap(history, surface.current, trap);

    expect(history.pushCount).toBe(3);
    expect(history.length).toBe(4);
    expect(history.state).toEqual({ lab: 1, step: 3 });

    history.back();
    expect(applied).toEqual(["wizard"]);
    expect(surface.current.step).toBe(2);
    expect(history.state).toEqual({ lab: 1, step: 2 });
    expect(history.left).toBe(false);

    history.back();
    expect(surface.current.step).toBe(1);
    history.back();
    expect(surface.current.step).toBe(0);
    expect(backAction(surface.current)).toBe("leave");
    expect(history.pushCount).toBe(3);
    expect(history.left).toBe(false);

    history.back();
    expect(history.left).toBe(true);
    expect(history.pushCount).toBe(3);
    expect(applied.filter((action) => action === "wizard")).toHaveLength(3);
  });

  it("closes a modal and a selected part before walking the wizard stack", () => {
    const { history, popWith } = createHistory();
    const trap: Trap = { armed: false };
    const surface = { current: idle({ wizard: true, step: 0 }) };
    syncHistoryTrap(history, surface.current, trap);
    const applied = bindWizard(history, popWith, surface, trap);

    surface.current = { ...surface.current, step: 2 };
    syncHistoryTrap(history, surface.current, trap);
    surface.current = { ...surface.current, modal: true };
    syncHistoryTrap(history, surface.current, trap);
    expect(history.state).toEqual({ lab: 1 });

    history.back();
    expect(applied).toEqual(["modal"]);
    expect(surface.current.modal).toBe(false);
    expect(surface.current.step).toBe(2);
    expect(history.state).toEqual({ lab: 1, step: 2 });

    surface.current = { ...surface.current, aimed: true };
    syncHistoryTrap(history, surface.current, trap);
    history.back();
    expect(applied).toEqual(["modal", "selection"]);
    expect(surface.current.aimed).toBe(false);
    expect(surface.current.step).toBe(2);

    history.back();
    expect(surface.current.step).toBe(1);
    history.back();
    expect(surface.current.step).toBe(0);
    history.back();
    expect(history.left).toBe(true);
  });

  it("skips a leftover guard and still returns to the previous wizard step", () => {
    const { history, popWith } = createHistory();
    const trap: Trap = { armed: false };
    const surface = { current: idle({ wizard: true, step: 0 }) };
    syncHistoryTrap(history, surface.current, trap);
    bindWizard(history, popWith, surface, trap);
    surface.current = { ...surface.current, step: 2 };
    syncHistoryTrap(history, surface.current, trap);
    surface.current = { ...surface.current, modal: true };
    syncHistoryTrap(history, surface.current, trap);
    surface.current = { ...surface.current, modal: false };
    history.back();
    expect(surface.current.step).toBe(1);
    expect(history.left).toBe(false);
  });

  it("does not trap back on wizard entries after the wizard has finished", () => {
    const { history, popWith } = createHistory();
    const trap: Trap = { armed: false };
    const surface = { current: idle({ wizard: true, step: 0 }) };
    syncHistoryTrap(history, surface.current, trap);
    popWith(() => {
      handleHistoryPop(
        history,
        surface.current,
        (action) => {
          if (action === "wizard") {
            const step = wizardStepAfterPop(history, trap);
            if (step === null) return;
            surface.current = { ...surface.current, step, wizard: step < 7 };
          } else if (action === "stage") {
            surface.current = { ...surface.current, stage: "bottle" };
          }
        },
        () => surface.current,
        trap,
      );
    });
    surface.current = { ...surface.current, step: 2 };
    syncHistoryTrap(history, surface.current, trap);
    surface.current = idle({ wizard: false, step: 0, stage: "together" });
    syncHistoryTrap(history, surface.current, trap);
    expect(history.state).toEqual({ lab: 1 });
    history.back();
    expect(surface.current.stage).toBe("bottle");
    expect(history.left).toBe(false);
    history.back();
    expect(history.left).toBe(true);
    expect(history.pushCount).toBe(3);
  });

  it("restores the loaded step when the only new layer is the one just opened", () => {
    const { history, popWith } = createHistory();
    const trap: Trap = { armed: false };
    const surface = { current: idle({ wizard: true, step: 3 }) };
    syncHistoryTrap(history, surface.current, trap);
    bindWizard(history, popWith, surface, trap);
    surface.current = { ...surface.current, step: 4 };
    syncHistoryTrap(history, surface.current, trap);
    expect(history.pushCount).toBe(1);
    expect(history.state).toEqual({ lab: 1, step: 4 });
    history.back();
    expect(surface.current.step).toBe(3);
    history.back();
    expect(history.left).toBe(true);
    expect(surface.current.step).toBe(3);
  });

  it("clears a selection without walking any further in-app step", () => {
    const { history, popWith } = createHistory();
    const trap: Trap = { armed: false };
    let surface = idle({ aimed: true });
    syncHistoryTrap(history, surface, trap);
    const applied: string[] = [];
    popWith(() => {
      handleHistoryPop(
        history,
        surface,
        (action) => {
          applied.push(action);
          if (action === "selection") surface = { ...surface, aimed: false, solo: false };
        },
        () => surface,
        trap,
      );
    });
    history.back();
    expect(applied).toEqual(["selection"]);
    expect(history.left).toBe(false);
    expect(history.pushCount).toBe(1);
    history.back();
    expect(applied).toEqual(["selection"]);
    expect(history.left).toBe(true);
  });

  it("does not push another entry when a back finds nothing left to close", () => {
    const { history, popWith } = createHistory();
    const trap: Trap = { armed: true };
    history.pushState({ lab: 1 }, "");
    const surface = idle();
    popWith(() => {
      handleHistoryPop(history, surface, () => undefined, () => surface, trap);
    });
    history.back();
    expect(history.left).toBe(true);
    expect(history.pushCount).toBe(1);
    expect(trap.armed).toBe(false);
  });

  function boxSurface(design: { step?: number }) {
    return backSurface({
      modal: null,
      present: false,
      palette: false,
      help: false,
      solo: null,
      aimed: false,
      stage: "box",
      mode: "assemble",
      explode: 0,
      design,
    });
  }

  it("treats a missing step as finished, so back from the box closes the stage", () => {
    const shared = mergeShareDesign({ bottle: {} });
    expect(shared?.step).toBeUndefined();
    const shareLoaded = boxSurface(shared ?? {});
    const hydrated = boxSurface({});
    expect(shareLoaded.wizard).toBe(false);
    expect(hydrated.wizard).toBe(false);
    expect(backAction(shareLoaded)).toBe("stage");
    expect(backAction(hydrated)).toBe("stage");

    for (const initial of [shareLoaded, hydrated]) {
      const { history, popWith } = createHistory();
      const trap: Trap = { armed: false };
      const surface = { current: initial };
      syncHistoryTrap(history, surface.current, trap);
      expect(history.state).toEqual({ lab: 1 });
      popWith(() => {
        handleHistoryPop(
          history,
          surface.current,
          (action) => {
            if (action === "stage") surface.current = { ...surface.current, stage: "bottle" };
          },
          () => surface.current,
          trap,
        );
      });
      history.back();
      expect(surface.current.stage).toBe("bottle");
      expect(backAction(surface.current)).toBe("leave");
      expect(history.left).toBe(false);
      history.back();
      expect(history.left).toBe(true);
    }
  });

  it("skips a guard revealed under the next wizard step, including forward onto that guard", () => {
    const { history, popWith } = createHistory();
    const trap: Trap = { armed: false };
    const surface = { current: idle({ wizard: true, step: 0 }) };
    syncHistoryTrap(history, surface.current, trap);
    bindWizard(history, popWith, surface, trap);

    surface.current = { ...surface.current, step: 2 };
    syncHistoryTrap(history, surface.current, trap);
    surface.current = { ...surface.current, aimed: true };
    syncHistoryTrap(history, surface.current, trap);
    expect(history.state).toEqual({ lab: 1 });
    surface.current = { ...surface.current, aimed: false };
    syncHistoryTrap(history, surface.current, trap);
    expect(history.state).toEqual({ lab: 1 });

    surface.current = { ...surface.current, step: 3 };
    syncHistoryTrap(history, surface.current, trap);
    expect(history.state).toEqual({ lab: 1, step: 3 });

    history.back();
    expect(surface.current.step).toBe(2);
    expect(history.state).toEqual({ lab: 1, step: 2 });

    history.forward();
    expect(surface.current.step).toBe(3);
    expect(history.state).toEqual({ lab: 1, step: 3 });
    expect(history.left).toBe(false);
  });

  function jumpBack(to: number, surface: { current: BackSurface }, history: HistoryLike, trap: Trap) {
    surface.current = { ...surface.current, step: to, wizard: to < 7, stage: "bottle", modal: false, aimed: false, solo: false };
    syncHistoryTrap(history, surface.current, trap);
  }

  it("drops stale higher entries when a new design returns to step 0", () => {
    const { history, popWith } = createHistory();
    const trap: Trap = { armed: false };
    const surface = { current: idle({ wizard: true, step: 0 }) };
    syncHistoryTrap(history, surface.current, trap);
    const applied = bindWizard(history, popWith, surface, trap);
    surface.current = { ...surface.current, step: 6 };
    syncHistoryTrap(history, surface.current, trap);
    jumpBack(0, surface, history, trap);
    expect(history.length).toBe(2);
    expect(applied).toEqual([]);
    history.forward();
    expect(surface.current.step).toBe(0);
    expect(history.state).toBeNull();
    history.back();
    expect(history.left).toBe(true);
    expect(surface.current.step).toBe(0);
  });

  it("drops stale higher entries when reset returns to step 0", () => {
    const { history, popWith } = createHistory();
    const trap: Trap = { armed: false };
    const surface = { current: idle({ wizard: true, step: 0 }) };
    syncHistoryTrap(history, surface.current, trap);
    bindWizard(history, popWith, surface, trap);
    surface.current = { ...surface.current, step: 4 };
    syncHistoryTrap(history, surface.current, trap);
    // resetToFreshDesign replaces the design with a step-0 bottle and clears overlays.
    surface.current = idle({ wizard: true, step: 0, stage: "bottle", mode: "assemble", explode: 0 });
    syncHistoryTrap(history, surface.current, trap);
    expect(history.length).toBe(2);
    expect(surface.current.step).toBe(0);
    history.forward();
    expect(surface.current.step).toBe(0);
    history.back();
    expect(history.left).toBe(true);
  });

  it("drops stale higher entries when chat jumps the wizard backward", () => {
    const { history, popWith } = createHistory();
    const trap: Trap = { armed: false };
    const surface = { current: idle({ wizard: true, step: 0 }) };
    syncHistoryTrap(history, surface.current, trap);
    bindWizard(history, popWith, surface, trap);
    surface.current = { ...surface.current, step: 4 };
    syncHistoryTrap(history, surface.current, trap);
    jumpBack(2, surface, history, trap);
    expect(history.state).toEqual({ lab: 1, step: 2 });
    expect(history.length).toBe(4);
    history.forward();
    expect(surface.current.step).toBe(2);
    expect(history.state).toEqual({ lab: 1, step: 2 });
    history.back();
    expect(surface.current.step).toBe(1);
    expect(history.left).toBe(false);
    history.back();
    expect(surface.current.step).toBe(0);
    history.back();
    expect(history.left).toBe(true);
  });

  it("after a reload, Forward returns to the step Back just left", () => {
    const { history, popWith } = createHistory();
    const trap: Trap = { armed: false };
    const surface = { current: idle({ wizard: true, step: 0 }) };
    syncHistoryTrap(history, surface.current, trap);
    bindWizard(history, popWith, surface, trap);
    surface.current = { ...surface.current, step: 4 };
    syncHistoryTrap(history, surface.current, trap);
    expect(history.state).toEqual({ lab: 1, step: 4 });

    const reloaded: Trap = { armed: false };
    syncHistoryTrap(history, surface.current, reloaded);
    bindWizard(history, popWith, surface, reloaded);
    expect(history.pushCount).toBe(4);

    history.back();
    expect(surface.current.step).toBe(3);
    history.forward();
    expect(surface.current.step).toBe(4);
    expect(history.left).toBe(false);
  });

  it("closes an open share link on back and leaves the wizard step", () => {
    const { history, popWith } = createHistory();
    const trap: Trap = { armed: false };
    const surface = { current: idle({ wizard: true, step: 0 }) };
    syncHistoryTrap(history, surface.current, trap);
    bindWizard(history, popWith, surface, trap);
    surface.current = { ...surface.current, step: 2 };
    syncHistoryTrap(history, surface.current, trap);
    surface.current = { ...surface.current, shareLink: true };
    syncHistoryTrap(history, surface.current, trap);
    expect(history.state).toEqual({ lab: 1, share: 1 });

    history.back();
    expect(surface.current.shareLink).toBe(false);
    expect(surface.current.step).toBe(2);
    expect(history.state).toEqual({ lab: 1, step: 2 });

    surface.current = { ...surface.current, shareLink: true };
    syncHistoryTrap(history, surface.current, trap);
    surface.current = { ...surface.current, shareLink: false };
    syncHistoryTrap(history, surface.current, trap);
    expect(surface.current.step).toBe(2);
    expect(history.state).toEqual({ lab: 1, step: 2 });
  });
});
