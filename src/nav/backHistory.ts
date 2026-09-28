export interface HistoryLike {
  readonly state: unknown;
  pushState(data: unknown, unused: string): void;
  back(): void;
  forward(): void;
}

export interface Trap {
  armed: boolean;
  /** Wizard step represented by the entry under the in-app layers. Set on the first sync of a page load. */
  baselineStep?: number;
  /** Wizard step last accounted for. Forward changes above this push one history entry each. */
  wizardStep?: number;
  /** True after this page load has pushed at least one wizard step entry. */
  wizardPushed?: boolean;
  /** Discarding history entries above a step the UI already jumped back to. */
  dropping?: boolean;
  dropTarget?: number;
  /** The push that cut the forward list is being undone so it does not stay current. */
  neutralizing?: boolean;
  /** A forward landing on a stale entry is being undone. */
  bounce?: boolean;
  /** Mirror of entries pushed on this page, so a pop can tell Back from Forward. */
  stack?: unknown[];
  index?: number;
  /** Sequence of the entry now showing. History states carry the same number across a reload. */
  seq?: number;
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
  /** The copy-failed share URL is on screen. Back closes it before a wizard step. */
  shareLink: boolean;
  /** The carton lid is open. One Back closes it, before the stage or wizard step. */
  boxOpen: boolean;
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
  | "share"
  | "box"
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

function historySeq(state: unknown): number | undefined {
  if (!isLabHistory(state)) return undefined;
  const seq = (state as { seq?: unknown }).seq;
  return typeof seq === "number" && Number.isInteger(seq) && seq >= 0 ? seq : undefined;
}

function sameState(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!isLabHistory(a) || !isLabHistory(b)) return false;
  return historyWizardStep(a) === historyWizardStep(b)
    && isOverlayGuard(a) === isOverlayGuard(b)
    && historySeq(a) === historySeq(b)
    && isShareGuard(a) === isShareGuard(b);
}

function ensureStack(trap: Trap, current: unknown) {
  if (trap.seq === undefined) trap.seq = historySeq(current);
  if (trap.stack) return;
  trap.stack = [current];
  trap.index = 0;
}

function nextSeq(trap: Trap, current: unknown): number {
  let max = historySeq(current) ?? 0;
  if (typeof trap.seq === "number" && trap.seq > max) max = trap.seq;
  for (const entry of trap.stack ?? []) {
    const seq = historySeq(entry);
    if (typeof seq === "number" && seq > max) max = seq;
  }
  return max + 1;
}

function push(history: HistoryLike, trap: Trap, data: unknown) {
  ensureStack(trap, history.state);
  const seq = nextSeq(trap, history.state);
  const stamped = data && typeof data === "object" ? { ...(data as Record<string, unknown>), seq } : data;
  const index = trap.index ?? 0;
  trap.stack!.splice(index + 1);
  trap.stack!.push(stamped);
  trap.index = index + 1;
  trap.seq = seq;
  history.pushState(stamped, "");
  trap.armed = true;
}

/** A step above the one on screen, or a guard left behind after the overlay closed. */
function staleEntry(state: unknown, target: number): boolean {
  if (isOverlayGuard(state)) return true;
  const step = historyWizardStep(state);
  return typeof step === "number" && step > target;
}

type PopDir = "back" | "forward" | "unknown";

function isShareGuard(state: unknown): boolean {
  return isLabHistory(state) && (state as { share?: unknown }).share === 1;
}

/**
 * Direction of one pop.
 * Entries this page pushed are matched against the mirror.
 * Each entry carries a running `seq`. After a reload the mirror is only the current entry,
 * so a lower seq is Back and a higher seq is Forward. The document under the stack has no seq
 * and is Back. A step number is the fallback for entries written before seq existed.
 */
