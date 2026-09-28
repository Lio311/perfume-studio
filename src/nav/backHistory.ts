export interface HistoryLike {
  readonly state: unknown;
  pushState(data: unknown, unused: string): void;
  back(): void;
}

export interface Trap {
  armed: boolean;
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
  /** `design.step`, or 7 when the wizard is finished or the field is absent. */
  wizardStep: number;
}

export type BackAction =
  | "modal"
  | "present"
  | "overlays"
  | "selection"
  | "wizard"
  | "stage"
  | "mode"
  | "leave";

export const LAB_HISTORY_STATE = { lab: 1 } as const;

export function isLabHistory(state: unknown): boolean {
  return !!state && typeof state === "object" && (state as { lab?: unknown }).lab === 1;
}

/** One browser Back consumes the top in-app layer. `leave` means the visit itself should end. */
export function backAction(surface: BackSurface): BackAction {
  if (surface.modal) return "modal";
  if (surface.present) return "present";
  if (surface.palette || surface.help) return "overlays";
  if (surface.solo || surface.aimed) return "selection";
  if (surface.wizardStep > 0 && surface.wizardStep < 7) return "wizard";
  if (surface.stage !== "bottle") return "stage";
  if (surface.mode !== "assemble" || surface.explode > 0.02) return "mode";
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
  const step = state.design.step;
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
    wizardStep: typeof step === "number" && Number.isFinite(step) ? step : 7,
  };
}

/** Push a single guard entry while some in-app layer is open. Never push when the lab is idle. */
export function syncHistoryTrap(history: HistoryLike, surface: BackSurface, trap: Trap): void {
  if (backAction(surface) === "leave") return;
  if (isLabHistory(history.state)) {
    trap.armed = true;
    return;
  }
  history.pushState(LAB_HISTORY_STATE, "");
  trap.armed = true;
}

/**
 * Handle one `popstate`.
 * A consumed layer re-arms the guard only when another layer is still open.
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
    if (!trap.armed) return;
    trap.armed = false;
    history.back();
    return;
  }
  apply(action);
  if (backAction(readAfter()) === "leave") {
    trap.armed = false;
    return;
  }
  history.pushState(LAB_HISTORY_STATE, "");
  trap.armed = true;
}
