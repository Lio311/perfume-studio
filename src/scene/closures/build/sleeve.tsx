import { partPivot } from "../../../model/closures/registry.ts";
import { BrandMark, InsertBlock, MARK_FACE_GAP, PullTab, Ribbon, Skin, Tub } from "../kit.tsx";
import type { ClosureBuilder } from "../types.ts";

/** Tray depth that clears both sleeve walls by 0.3 mm. */
export function sleeveInnerDepth(depth: number, wall: number): number {
  return depth - 2 * wall - 0.6;
}

/** Brand 0.2 mm proud of the inner tray face, still behind the sleeve wall. */
export function sleeveInnerMarkZ(depth: number, wall: number): number {
  return sleeveInnerDepth(depth, wall) / 2 + MARK_FACE_GAP;
}

const Sleeve: ClosureBuilder = ({ fit, spec, dims, bind, ribbon, pullTab, latch, shellOnly, window }) => {
  const sleeve = partPivot(spec, "sleeve", dims);
  const innerW = dims.w - dims.wall * 1.6;
  const innerD = sleeveInnerDepth(dims.d, dims.wall);
  const innerH = dims.h * 0.9;
  return (
    <group>
      {!shellOnly && (
        <group>
          <Tub w={innerW} h={innerH} d={innerD} wall={dims.wall} />
          <InsertBlock fit={fit} />
          <BrandMark w={innerW} y={innerH * 0.42} z={sleeveInnerMarkZ(dims.d, dims.wall)} />
        </group>
      )}
      <group ref={bind("sleeve")} userData={{ hinge: "sleeve" }} position={sleeve}>
        <mesh position={[0, 0, -dims.d / 2 + dims.wall / 2]}><boxGeometry args={[dims.w, dims.h, dims.wall]} /><Skin /></mesh>
        <mesh position={[0, 0, dims.d / 2 - dims.wall / 2]}><boxGeometry args={[dims.w, dims.h, dims.wall]} /><Skin /></mesh>
        <mesh position={[-dims.w / 2 + dims.wall / 2, 0, 0]}><boxGeometry args={[dims.wall, dims.h, dims.d]} /><Skin /></mesh>
        <mesh position={[dims.w / 2 - dims.wall / 2, 0, 0]}><boxGeometry args={[dims.wall, dims.h, dims.d]} /><Skin /></mesh>
        {pullTab && <PullTab w={dims.w} z={dims.d / 2 + 0.8} />}
        <BrandMark w={dims.w} y={0} z={dims.d / 2 + MARK_FACE_GAP} />
        {(ribbon || latch === "ribbon") && <Ribbon w={dims.w} h={dims.h * 0.5} d={dims.d} y={-dims.h * 0.15} />}
        {window && (
          <mesh position={[0, 0, dims.d / 2 + 0.35]}>
            {window.shape === "circle" ? <circleGeometry args={[Math.min(dims.w, dims.h) * 0.16, 28]} /> : <planeGeometry args={[dims.w * 0.46, dims.h * 0.42]} />}
            <meshPhysicalMaterial color="#d5dde6" roughness={0.06} transmission={window.transparent ? 0.72 : 0} transparent opacity={window.transparent ? 0.4 : 0.92} thickness={0.6} />
          </mesh>
        )}
      </group>
    </group>
  );
};

export default Sleeve;
