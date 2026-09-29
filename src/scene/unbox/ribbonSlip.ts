import * as THREE from "three";

const nodes = new Set<THREE.Group>();

export function trackRibbon(node: THREE.Group, tug: boolean): void {
  node.userData.ribbonTug = tug;
  nodes.add(node);
}

export function untrackRibbon(node: THREE.Group): void {
  nodes.delete(node);
}

/**
 * Fades every ribbon piece together before the lid or tray moves.
 * Open is fully hidden, so the two halves never show a broken end.
 */
export function applyRibbonSlip(openAmount = 0): void {
  const t = Math.min(1, Math.max(0, openAmount));
  const opacity = t <= 0.03 ? 1 : t >= 0.18 ? 0 : 1 - (t - 0.03) / 0.15;
  for (const node of nodes) {
    node.visible = opacity > 0.02;
    node.position.set(0, 0, 0);
    node.rotation.set(0, 0, 0);
    node.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) {
        material.transparent = opacity < 0.98;
        material.opacity = opacity;
        material.depthWrite = opacity > 0.9;
      }
    });
  }
}