function notePop(trap: Trap, state: unknown, fromStep: number | undefined): PopDir {
  const departed = trap.seq;
  const revealedSeq = historySeq(state);
  if (typeof revealedSeq === "number") trap.seq = revealedSeq;
  else if (!isLabHistory(state)) trap.seq = undefined;

  const stack = trap.stack;
  const index = trap.index ?? 0;
  let dir: PopDir = "unknown";
  if (stack) {
    if (index > 0 && sameState(stack[index - 1], state)) {
      trap.index = index - 1;
      dir = "back";
    } else if (index + 1 < stack.length && sameState(stack[index + 1], state)) {
      trap.index = index + 1;
      dir = "forward";
    }
  }
  if (dir === "unknown" && typeof departed === "number" && typeof revealedSeq === "number" && revealedSeq !== departed) {
    dir = revealedSeq > departed ? "forward" : "back";
  }
  if (dir === "unknown" && typeof departed === "number" && !isLabHistory(state)) dir = "back";
  if (dir === "unknown") {
    const revealed = historyWizardStep(state);
    if (typeof fromStep === "number" && typeof revealed === "number" && revealed !== fromStep) {
      return revealed > fromStep ? "forward" : "back";
    }
  }
  return dir;
}

/**
 * Step to show after Back pops a wizard entry.
 * The revealed entry carries the step. The original document entry does not, so the page-load step is used.
 * A guard is not a wizard step.
 */
export function wizardStepAfterPop(history: HistoryLike, trap: Trap): number | null {
  if (isOverlayGuard(history.state)) return null;
  const revealed = historyWizardStep(history.state);
  if (typeof revealed === "number") return revealed;
  return trap.baselineStep ?? 0;
}

/** One browser Back consumes the top in-app layer. `leave` means the visit itself should end. */
export function backAction(surface: BackSurface): BackAction {
  if (surface.modal) return "modal";
  if (surface.present) return "present";
  if (surface.shareLink) return "share";
  if (surface.palette || surface.help) return "overlays";
  if (surface.solo || surface.aimed) return "selection";
  if (surface.boxOpen) return "box";
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
  shareUrl?: string;
  boxOpen?: boolean;
}): BackSurface {
  const raw = state.design.step;
  const known = typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= 7;
  const wizard = known && raw < 7;
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
    shareLink: Boolean(state.shareUrl),
    wizard,
    step: wizard ? raw : 0,
    boxOpen: state.boxOpen === true,
  };
}

function finishDrop(history: HistoryLike, surface: BackSurface, trap: Trap) {
  if (!isLabHistory(history.state) && surface.step < (trap.baselineStep ?? surface.step)) {
    trap.baselineStep = surface.step;
  }
  trap.wizardStep = surface.step;
  const action = backAction(surface);
  const index = trap.index ?? 0;
  const hasForward = (trap.stack?.length ?? 0) > index + 1;
  if ((action === "leave" || action === "wizard") && hasForward) {
    // Cut steps above this one. Step back onto the entry that already matches, so the cut is only a forward stub.
    trap.neutralizing = true;
    trap.dropping = false;
    push(history, trap, { lab: 1, step: surface.step });
    history.back();
    return;
  }
  trap.dropping = false;
  if (action === "leave" || action === "wizard") {
    trap.armed = action === "wizard";
    return;
  }
  if (isOverlayGuard(history.state)) {
    trap.armed = true;
    return;
  }
  push(history, trap, LAB_HISTORY_STATE);
}

function skipGuard(history: HistoryLike, dir: PopDir) {
  if (dir === "forward") history.forward();
  else history.back();
}

function applyWizard(apply: (action: "wizard") => void, readAfter: () => BackSurface, trap: Trap) {
  apply("wizard");
  const after = readAfter();
  trap.wizardStep = after.step;
  trap.armed = backAction(after) !== "leave";
}

/**
 * Push one history entry per wizard step moved forward.
 * A dialog or a selected part pushes a single guard above those steps, so Back closes it first.
 * A jump back (new design, reset, chat, or the in-app Back) drops entries above the new step
 * so browser Back cannot walk forward through them.
 * Never push when the lab is idle, and never push the step that was already on screen at load.
 */
