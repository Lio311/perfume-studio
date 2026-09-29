import * as THREE from "three";

/**
 * Flat facing +Z. Vertices start at -π/2 + π/n so a facet, not a corner, points at the camera.
 * Distance from the origin to that facet, and the facet width.
 */
export function prismFrontFacet(radius: number, sides: number): { z: number; width: number; normal: [number, number, number] } {
  const n = Math.max(3, Math.round(sides));
  const step = Math.PI / n;
  return { z: radius * Math.cos(step), width: 2 * radius * Math.sin(step), normal: [0, 0, 1] };
}

function prismAngle(index: number, sides: number): number {
  return (index / sides) * Math.PI * 2 - Math.PI / 2 + Math.PI / sides;
}

/** Thick closed prism. `sides` 48 reads as a tube; 8 is an octagon. Inner radius 0 is a solid cap. */
export function prismShell(outerRadius: number, innerRadius: number, height: number, sides: number): THREE.BufferGeometry {
  const n = Math.max(3, Math.round(sides));
  const outer = Math.max(1, outerRadius);
  const rise = Math.max(0.4, height);
  const shape = new THREE.Shape();
  for (let i = 0; i < n; i += 1) {
    const angle = prismAngle(i, n);
    const x = Math.cos(angle) * outer;
    const y = Math.sin(angle) * outer;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const holeR = innerRadius > 0.4 && innerRadius < outer - 0.25 ? innerRadius : 0;
  if (holeR > 0) {
    const hole = new THREE.Path();
    for (let i = n - 1; i >= 0; i -= 1) {
      const angle = prismAngle(i, n);
      const x = Math.cos(angle) * holeR;
      const y = Math.sin(angle) * holeR;
      if (i === n - 1) hole.moveTo(x, y);
      else hole.lineTo(x, y);
    }
    hole.closePath();
    shape.holes.push(hole);
  }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: rise,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  if (n >= 24) smoothRadialWalls(geo);
  return geo;
}

/**
 * A fine prism reads as a cylinder. Flat facet normals leave vertical bands,
 * so wall vertices point straight out from the axis. Caps stay axial.
 */
function smoothRadialWalls(geo: THREE.BufferGeometry): void {
  const pos = geo.getAttribute("position");
  const norm = geo.getAttribute("normal");
  if (!pos || !norm) return;
  for (let i = 0; i < pos.count; i += 1) {
    if (Math.abs(norm.getY(i)) > 0.45) continue;
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const len = Math.hypot(x, z);
    if (len < 1e-3) continue;
    const rx = x / len;
    const rz = z / len;
    const outward = norm.getX(i) * rx + norm.getZ(i) * rz;
    const sign = outward < 0 ? -1 : 1;
    norm.setXYZ(i, sign * rx, 0, sign * rz);
  }
  norm.needsUpdate = true;
}
