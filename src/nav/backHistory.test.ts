import { describe, expect, it } from "vitest";
import {
  backAction,
  handleHistoryPop,
  isLabHistory,
  syncHistoryTrap,
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
    wizardStep: 0,
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
    expect(backAction(idle({ wizardStep: 7 }))).toBe("leave");
    expect(backAction(idle({ wizardStep: 0 }))).toBe("leave");
    expect(backAction(idle({ modal: true, wizardStep: 4, aimed: true }))).toBe("modal");
    expect(backAction(idle({ present: true, wizardStep: 4 }))).toBe("present");
    expect(backAction(idle({ help: true, aimed: true }))).toBe("overlays");
    expect(backAction(idle({ aimed: true, wizardStep: 3 }))).toBe("selection");
    expect(backAction(idle({ solo: true }))).toBe("selection");
    expect(backAction(idle({ wizardStep: 2, stage: "box" }))).toBe("wizard");
    expect(backAction(idle({ stage: "together" }))).toBe("stage");
    expect(backAction(idle({ mode: "explode", explode: 0.6 }))).toBe("mode");
    expect(backAction(idle({ explode: 0.4 }))).toBe("mode");
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

  it("steps the wizard, then lets the next back leave without pushing again", () => {
    const { history, popWith } = createHistory();
    const trap: Trap = { armed: false };
    let surface = idle({ wizardStep: 3, stage: "bottle" });
    syncHistoryTrap(history, surface, trap);
    expect(history.length).toBe(2);
    expect(isLabHistory(history.state)).toBe(true);

    const applied: string[] = [];
    popWith(() => {
      handleHistoryPop(
        history,
        surface,
        (action) => {
          applied.push(action);
          if (action === "wizard") surface = { ...surface, wizardStep: surface.wizardStep - 1 };
          if (action === "selection") surface = { ...surface, aimed: false, solo: false };
        },
        () => surface,
        trap,
      );
    });

    history.back();
    expect(applied).toEqual(["wizard"]);
    expect(surface.wizardStep).toBe(2);
    expect(history.pushCount).toBe(2);
    expect(history.left).toBe(false);

    history.back();
    history.back();
    expect(applied).toEqual(["wizard", "wizard", "wizard"]);
    expect(surface.wizardStep).toBe(0);
    expect(history.left).toBe(false);
    expect(trap.armed).toBe(false);

    const pushes = history.pushCount;
    history.back();
    expect(history.left).toBe(true);
    expect(history.pushCount).toBe(pushes);
  });

  it("clears a selection before it steps the wizard", () => {
    const { history, popWith } = createHistory();
    const trap: Trap = { armed: false };
    let surface = idle({ wizardStep: 2, aimed: true });
    syncHistoryTrap(history, surface, trap);
    const applied: string[] = [];
    popWith(() => {
      handleHistoryPop(
        history,
        surface,
        (action) => {
          applied.push(action);
          if (action === "selection") surface = { ...surface, aimed: false, solo: false };
          if (action === "wizard") surface = { ...surface, wizardStep: surface.wizardStep - 1 };
        },
        () => surface,
        trap,
      );
    });
    history.back();
    expect(applied).toEqual(["selection"]);
    expect(surface.wizardStep).toBe(2);
    expect(history.left).toBe(false);
    history.back();
    expect(applied).toEqual(["selection", "wizard"]);
    expect(surface.wizardStep).toBe(1);
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
});
