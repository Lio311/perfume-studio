import type { PartKey } from "../model/types.ts";
import { useLab } from "../store/labStore.ts";

export function partClickAction(
  state: { selected: PartKey | null; aimed: boolean; solo: PartKey | null },
  part: PartKey,
): "release" | "select" {
  if (state.solo === part || (state.aimed && state.selected === part)) return "release";
  return "select";
}

let timer = 0;
let partPointer = false;

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
