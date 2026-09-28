export interface HistoryLike {
  readonly state: unknown;
  pushState(data: unknown, unused: string): void;
  back(): void;
}

export interface Trap {
  armed: boolean;
  /** Wizard step represented by the entry under the in-app layers. Set on the first sync of a page load. */
  baselineStep?: number;
  /** Wizard step last accounted for. Forward changes above this push one history entry each. */
  wizardStep?: number;
  /** True after this page load has pushed at least one wizard step entry. */
  wizardPushed?: boolean;
}

export interface BackSurface {
  modal: boolean;
  present: boolean;
  palette: boolean;
  help: boolean;
  solo: boolean;
  aimed: boolean;
  stage: "bottle" | "box" | "together";
  mode: string;
  explode: number;
  /**
   * The wizard is choosing the stage, including the carton step.
   * That stage is not its own Back layer. Wizard steps above 0 are.
   */
  wizard: boolean;
  /** Current wizard step. 0 is the bottle step and is not a history layer by itself. */
  step: number;
}

export type BackAction =
  | "modal"
  | "present"
  | "overlays"
  | "selection"
  | "stage"
  | "mode"
  | "wizard"
  | "leave";

export const LAB_HISTORY_STATE = { lab: 1 } as const;

export function isLabHistory(state: unknown): boolean {
  return !!state && typeof state === "object" && (state as { lab?: unknown }).lab === 1;
}

/** Step stored on a wizard history entry. Overlay guards have no step. */
export function historyWizardStep(state: unknown): number | undefined {
  if (!isLabHistory(state)) return undefined;
  const step = (state as { step?: unknown }).step;
  return typeof step === "number" && Number.isInteger(step) && step >= 0 && step <= 7 ? step : undefined;
}

function isOverlayGuard(state: unknown): boolean {
  return isLabHistory(state) && historyWizardStep(state) === undefined;
}

/**
 * Step to show after Back pops a wizard entry.
 * The revealed entry carries the step. The original document entry does not, so the page-load step is used.
 */
export function wizardStepAfterPop(history: HistoryLike, trap: Trap): number {
  const revealed = historyWizardStep(history.state);
  if (typeof revealed === "number") return revealed;
  return trap.baselineStep ?? 0;
}

/** One browser Back consumes the top in-app layer. `leave` means the visit itself should end. */
export function backAction(surface: BackSurface): BackAction {
  if (surface.modal) return "modal";
  if (surface.present) return "present";
  if (surface.palette || surface.help) return "overlays";
  if (surface.solo || surface.aimed) return "selection";
  if (surface.stage !== "bottle" && !surface.wizard) return "stage";
  if (surface.mode !== "assemble" || surface.explode > 0.02) return "mode";
  if (surface.wizard && surface.step > 0) return "wizard";
  return "leave";
}

export function backSurface(state: {
  modal: unknown;
  present: boolean;
  palette: boolean;
  help: boolean;
  solo: unknown;
  aimed: boolean;
  stage: "bottle" | "box" | "together";
  mode: string;
  explode: number;
  design: { step?: number };
}): BackSurface {
  const raw = state.design.step;
  const step = typeof raw === "number" && Number.isInteger(raw) ? raw : 0;
  const wizard = step >= 0 && step < 7;
  return {
    modal: Boolean(state.modal),
    present: state.present,
    palette: state.palette,
    help: state.help,
    solo: Boolean(state.solo),
    aimed: state.aimed,
    stage: state.stage,
    mode: state.mode,
    explode: state.explode,
    wizard,
    step: wizard ? step : 0,
  };
}

/**
 * Push one history entry per wizard step moved forward.
 * A dialog or a selected part pushes a single guard above those steps, so Back closes it first.
 * Never push when the lab is idle, and never push the step that was already on screen at load.
 */
export function syncHistoryTrap(history: HistoryLike, surface: BackSurface, trap: Trap): void {
  if (trap.baselineStep === undefined) {
    trap.baselineStep = surface.step;
    trap.wizardStep = surface.step;
  }

  const recorded = trap.wizardStep ?? trap.baselineStep ?? 0;
  if (surface.wizard && surface.step > recorded) {
    for (let step = recorded + 1; step <= surface.step; step += 1) {
      history.pushState({ lab: 1, step }, "");
    }
    trap.wizardStep = surface.step;
    trap.wizardPushed = true;
    trap.armed = true;
  } else if (surface.step < recorded) {
    trap.wizardStep = surface.step;
    if (!trap.wizardPushed) trap.baselineStep = surface.step;
  }

  const action = backAction(surface);
  if (action === "wizard") {
    trap.armed = true;
    return;
  }
  if (action === "leave") return;
  if (isOverlayGuard(history.state)) {
    trap.armed = true;
    return;
  }
  history.pushState(LAB_HISTORY_STATE, "");
  trap.armed = true;
}

/**
 * Handle one `popstate`.
 * Modals, presentation, search, help, and part selection close before a wizard step changes.
 * A wizard Back lands on the previous step entry and does not push another one.
 * An idle pop does not push. If that pop only removed our guard, `history.back()` continues off the site.
 */
export function handleHistoryPop(
  history: HistoryLike,
  surface: BackSurface,
  apply: (action: Exclude<BackAction, "leave">) => void,
  readAfter: () => BackSurface,
  trap: Trap,
): void {
  const action = backAction(surface);
  if (action === "leave") {
    // Finished-wizard entries are not layers anymore. Skip them and leave, same as a leftover guard.
    if (!surface.wizard && historyWizardStep(history.state) !== undefined) {
      trap.armed = true;
      history.back();
      return;
    }
    if (!trap.armed) return;
    trap.armed = false;
    history.back();
    return;
  }
  if (action === "wizard") {
    const revealed = historyWizardStep(history.state);
    // A guard left above this same step (the dialog was already closed). Skip it.
    if (revealed === surface.step) {
      history.back();
      return;
    }
    apply(action);
    const after = readAfter();
    trap.wizardStep = after.step;
    trap.armed = backAction(after) !== "leave";
    return;
  }
  apply(action);
  const after = readAfter();
  const next = backAction(after);
  if (next === "leave" || next === "wizard") {
    trap.armed = next === "wizard";
    if (next === "wizard") trap.wizardStep = after.step;
    return;
  }
  history.pushState(LAB_HISTORY_STATE, "");
  trap.armed = true;
}
