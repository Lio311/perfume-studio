import type { PartKey } from "../model/types.ts";
import { useLab, type StageMode } from "../store/labStore.ts";

/**
 * A focused part ghosts the others. The box stage keeps the label selected,
 * and that must not fade the carton the label is printed on.
 */
export function partIsGhost(
  state: { aimed: boolean; selected: PartKey | null; solo: PartKey | null; stage: StageMode },
  part: PartKey,
): boolean {
  if (state.stage === "box" && state.selected === "label" && part === "box") return false;
  return Boolean(state.aimed && state.selected && state.selected !== part && !state.solo);
}

export function partClickAction(
  state: { selected: PartKey | null; aimed: boolean; solo: PartKey | null },
  part: PartKey,
): "release" | "select" {
  if (state.solo === part || (state.aimed && state.selected === part)) return "release";
  return "select";
}

let timer = 0;
let partPointer = false;
let swapFlash: { part: PartKey; until: number } | null = null;

export function markSwap(part: PartKey) {
  swapFlash = { part, until: performance.now() + 700 };
}

export function swapFlashOn(part: PartKey): boolean {
  return Boolean(swapFlash && swapFlash.part === part && performance.now() < swapFlash.until);
}

export function clearPartPointer() {
  partPointer = false;
}

export function markPartPointer() {
  partPointer = true;
}

export function consumePartPointer(): boolean {
  const hit = partPointer;
  partPointer = false;
  return hit;
}

export function cancelPartToggle() {
  window.clearTimeout(timer);
  timer = 0;
}

export function releaseFocus() {
  cancelPartToggle();
  const lab = useLab.getState();
  if (lab.aimed || lab.solo) lab.showFull();
  else if (lab.selected) lab.select(null);
}

export function clickPart(part: PartKey, immediate = false) {
  const lab = useLab.getState();
  if (partClickAction(lab, part) === "release") {
    cancelPartToggle();
    if (immediate) {
      lab.showFull();
      return;
    }
    timer = window.setTimeout(() => {
      timer = 0;
      const now = useLab.getState();
      if (partClickAction(now, part) === "release") now.showFull();
    }, 220);
    return;
  }
  cancelPartToggle();
  lab.select(part);
}

export function doubleClickPart(part: PartKey) {
  cancelPartToggle();
  const lab = useLab.getState();
  if (lab.solo === part) lab.showFull();
  else lab.isolate(part);
}
