import { latheGeometry } from "../../import/lathe.ts";

/** Millimetres in `lathe.ts` become metres in the scan mesh and the GLB. */
export const MM_TO_M = 0.001;

export interface RevolveMesh {
  /** XYZ metres, Y up. Same order as `LatheGeometry`'s position attribute. */
  positions: Float32Array;
  /** Triangle list, same order as `LatheGeometry`'s index. */
  indices: Uint32Array;
  /** Radial segment count. This is the second argument of `LatheGeometry` in `lathe.ts`. */
  segments: number;
}

/**
 * Revolve a schema lathe the same way `lathe.ts` does, then convert millimetres to metres.
 * Body radius is `max(0.1 mm, sample * radiusMm)`. Caps at radius 0 are inserted on the axis.
 */
export function revolveLathe(samples: number[], heightMm: number, radiusMm: number): RevolveMesh {
  const geometry = latheGeometry(samples, heightMm, radiusMm);
  const attribute = geometry.getAttribute("position");
  const positions = new Float32Array(attribute.count * 3);
  for (let index = 0; index < attribute.count; index += 1) {
    positions[index * 3] = attribute.getX(index) * MM_TO_M;
    positions[index * 3 + 1] = attribute.getY(index) * MM_TO_M;
    positions[index * 3 + 2] = attribute.getZ(index) * MM_TO_M;
  }
  const index = geometry.getIndex();
  const indices = new Uint32Array(index ? index.count : 0);
  if (index) {
    for (let cursor = 0; cursor < index.count; cursor += 1) indices[cursor] = index.getX(cursor);
  }
  const segments = geometry.parameters.segments;
  geometry.dispose();
  return { positions, indices, segments };
}