export function syncHistoryTrap(history: HistoryLike, surface: BackSurface, trap: Trap): void {
  ensureStack(trap, history.state);
  if (!surface.shareLink && isShareGuard(history.state) && !trap.dropping && !trap.bounce && !trap.neutralizing) {
    trap.bounce = true;
    history.back();
    return;
  }
  if (trap.baselineStep === undefined) {
    trap.baselineStep = surface.step;
    trap.wizardStep = surface.step;
  }

  const recorded = trap.wizardStep ?? trap.baselineStep ?? 0;
  if (surface.step < recorded) {
    if (!trap.wizardPushed) trap.baselineStep = surface.step;
    if (!trap.dropping && staleEntry(history.state, surface.step)) {
      trap.dropping = true;
      trap.dropTarget = surface.step;
      trap.wizardStep = surface.step;
      history.back();
      return;
    }
    trap.wizardStep = surface.step;
  } else if (surface.wizard && surface.step > recorded) {
    for (let step = recorded + 1; step <= surface.step; step += 1) {
      push(history, trap, { lab: 1, step });
    }
    trap.wizardStep = surface.step;
    trap.wizardPushed = true;
    trap.armed = true;
  }

  const action = backAction(surface);
  if (action === "share") {
    if (!isShareGuard(history.state)) push(history, trap, { lab: 1, share: 1 });
    trap.armed = true;
    return;
  }
  if (action === "wizard") {
    trap.armed = true;
    return;
  }
  if (action === "leave") return;
  if (isOverlayGuard(history.state)) {
    trap.armed = true;
    return;
  }
  push(history, trap, LAB_HISTORY_STATE);
}

/**
 * Handle one `popstate`.
 * Modals, presentation, search, help, and part selection close before a wizard step changes.
 * A wizard Back lands on the previous step. A higher step or a closed overlay's guard is skipped.
 * An idle pop does not push. If that pop only removed our guard, `history.back()` continues off the site.
 */
export function handleHistoryPop(
  history: HistoryLike,
  surface: BackSurface,
  apply: (action: Exclude<BackAction, "leave">) => void,
  readAfter: () => BackSurface,
  trap: Trap,
): void {
  const dir = notePop(trap, history.state, surface.step);
  if (trap.bounce) {
    trap.bounce = false;
    return;
  }
  if (trap.neutralizing) {
    trap.neutralizing = false;
    trap.dropping = false;
    const after = readAfter();
    trap.wizardStep = after.step;
    trap.armed = backAction(after) !== "leave";
    return;
  }
  if (trap.dropping) {
    const target = trap.dropTarget ?? 0;
    if (staleEntry(history.state, target)) {
      history.back();
      return;
    }
    finishDrop(history, readAfter(), trap);
    return;
  }

  const action = backAction(surface);
  if (action === "leave") {
    // Forward from step 0 only reveals entries this jump already cut. Undo that move.
    if (dir === "forward") {
      trap.bounce = true;
      history.back();
      return;
    }
    // Stale wizard entries are not layers. Skip them, then leave in the same gesture.
    if (isLabHistory(history.state)) {
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
    if (isOverlayGuard(history.state)) {
      skipGuard(history, dir);
      return;
    }
    const revealed = historyWizardStep(history.state);
    if (typeof revealed === "number" && revealed === surface.step) {
      if (dir === "forward") trap.bounce = true;
      history.back();
      return;
    }
    if (typeof revealed === "number") {
      const forwardMove = dir === "forward";
      if (forwardMove && revealed > surface.step) applyWizard(apply, readAfter, trap);
      else if (dir !== "forward" && revealed < surface.step) applyWizard(apply, readAfter, trap);
      else if (forwardMove) history.forward();
      else if (dir === "back") history.back();
      return;
    }
    // A reload records the current step as the baseline, so the document under step 1
    // would otherwise look like that later step. Back from step 1 lands on step 0.
    if (dir === "back" && !isLabHistory(history.state) && surface.step === 1) trap.baselineStep = 0;
    const baseline = trap.baselineStep ?? 0;
    if (dir !== "forward" && baseline < surface.step) applyWizard(apply, readAfter, trap);
    else if (dir === "forward") history.forward();
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
  push(history, trap, LAB_HISTORY_STATE);
}
