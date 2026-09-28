import * as THREE from "three";

/** Thick closed prism. `sides` 48 reads as a tube; 8 is an octagon. Inner radius 0 is a solid cap. */
export function prismShell(outerRadius: number, innerRadius: number, height: number, sides: number): THREE.BufferGeometry {
  const n = Math.max(3, Math.round(sides));
  const outer = Math.max(1, outerRadius);
  const rise = Math.max(0.4, height);
  const shape = new THREE.Shape();
  for (let i = 0; i < n; i += 1) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
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
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
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
  return geo;
}
