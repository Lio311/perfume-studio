import * as THREE from "three";
import { getUnboxPlayback } from "./playback.ts";

const nodes = new Set<THREE.Group>();

export function trackRibbon(node: THREE.Group, tug: boolean): void {
  node.userData.ribbonTug = tug;
  nodes.add(node);
}

export function untrackRibbon(node: THREE.Group): void {
  nodes.delete(node);
}

/** Writes the cinematic ribbon offset. The open pose is slip 0, so nothing snaps. */
export function applyRibbonSlip(): void {
  const play = getUnboxPlayback();
  const slip = play.phase === "playing" ? play.ribbon : 0;
  for (const node of nodes) {
    if (node.userData.ribbonTug === true) {
      node.position.set(0, 0, slip * 14);
      node.rotation.z = 0;
      continue;
    }
    node.position.set(0, slip * 22, 0);
    node.rotation.z = slip * -0.16;
  }
}
