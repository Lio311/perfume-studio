import * as THREE from "three";
import { MM_TO_M } from "./revolve.ts";

/** Small rounded-rect edge, capped so it stays a corner radius and not a pill. */
export function boxEdgeMm(widthMm: number, heightMm: number, depthMm: number): number {
  const smallest = Math.min(widthMm, heightMm, Math.max(depthMm, 0.2));
  return Math.min(2, smallest * 0.12);
}

/**
 * Rounded-rectangle box. Width along X, height along Y, depth along Z.
 * Base sits on y = 0 and the footprint is centred on X and Z. Units out are metres.
 */
export function extrudeBox(widthMm: number, heightMm: number, depthMm: number): THREE.BufferGeometry {
  const depth = Math.max(depthMm, 0.2);
  const radius = boxEdgeMm(widthMm, heightMm, depth);
  const shape = roundedRect(widthMm, heightMm, radius);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 4,
    steps: 1,
  });
  geometry.translate(0, heightMm / 2, -depth / 2);
  geometry.scale(MM_TO_M, MM_TO_M, MM_TO_M);
  geometry.computeVertexNormals();
  return geometry;
}

function roundedRect(width: number, height: number, radius: number): THREE.Shape {
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w * 0.5, h * 0.5);
  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.absarc(w - r, -h + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(w, h - r);
  shape.absarc(w - r, h - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-w + r, h);
  shape.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-w, -h + r);
  shape.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  return shape;
}
