import { partPivot } from "../../../model/closures/registry.ts";
import { CARTON_MARK_MAX_W } from "../../../geometry/logos.ts";
import { BrandMark, InsertBlock, MARK_FACE_GAP, PrismMesh, PullTab, Ribbon } from "../kit.tsx";
import type { ClosureBuilder } from "../types.ts";

/**
 * Flat chord whose edges stay within `gap` mm of the cylinder.
 * A 52 mm plane on a ~34 mm radius otherwise floats about 14 mm off the sides.
 */
export function tubeMarkWidth(radius: number, gap = 1.4): number {
  const r = Math.max(gap + 0.4, radius);
  const half = Math.sqrt(Math.max(0, r * r - (r - gap) ** 2));
  // cartonMarkSize applies the 0.92 inset. Passing it here as well shrunk the word twice.
  return Math.min(CARTON_MARK_MAX_W / 0.92, half * 2);
}

/** Round tube. The cap lifts off the canister. */
const Tube: ClosureBuilder = ({ fit, spec, dims, bind, ribbon, pullTab, latch }) => {
  const lid = partPivot(spec, "lid", dims);
  const radius = Math.min(dims.w, dims.d) / 2 - 0.4;
  const wall = Math.max(dims.wall, 1.6);
  const inner = Math.max(radius * 0.72, radius - wall);
  const lidR = radius + 0.7;
  const lidInner = Math.max(lidR - wall, lidR * 0.78);
  const tied = ribbon || latch === "ribbon";
  return (
    <group>
      <PrismMesh radius={radius - 0.15} inner={0} height={dims.wall} sides={48} />
      <PrismMesh radius={radius} inner={inner} height={dims.h} sides={48} />
      <InsertBlock fit={fit} />
      <group ref={bind("lid")} userData={{ hinge: "lid" }} position={lid}>
        <PrismMesh radius={lidR} inner={lidInner} height={Math.max(wall, dims.lidH - dims.wall)} sides={48} />
        <PrismMesh radius={lidR} inner={0} height={dims.wall} sides={48} y={Math.max(0, dims.lidH - dims.wall)} />
        {pullTab && <PullTab w={dims.w} z={lidR + 1} />}
      </group>
      <BrandMark w={tubeMarkWidth(radius)} y={dims.h * 0.48} z={radius + MARK_FACE_GAP} />
      {tied && <Ribbon w={dims.w} h={dims.h * 0.42} d={radius * 2} y={dims.h * 0.55} />}
    </group>
  );
};

export default Tube;
